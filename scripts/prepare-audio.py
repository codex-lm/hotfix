#!/usr/bin/env python3
"""Prepare optional Hotfix recordings without changing a manifest or source.

Examples:
  python scripts/prepare-audio.py --input .qa/audio-source/title.mp3 \
    --output assets/audio/music/title --kind music --duration 75 \
    --loop-crossfade 0.35 --source-service Suno --source-url https://suno.com/song/ID
  python scripts/prepare-audio.py --input .qa/audio-source/deploy.wav \
    --output assets/audio/sfx/deploy --kind cue --source-service ElevenLabs

Requires ffmpeg and ffprobe already installed. Installs nothing, never edits or
deletes the input, and refuses existing outputs unless --overwrite is explicit.
Output prefix produces .ogg, .m4a and .audit.json. The audit proves conversion
properties; it is not a grant of rights or evidence of a subscription plan.
"""

from __future__ import annotations

import argparse
from datetime import datetime, timezone
import hashlib
import json
import math
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tempfile


def execute(arguments: list[str]) -> subprocess.CompletedProcess:
    result = subprocess.run(arguments, capture_output=True, text=True, encoding="utf-8", errors="replace")
    if result.returncode:
        raise RuntimeError(result.stderr[-7000:] or f"Command failed: {arguments[0]}")
    return result


def digest(filename: Path) -> str:
    value = hashlib.sha256()
    with filename.open("rb") as source:
        for block in iter(lambda: source.read(1024 * 1024), b""):
            value.update(block)
    return value.hexdigest()


def probe(ffprobe: str, filename: Path) -> dict:
    data = json.loads(execute([ffprobe, "-v", "error", "-show_format", "-show_streams", "-of", "json", str(filename)]).stdout)
    audio = next((stream for stream in data.get("streams", []) if stream.get("codec_type") == "audio"), None)
    if audio is None:
        raise ValueError(f"No audio stream in {filename.name}")
    return {
        "codec": audio.get("codec_name"), "sampleRate": int(audio.get("sample_rate", 0)),
        "channels": audio.get("channels"),
        "durationSeconds": float(data.get("format", {}).get("duration") or audio.get("duration") or 0),
        "bytes": filename.stat().st_size,
    }


def number(value) -> float | None:
    try:
        result = float(value)
        return result if math.isfinite(result) else None
    except (TypeError, ValueError):
        return None


