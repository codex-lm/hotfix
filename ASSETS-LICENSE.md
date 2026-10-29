# Hotfix — media provenance

## Included in this version

The game code, CSS, inline SVG icons, favicon and canvas drawings are original
Hotfix work, copyright © 2026 Cédric Bernadac, under the MIT license in `LICENSE`.
The bundled Barlow and JetBrains Mono fonts have their own SIL Open Font License
1.1; their complete licenses and source hashes are in `assets/fonts/`.
The unmodified LOB7 Rooms SDK is documented in `THIRD_PARTY_NOTICES.md`.

The game includes the ElevenLabs and Suno recordings listed below, under
separate service-specific terms. No Blender renders are included. The image
manifest remains empty; the game draws procedural substitutes. Missing audio
cues produce silence.

## Included ElevenLabs sound effects

These recordings are **not covered by the MIT license and are not CC0**.
They are incorporated as Hotfix game media, not offered as a sound library.
The signed-in generating account's **Starter** plan and the **v3** Sound
Effects model were observed in the root browser session on 2026-10-28.
Each source WAV is retained locally outside the published tree in ignored
`.qa/audio-source/`; the original download is preserved as well.

| Game files | Generated | Service / plan | Source and selection | Technical preparation |
| --- | --- | --- | --- | --- |
| `assets/audio/sfx/move.ogg`, `move.mp3` | 2026-10-28 | ElevenLabs Sound Effects v3 / Starter | [Generation history](https://elevenlabs.io/app/sound-effects/history?id=HGwI723N3HDOE5pi2VXs), first of four displayed variants | Mono 44.1 kHz, 0.372 s, OGG Vorbis 128 kbit/s and MP3 192 kbit/s fallback; silence trimmed; peak approximately −8 dBTP. |
| `assets/audio/sfx/patch-select.ogg`, `patch-select.mp3` | 2026-10-28 | ElevenLabs Sound Effects v3 / Starter | [Generation history](https://elevenlabs.io/app/sound-effects/history?id=57l9vp5ROz4qF0gTgC40), first of four displayed variants | Mono 44.1 kHz, 0.203 s, OGG Vorbis 128 kbit/s and MP3 192 kbit/s fallback; silence trimmed; peak approximately −8 dBTP. |
| `assets/audio/sfx/deploy.ogg`, `deploy.mp3` | 2026-10-28 | ElevenLabs Sound Effects v3 / Starter | [Generation history](https://elevenlabs.io/app/sound-effects/history?id=7kV7STaR841nMPJzeV8k), first displayed variant | Mono 44.1 kHz, 0.389 s, OGG Vorbis 128 kbit/s and MP3 192 kbit/s fallback; silence trimmed; peak approximately −8 dBTP. |
| `assets/audio/sfx/victory.ogg`, `victory.mp3` | 2026-10-28 | ElevenLabs Sound Effects v3 / Starter | [Generation history](https://elevenlabs.io/app/sound-effects/history?id=Jqba3Fsx3fjBSpCCAipG), first of four displayed variants | Mono 44.1 kHz, 0.853 s, OGG Vorbis 128 kbit/s and MP3 192 kbit/s fallback; silence trimmed; approximately −20 LUFS, true peak below −3.6 dBTP. |

The movement, patch-selection and deployment cues are too short for a finite EBU R128
integrated loudness measurement. Their conversions use an explicitly recorded
peak fallback; the −20 LUFS target is not claimed as verified for these cues. File hashes,
full prompts, model/plan evidence and conversion measurements
are in `assets/audio/provenance.json` and the adjacent `*.audit.json` files.
Selection was deterministic from the first displayed variant; no listening
comparison or subjective audio-quality approval is claimed.

Applicable official sources checked on 2026-10-28:

- [ElevenCreative Terms, Exhibit 4: Sound Effects](https://elevenlabs.io/creative-terms).
- [ElevenLabs Terms of Service](https://elevenlabs.io/terms-of-use), including the linked terms for the customer's applicable region.
- [ElevenLabs Prohibited Use Policy](https://elevenlabs.io/use-policy).
- [Official billing documentation](https://elevenlabs.io/docs/overview/administration/billing).

The official billing documentation associates paid-plan generation with
commercial rights, subject to the applicable agreement. Exhibit 4 permits
incorporation into games under those terms and restricts standalone output,
isolated audio files/samples and sound-library distribution. This repository
does not grant a separate license to extract, relicense or redistribute these
recordings. Keep these media exceptions with any permitted game distribution;
the MIT license applies to the original code and procedural drawings only.

## Included Suno music

The music is **not covered by the MIT license and is not CC0**. The root
browser session observed the **Premier** plan and **v6-mini** model during
generation, followed by the official song-download flow. The downloaded MP3s
and their original metadata are retained privately in ignored `.qa/audio-source/`;
the conversions used those official MP3s. Published derivatives include an
explicit Suno/model/plan/source provenance comment without an account handle.

| Game files | Generated | Source | Preparation and verified measurements |
| --- | --- | --- | --- |
| `assets/audio/music/title.ogg`, `title.mp3` | 2026-10-28 | [Hotfix — Night Shift](https://suno.com/song/e570e8a5-ac7f-4158-9986-c3e9669e2c99), selected second take | Stereo 44.1 kHz, 75.000 s, Vorbis 128 kbit/s and MP3 192 kbit/s fallback. Two-pass normalization: approximately −22 LUFS, true peak below −8.5 dBTP. A 0.35 s tail/head crossfade prepares the loop. |
| `assets/audio/music/gameplay.ogg`, `gameplay.mp3` | 2026-10-28 | [Hotfix — Maintenance Window](https://suno.com/song/2ab38d5e-c573-4259-a36b-532defe7bd15), selected first take | Stereo 44.1 kHz, 120.000 s, Vorbis 128 kbit/s and MP3 192 kbit/s fallback. Two-pass normalization: approximately −22 LUFS, true peak below −7.8 dBTP. A 0.35 s tail/head crossfade prepares the loop. |

The takes were selected by their displayed duration rather than by a listening
comparison. The prompts requested instrumental music; no independent listening
review of instrumentation or the musical loop seam is claimed. Technical
decoding, duration, format, loudness and peak measurements are verified in the
adjacent audit. Full prompt, download evidence and source/output hashes are
recorded in `assets/audio/provenance.json` and the adjacent `music/*.audit.json`.

Official sources checked on 2026-10-28:

- [Suno Terms](https://suno.com/terms), revised 2026-08-10 and effective 2026-09-03.
- [Rights with a paid subscription](https://help.suno.com/en/articles/9601665).
- [Ownership of generated music](https://help.suno.com/en/articles/2416769).

These sources describe commercial use for qualifying paid-plan output obtained
through a permitted official download, including use in video games, subject
to the terms. They do not guarantee copyright protection. This repository
does not assert a separate MIT, CC0 or other freely reusable license for the
recording; preserve its provenance and applicable media terms.

## Future Blender deliveries

`ASSETS-BRIEF.md` requests original Blender renders from Kimi K3.1 under the
direction of Cédric Bernadac. The requested delivery license is CC0-1.0.
That request is not a claim that unreceived work has already been dedicated
to CC0. Before adding a delivery, record the creator, generation/delivery date,
source `.blend` location, file list and confirmed CC0 dedication here.

## Further music and sound deliveries

The brief requests Suno music and ElevenLabs sound cues. Before including any
recording, add a row below recording its exact filename, generation date,
service/model, generating account/plan and the applicable media terms and
permission for the intended distribution. Do not describe those recordings
as MIT or CC0 merely because they ship with this repository.

| File | Generated | Service/model | Account/plan | Applicable terms and use rights |
| --- | --- | --- | --- | --- |
| See the included-media tables above | 2026-10-28 | ElevenLabs Sound Effects v3; Suno v6-mini | Starter / Premier observed | Service-specific terms linked above; excluded from MIT and CC0 |

The publisher verifies media rights for the actual generating account before
publication. `assets/catalog.json` is a delivery checklist, not media evidence.

## LOB7 static-export derivation

This branch is derived from [source commit a375fb26b66847e8eed136fc3f1f6016d229bfe8](https://github.com/codex-lm/hotfix/commit/a375fb26b66847e8eed136fc3f1f6016d229bfe8). The development branch keeps the original AAC fallbacks, conversion tool and full tests. LOB7 rejects M4A files, so this export preserves every OGG byte and replaces only the six fallbacks with MP3 files encoded at 192 kbit/s directly from the hash-verified original recordings. The same trimming, crossfade and loudness preparation is applied. MP3 decoding, codec, duration, loudness and peaks were measured separately; the updated audits record both the preserved Vorbis and the new MP3 SHA-256 hashes. The short-cue LUFS limitation and all media-rights restrictions still apply. No new generation, download or purchase was made for this conversion.
