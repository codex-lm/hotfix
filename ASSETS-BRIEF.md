# Hotfix — asset delivery brief

Status: production brief only. No generated image, music or sound has been
delivered. Current artwork is drawn in code; audio substitutes are silent.
All assets are optional. The game must stay readable and fully playable when
`assets/manifest.json` has empty image and audio maps.

## 1. Blender renders — Kimi K3.1

Art direction: a clean, bright warehouse; light concrete, painted floor
markings, friendly rounded utility robots and clear industrial signage.
No pixel art, neon, grunge, gold, dark green, parchment, text, logos or borrowed
character designs. Grid legibility comes first.

Palette: concrete `#E4E2DC`; slate `#23272E`; signal orange `#F2652B`;
steel blue `#3B8EA5`; danger red `#D63A2F`; signal green `#3C9D5D`;
charcoal `#1B1D21`; off-white `#F7F6F2`.

Camera: orthographic, strictly vertical, looking straight down. Rendered
sprites must align to the square grid and rotate cleanly in code. Main light
at upper left, 45° elevation; short soft shadows. Matte materials, Eevee or
Cycles, AgX color management. PNG RGBA with transparent background. A square
sprite covers exactly one cell, with no perspective overhang crossing its
neighbors. Default output 256 × 256 px, displayed at 48–72 px.

Deliver to these exact paths under `assets/img/`:

| Files | Size | Content |
| --- | --- | --- |
| `tiles/floor-1.png` … `tiles/floor-4.png` | 256 × 256 | Four subtle light-concrete variations, no distracting cracks. |
| `tiles/wall.png`, `tiles/wall-top.png` | 256 × 256 | Industrial shelving/concrete wall, mild relief, solid silhouette. |
| `tiles/hole.png` | 256 × 256 | Open maintenance hatch into darkness, yellow/black rim. |
| `tiles/conveyor.png` | 256 × 256 | Conveyor pointing north; rotate for other directions. |
| `tiles/conveyor-strip.png` | 256 × 64 | Seamlessly tileable moving belt layer. |
| `props/crate.png` | 256 × 256 | Steel-blue plastic cargo crate. |
| `props/beacon.png` | 256 × 256 | Orange illuminated beacon. |
| `props/beacon-halo.png` | 256 × 256 | Separate soft transparent glow for pulsing. |
| `tiles/exit.png` | 256 × 256 | Shipping dock tile: chevrons and green band, no lettering. |
| `robots/robot-N.png`, `robots/robot-E.png`, `robots/robot-S.png`, `robots/robot-O.png` | 256 × 256 | One rounded cart robot, consistent four cardinal orientations; blank front screen so code overlays the current instruction. |
| `robots/robot-mask.png` | 256 × 256 | White tint mask for the body color, transparent elsewhere. |
| `fx/fall-1.png` … `fx/fall-6.png` | 256 × 256 each | Six separate, aligned frames of the robot falling into the hatch. |
| `bg/warehouse.png` | 1920 × 1200 | Very desaturated wide warehouse view for title/background. |

Player colors: `#F2652B`, `#3B8EA5`, `#8E5CC9`, `#3C9D5D`, `#E0B23C`,
`#D64A8A`, `#5B6B7F`, `#2BB3A3`. Avoid baking a player color into the
universal mask. Direction and robot identity must remain recognizable without
color. Instruction icons remain original inline SVG, charcoal 2 px strokes
on a 24 px grid; no 3D instruction icon delivery is requested.

Source `.blend` files go on branch `dev-assets`, outside the published game
bundle. Requested license: CC0-1.0, confirmed by the rights holder in the
delivery. Include generation date, creator/tool, original-work confirmation
and the CC0 dedication. Record the actual delivery in `ASSETS-LICENSE.md`.

## 2. Music — Suno

Instrumental only, no voices. Friendly warehouse-at-night atmosphere, precise
but relaxed, soft percussion, restrained electronic/acoustic groove, clean
low end. Avoid alarms, dramatic drops and busy melodies that compete with the
puzzle. No imitation of a named performer. Supply trimmed, normalized loops
without leading silence or clipping.

| Base path under `assets/audio/music/` | Duration | Brief |
| --- | --- | --- |
| `title.ogg`, `title.m4a` | 60–90 s | Discreet groove, welcoming title theme, clean loop point. |
| `gameplay.ogg`, `gameplay.m4a` | 120 s | Moderate tempo, neutral enough to repeat for ten minutes, seamless loop. |
| `resolved.ogg`, `resolved.m4a` | 5 s, optional | Short warm incident-resolved sting; no loop. |
| `escalated.ogg`, `escalated.m4a` | 5 s, optional | Gentle comic setback, no punitive noise; no loop. |

Primary format: OGG Vorbis 128 kbit/s; AAC `.m4a` fallback. Keep a lossless
master outside the published branch. Record the actual Suno model, generation
date, generating account/plan and the applicable distribution terms in
`ASSETS-LICENSE.md` before adding recordings. This brief does not assert that
any Suno account or recording already has those rights.

## 3. Sound cues — ElevenLabs

Short, tactile and soft sounds for small warehouse robots. No speech, no
harsh alarm, no borrowed sound design. Deliver source WAV, mono or stereo,
44.1 kHz, and game OGG plus AAC fallback. Cue durations: 0.2–1.5 s, except
where a shorter click is clearer. Normalize as a coherent set; do not clip.

All game basenames live under `assets/audio/sfx/` with `.ogg` and `.m4a`:

| Basename | Cue |
| --- | --- |
| `move` | One-cell rolling step, short rubber wheel sound. |
| `turn` | Quarter-turn servo. |
| `push` | Robot pushing an object. |
| `crate-push` | Plastic crate sliding one cell. |
| `hole-filled` | Crate plugs a hatch, soft mechanical thunk. |
| `fall` | Short descending fall, no voice. |
| `respawn` | Small friendly restart blip. |
| `conveyor` | Brief belt movement. |
| `beacon` | Beacon claimed, clear two-note confirmation. |
| `exit` | Robot reaches shipping dock. |
| `patch-select` | Quiet patch-selection click. |
| `deploy` | A deliberate but light deployment confirmation. |
| `cycle-end` | Subtle cycle boundary cue. |
| `countdown` | Gentle last-three-seconds tick for future Prod. |
| `victory` | Brief resolved celebration, distinct from beacon. |
| `failure` | Brief escalated cue, restrained and friendly. |

For every delivery record ElevenLabs model, generation date, generating
account/plan and applicable media terms. Suno may be used as the alternative
source if recorded honestly. Original WAV masters remain on `dev-assets`.
Music and SFX volumes are independent, audio starts only after a user gesture,
and mobile defaults to silence. Missing cues must produce silence.

## Integration contract

`assets/catalog.json` lists delivery slots; it does not trigger loading.
Add only actually received files to `assets/manifest.json`. Image keys are
the relative path without `assets/img/` and without `.png`, for example
`"robots/robot-N": "img/robots/robot-N.png"`. Audio entries are arrays in
preferred format order, for example
`"move": ["audio/sfx/move.ogg", "audio/sfx/move.m4a"]` inside `audio.sfx`.
Music uses the same convention inside `audio.music`. All paths are relative
to `assets/` and remain on the same origin. No code edit is needed for image
keys already supported by the procedural renderer or for named audio cues.

After each delivery, update provenance, inspect transparency/alignment at
actual cell size, verify the loop seam and keep the compressed bundle within
25 MiB. The code and fonts alone target less than 3 MiB and 500 files.
