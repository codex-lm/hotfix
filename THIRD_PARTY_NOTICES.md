# Third-party notices

## Barlow

- Designer: Jeremy Tribby.
- License: SIL Open Font License, Version 1.1.
- Complete license: `assets/fonts/OFL-barlow.txt`.
- Source: <https://github.com/google/fonts/tree/main/ofl/barlow>.
- Local Latin WOFF2 files: `assets/fonts/barlow-{400,500,600,700,800}.woff2`.

## JetBrains Mono

- Copyright: The JetBrains Mono Project Authors (JetBrains).
- License: SIL Open Font License, Version 1.1.
- Complete license: `assets/fonts/OFL-jetbrainsmono.txt`.
- Source: <https://github.com/google/fonts/tree/main/ofl/jetbrainsmono>.
- Local Latin WOFF2 file: `assets/fonts/jetbrains-mono-latin.woff2`.

Fonts were downloaded from Google Fonts on 2026-10-28. Exact source URLs and
SHA-256 hashes are preserved in `assets/fonts/provenance.json`. No font request
is made to Google or any other external host by the running game.

## LOB7 Rooms SDK

- File: `lob7-rooms.js`.
- Supplier/source: <https://lob7.com/lob7-rooms.js>.
- Retrieved: 2026-10-28, copied byte for byte, without modification.
- Purpose: optional LOB7 room bridge integration for the M2 milestone.
- The upstream header explicitly says to bundle this SDK locally. The supplied
  file does not include a standalone license grant or copyright notice beyond
  that bundling instruction. It is not relicensed under Hotfix's MIT license.
- Exact SHA-256: see `assets/sdk-provenance.json`.

There are no npm dependencies or remote scripts. Optional recordings generated
with ElevenLabs and Suno are documented separately in `ASSETS-LICENSE.md` and
`assets/audio/provenance.json`; they are excluded from the code's MIT license.