def measure(ffmpeg: str, filename: Path, integrated: float, lra: float) -> dict:
    analysis = execute([ffmpeg, "-hide_banner", "-nostdin", "-i", str(filename), "-map", "0:a:0", "-vn", "-af",
                        f"loudnorm=I={integrated}:LRA={lra}:TP=-2.3:print_format=json", "-f", "null", "-"])
    matches = re.findall(r'\{\s*"input_i".*?\}', analysis.stderr, re.DOTALL)
    if not matches:
        raise RuntimeError("FFmpeg did not report loudness measurements")
    raw = json.loads(matches[-1])
    return {"integratedLUFS": number(raw.get("input_i")), "truePeakDbTP": number(raw.get("input_tp")),
            "loudnessRangeLU": number(raw.get("input_lra")), "raw": raw}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--input", required=True, type=Path, help="Existing downloaded recording; never modified")
    parser.add_argument("--output", required=True, type=Path, help="New output prefix, without an extension")
    parser.add_argument("--kind", required=True, choices=("music", "cue"))
    parser.add_argument("--start", type=float, default=0, help="Explicit excerpt start in seconds")
    parser.add_argument("--duration", type=float, help="Explicit maximum excerpt duration in seconds")
    parser.add_argument("--loop-crossfade", type=float, default=0, help="Music only: tail-to-head overlap in seconds; shortens the loop by this amount")
    parser.add_argument("--no-trim", action="store_true", help="Preserve cue leading/trailing silence (music is never silence-trimmed)")
    parser.add_argument("--source-service", default="unverified")
    parser.add_argument("--source-url", default="", help="Observed source page URL, without credentials")
    parser.add_argument("--source-model", default="unverified")
    parser.add_argument("--source-plan", default="unverified")
    parser.add_argument("--rights-note", default="Not verified by this conversion script")
    parser.add_argument("--ffmpeg", default=shutil.which("ffmpeg"))
    parser.add_argument("--ffprobe", default=shutil.which("ffprobe"))
    parser.add_argument("--overwrite", action="store_true", help="Replace only this prefix's three derived outputs")
    args = parser.parse_args()
    if not args.ffmpeg or not args.ffprobe:
        parser.error("ffmpeg and ffprobe must already be installed and available on PATH or explicitly supplied")
    source = args.input.resolve(strict=True)
    prefix = args.output.resolve()
    output_paths = {"vorbis": Path(str(prefix) + ".ogg"), "aac": Path(str(prefix) + ".m4a")}
    audit_path = Path(str(prefix) + ".audit.json")
    if source in [*output_paths.values(), audit_path]:
        parser.error("The source must be distinct from every derived output")
    for filename in [*output_paths.values(), audit_path]:
        if filename.exists() and filename.samefile(source):
            parser.error("A derived output resolves to the source file")
    if args.start < 0 or not math.isfinite(args.start) or (args.duration is not None and (not math.isfinite(args.duration) or args.duration <= 0)):
        parser.error("Start must be finite and nonnegative; duration must be finite and positive")
    if not math.isfinite(args.loop_crossfade) or args.loop_crossfade < 0 or (args.kind != "music" and args.loop_crossfade):
        parser.error("Loop crossfade must be nonnegative and is available only for music")
    if not args.overwrite:
        for filename in [*output_paths.values(), audit_path]:
            if filename.exists():
                parser.error(f"Derived output already exists: {filename}; choose a new prefix or use --overwrite")
    prefix.parent.mkdir(parents=True, exist_ok=True)
    source_hash = digest(source)
    source_info = probe(args.ffprobe, source)
    if args.start >= source_info["durationSeconds"]:
        parser.error("Excerpt start must precede the source end")
    integrated = -22 if args.kind == "music" else -20
    loudness_range = 7 if args.kind == "music" else 3
    channels = 2 if args.kind == "music" else 1
    warnings = []
    # Keep the AI service/model/source provenance explicit in the derived
    # file. Do not copy account handles or billing details from source tags.
    provenance_comment = (f"Hotfix game audio; service={args.source_service}; model={args.source_model}; "
                          f"plan={args.source_plan}; source={args.source_url or 'unverified'}")
    source_filters = [f"atrim=start={args.start}" + (f":duration={args.duration}" if args.duration else ""), "asetpts=PTS-STARTPTS"]
    if args.kind == "cue" and not args.no_trim:
        # Reverse the short cue to trim its tail. Negative stop_periods would
        # remove intentional interior pauses, so they are deliberately unused.
        source_filters.extend([
            "silenceremove=start_periods=1:start_duration=0.01:start_threshold=-52dB:start_silence=0.015",
            "areverse", "silenceremove=start_periods=1:start_duration=0.01:start_threshold=-52dB:start_silence=0.025", "areverse",
        ])
    outputs = []
    with tempfile.TemporaryDirectory(prefix="hotfix-audio-") as temporary:
        processed = Path(temporary) / "processed.wav"
        execute([args.ffmpeg, "-hide_banner", "-loglevel", "error", "-nostdin", "-y", "-i", str(source), "-map", "0:a:0", "-vn",
                 "-af", ",".join(source_filters), "-ar", "44100", "-ac", str(channels), "-c:a", "pcm_f32le", str(processed)])
        processed_info = probe(args.ffprobe, processed)
        if processed_info["durationSeconds"] <= 0:
            raise ValueError("No audible samples remain after trimming")
        if args.loop_crossfade:
            duration = processed_info["durationSeconds"]
            crossfade = args.loop_crossfade
            if duration <= crossfade * 3:
                raise ValueError("A loop must be longer than three crossfade lengths")
            looped = Path(temporary) / "looped.wav"
            graph = (f"[0:a]asplit=3[main][tail][head];"
                     f"[main]atrim=start={crossfade}:end={duration-crossfade},asetpts=PTS-STARTPTS[mid];"
                     f"[tail]atrim=start={duration-crossfade}:end={duration},asetpts=PTS-STARTPTS[t];"
                     f"[head]atrim=start=0:end={crossfade},asetpts=PTS-STARTPTS[h];"
                     f"[t][h]acrossfade=d={crossfade}:c1=qsin:c2=qsin[seam];"
                     f"[mid][seam]concat=n=2:v=0:a=1[out]")
            execute([args.ffmpeg, "-hide_banner", "-loglevel", "error", "-nostdin", "-y", "-i", str(processed), "-filter_complex", graph,
                     "-map", "[out]", "-ar", "44100", "-ac", str(channels), "-c:a", "pcm_f32le", str(looped)])
            processed = looped
            processed_info = probe(args.ffprobe, processed)
            warnings.append("Tail/head crossfade is technically continuous; musical loop quality still requires listening.")
        first = measure(args.ffmpeg, processed, integrated, loudness_range)
        if first["truePeakDbTP"] is None:
            raise ValueError("The source contains no measurable audio")
        if first["integratedLUFS"] is None:
            # EBU R128 cannot report integrated loudness for very short cues.
            # Keep that limitation explicit instead of fabricating a LUFS value.
            if args.kind != "cue":
                raise ValueError("Music is too short for integrated-loudness analysis")
            normalization = f"volume={-8-first['truePeakDbTP']:.5f}dB"
            normalization_mode = "peak-fallback-short-cue"
            warnings.append("Cue is too short for finite EBU R128 integrated loudness; normalized to -8 dBTP instead. The -20 LUFS target is unverified.")
        else:
            raw = first["raw"]
            normalization = (f"loudnorm=I={integrated}:LRA={loudness_range}:TP=-2.3:"
                             f"measured_I={raw['input_i']}:measured_LRA={raw['input_lra']}:measured_TP={raw['input_tp']}:"
                             f"measured_thresh={raw['input_thresh']}:offset={raw['target_offset']}:linear=true:print_format=json")
            normalization_mode = "ebu-r128-two-pass"
        for codec, output in output_paths.items():
            codec_options = ["-c:a", "libvorbis", "-b:a", "128k"] if codec == "vorbis" else ["-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart"]
            extra_gain = 0.0
            for attempt in range(2):
                filters = normalization + (f",volume={extra_gain:.5f}dB" if extra_gain else "")
                execute([args.ffmpeg, "-hide_banner", "-loglevel", "error", "-nostdin", "-y", "-i", str(processed), "-map", "0:a:0", "-vn",
                         "-map_metadata", "-1", "-metadata", f"comment={provenance_comment}", "-metadata", f"title=Hotfix / {prefix.name}",
                         "-af", filters, "-ar", "44100", "-ac", str(channels), *codec_options, str(output)])
                measured = measure(args.ffmpeg, output, integrated, loudness_range)
                peak = measured["truePeakDbTP"]
                if peak is not None and peak <= -2:
                    break
                if peak is None:
                    raise ValueError(f"Encoded output has no measurable audio: {output.name}")
                extra_gain -= peak + 2.15
            else:
                raise ValueError(f"Encoded output still exceeds -2 dBTP after correction: {output.name}")
            info = probe(args.ffprobe, output)
            if info["codec"] != codec or info["sampleRate"] != 44100 or info["channels"] != channels:
                raise ValueError(f"Unexpected encoded format: {output.name}: {info}")
            if abs(info["durationSeconds"] - processed_info["durationSeconds"]) > 0.15:
                raise ValueError(f"Encoded duration differs from prepared audio: {output.name}")
            if measured["integratedLUFS"] is not None and abs(measured["integratedLUFS"] - integrated) > 1.25:
                warnings.append(f"{output.name}: measured {measured['integratedLUFS']} LUFS differs from target {integrated}; review required.")
            outputs.append({"file": output.name, "sha256": digest(output), **info,
                            "integratedLUFS": measured["integratedLUFS"], "truePeakDbTP": measured["truePeakDbTP"],
                            "loudnessRangeLU": measured["loudnessRangeLU"], "postEncodingGainDb": extra_gain})
    if digest(source) != source_hash:
        raise RuntimeError("Source hash changed during conversion")
    audit = {
        "schemaVersion": 1, "convertedAtUTC": datetime.now(timezone.utc).isoformat(),
        "source": {"file": source.name, "sha256": source_hash, **source_info, "service": args.source_service,
                   "url": args.source_url, "model": args.source_model, "plan": args.source_plan, "rightsNote": args.rights_note},
        "ffmpegVersion": execute([args.ffmpeg, "-version"]).stdout.splitlines()[0],
        "processing": {"kind": args.kind, "startSeconds": args.start, "requestedDurationSeconds": args.duration,
                       "trimSilence": args.kind == "cue" and not args.no_trim, "loopCrossfadeSeconds": args.loop_crossfade,
                       "loopDurationSeconds": processed_info["durationSeconds"], "normalizationMode": normalization_mode,
                       "targetIntegratedLUFS": integrated, "maximumTruePeakDbTP": -2,
                       "encoderHeadroomTargetDbTP": -2.3, "sampleRate": 44100, "channels": channels},
        "publishedProvenanceComment": provenance_comment,
        "outputs": outputs, "warnings": warnings,
    }
    audit_path.write_text(json.dumps(audit, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(json.dumps({"audit": str(audit_path), "outputs": outputs, "warnings": warnings}, indent=2, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (ValueError, RuntimeError, OSError) as error:
        print(f"Audio preparation failed: {error}", file=sys.stderr)
        raise SystemExit(1)
