# Hotfix

**Six instructions. One patch per cycle. A robot already running in production.**

Hotfix is a deterministic programming puzzle in a bright warehouse. Inspect the next six ticks, replace at most one instruction, and deploy. Your patch persists into the next cycle, while the robot keeps moving. Every ticket has a minimum patch count proved by exhaustive search.

The Tickets edition includes Backlog, an eight-ticket Sprint and a five-ticket daily challenge, English/French, keyboard/touch controls, save import/export, exact before/after forecasts, replay and downloadable 1200×630 postmortems. The daily seed uses UTC; the first completed attempt stays official, including failures, and unfinished attempts resume where they stopped.

**Current `main` also includes a Prod preview against 3–7 bots.** Choose Stagiaire, Ops or Senior, claim three beacons, observe the other programs, and work with the rotating execution order. Wins are recorded locally by bot level. The complete Tickets milestone is preserved at [v0.1.0](https://github.com/codex-lm/hotfix/tree/v0.1.0).

Online LOB7 rooms are deliberately not activated in this preview. The authoritative transport, replay, timeout and late-join logic has mock coverage, but the real bridge identity fields must be observed in a real LOB7 room before enabling it. This is not a claim of live multiplayer certification or a complete M2 release. M3 tiles/variants/hints remain future work.

Preview checks: 12 local suites pass. An eight-robot Senior match reached its ranking through actual browser controls, language changes preserved the match, and the 390px layout retained 48px slot targets without horizontal overflow. An independent review reproduced and verified fixes for host reload commands, silent-player takeover, late roster metadata and exposed observations. See [PROGRESS.md](PROGRESS.md) for the scope and remaining limits.

## Play locally

No npm, dependency installation or build is needed. Use a static HTTP server; browsers cannot load these ES modules directly from a `file:` URL.

```sh
python3 -m http.server 8080
# Windows: python -m http.server 8080
# Open http://localhost:8080
```

Run the dependency-free tests with Node 24 or a recent Node version supporting automatic ES module detection:

```sh
node tests/run.mjs
```

## Controls and rules

Select a program slot, choose an instruction, compare the forecast and Deploy. **Ship as is** runs the next cycle without a patch. Keyboard: `1–6` selects a slot; `F B L R W J P` chooses an instruction; Enter/Space deploys; Escape cancels; arrows move between slots; `+`/`-` changes speed. Buttons retain normal keyboard activation when focused.

| Instruction | Effect |
| --- | --- |
| FWD | Move one tile; push the whole chain of robots/crates, unless its end meets a wall. |
| BACK | Move one tile backwards without turning or pushing. |
| LEFT / RIGHT | Turn 90 degrees without moving. |
| WAIT | Do nothing for one tick. |
| JUMP | Move two tiles forward, ignoring the intermediate tile; the landing must be unoccupied and not a wall. |
| PUSH | Push the object in front without moving the robot. |

Walls block movement, holes return the robot to its home, crates fill holes permanently, and conveyors move simultaneously after instructions. Required beacons unlock the exit. Three stars means solving at par, two stars allows one extra patch, and any other solution within the cycle budget earns one star.

The first patch is permitted before cycle 1. For simultaneous interactions, the exact resolution phases take precedence: all robot instructions, falls, conveyors, falls, claims. These choices resolve ambiguities in the source specification; see [PROGRESS.md](PROGRESS.md).

## Certified procedural tickets

The generator combines several arena families with reflected layouts, geometric variants and broken-program variants. Puzzles include corners, switchbacks, jumps over hole barriers, crates filling holes and useful conveyors. It certifies every accepted puzzle by iterative deepening over complete patch sequences, from zero to three patches. The memoization includes mutable crates, filled holes and beacons. A stored witness speeds discovery but never substitutes for a minimality proof.

This intentionally differs from uniformly drawing every arena/program: constrained candidates keep generation bounded and provide useful puzzle structure. Corridor layouts sometimes exceed the proposed wall density. Distinct seeds can share the same logical puzzle. Generator v3 is included in the cache key so older tickets are not silently reused.

## M1 acceptance evidence

Recorded on 2026-10-28, Windows, Node 24.19 and the Codex in-app browser. Browser checks used actual controls; viewport tests are not physical Safari/iPhone certification.

- [x] Static server boots the title screen. A centre click, ArrowRight, ArrowLeft and Space cause no console exception and open a harmless tier-1 ticket.
- [x] All seven instructions and edge cases have ASCII/table rule tests; immutable simulation and byte-identical replay are checked.
- [x] 1,000 seeds per tier: certified par, witnessed solution, deterministic titles, complete-state proof keys, generation-order independence and independent brute force on small cases.
- [x] 200 generated tickets × 200 random patches: 40,000 complete forecast/execution world and event-trace comparisons, including intermediate mutable geometry.
- [x] One incident per tier solved through browser controls using its certified solution. Tutorial navigation completed in 1.6 seconds with reduced motion enabled. Seeds for tiers 2–4: `acceptance-tier-2`, `acceptance-tier-3`, `acceptance-tier-4`; all earned three stars.
- [x] Tier-4 browser generation for the acceptance seed: 470ms. The 4,000-ticket Node campaign stayed below two seconds per ticket. Fresh-module async Node profiles used a simulated rAF and measured maximum synchronous slices of 9.01–11.19ms; these are local measurements, not universal device guarantees.
- [x] Complete FR/EN dictionaries with matching keys. Language switching, keyboard focus, reduced motion and 390px layout checked.
- [x] Best-score accounting, independent Sprint/Daily checkpoints, first daily score preservation, private-storage/quota failures and malformed import validation covered by regression tests.
- [x] Replay and 1200×630 PNG export checked in the browser; empty replays are safe and series solutions stay hidden until the series ends.
- [x] Code/fonts below 3MiB; complete media edition below 25MiB and 500 files. No external runtime request, Worker, WASM, dynamic import or peer connection. SDK and local fonts are hash-verified.
- [x] MIT code license, asset license, third-party notices, attribution and production brief are present. Every received audio file has provenance, source/delivered SHA-256 hashes and a conversion audit.

The bot performance criterion belongs to M2, consistent with the milestone scope. Online LOB7 room verification and a real two-player match are separate from this solo release. No LOB7 edition has been published by this implementation session.

## Architecture

- `src/core/`: seeded PRNG, world, opcodes, immutable simulator, events, forecast and replay. This is the only implementation of movement rules.
- `src/tickets/`: tier layouts, constructive candidates, exact search, daily cache and scoring.
- `src/prod/`, `src/ai/`, `src/net/`: arena setup, three deterministic bot levels, local transport and the prepared room protocol.
- `src/ui/`, `src/i18n/`: canvas warehouse, patch editor, rules, commits, storage, postmortem and translation.
- `assets/manifest.json`: received images/audio only. Missing visuals use procedural canvas artwork, and missing sound cues remain silent.
- `tests/`: Node assertions with no dependency or package manifest.

All gameplay randomness comes through `src/core/rng.js`. The clock only creates a fresh input seed, chooses the UTC daily seed, and measures presentation time; it never affects simulation outcomes.

## Media and licensing

Code, CSS and original procedural drawings are MIT licensed, copyright Cédric Bernadac, 2026. Barlow and JetBrains Mono are bundled locally under SIL OFL 1.1. The LOB7 SDK is preserved unmodified with its own provenance.

Two Suno instrumental loops and four ElevenLabs cues are included as optional game media, with separate volume settings. Audio begins only after a gesture and is muted by default on touch devices. Generated media is **not covered by the code's MIT license or declared CC0**. See [ASSETS-LICENSE.md](ASSETS-LICENSE.md), [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) and [audio provenance](assets/audio/provenance.json) for the actual terms and derivations. No Blender renders have been received; their delivery brief is in [ASSETS-BRIEF.md](ASSETS-BRIEF.md).

## Variants and LOB7 delivery

Keep the pure simulator authoritative, keep FR/EN complete, add a rule test for changed semantics, and preserve media provenance. Record derivative release ancestry in `LOB7-ATTRIBUTION.json`. A static `main` is ready to serve with `index.html` at its root; there is deliberately no `package.json`.

Cédric publishes the tagged commit through LOB7. Room integration needs a real bridge identity audit before activation: the bundled SDK exposes service metadata without specifying the self/host/sender field names. Never accept an identity asserted inside a game message.
