# Hotfix — implementation progress

## Decisions

- The first deployment window precedes cycle 1. This follows `runCycle(world, patches)` and the specified Deploy interface; section 2 otherwise suggests an initial unpatched cycle. Every cycle permits zero or one patch, including the first.
- The exact solver memoizes the whole mutable simulation state, including crates, filled holes and claims, rather than only the incomplete example key in section 3.
- A tier-4 beacon requirement is enforced before the exit can resolve a ticket.
- Bots belong to M2 despite their appearance in the M1 acceptance checklist. New tile types belong to M3, matching the milestones.
- Source specifications remain local and ignored. The delivery target is a public static GitHub repository; LOB7 publication is reserved for Cédric as specified.

## M1 · 1 — scaffold

Done: initialized a new local `main` checkout and the static module entrypoint; legal files, local fonts, asset brief and the unmodified Rooms SDK are being prepared.
Deviations: none beyond the explicit rule clarifications above.
Next: pure simulator with ASCII rule tests and byte-identical replay.

## M1 · 2 — simulation

Done: pure simulator, deterministic PRNG, all seven opcodes, atomic pushing, simultaneous conveyors, respawn, required beacons, canonical replay and preview. ASCII rule cases, replay tests and 200 preview/patch comparisons pass.
Deviations: the explicit tick phase order takes precedence over the prose about immediate falls; instructions all resolve before falls, then conveyors and falls again. This distinction only affects multiplayer interactions. A measured 8-robot simulation without trace averages below 20 microseconds on this machine; this is a local microbenchmark, not a cross-device guarantee.
Next: playable canvas arena, patch selector, tick animation and title navigation.

## M1 · 3 — playable interface

Done: responsive warehouse canvas, six-slot program editor, one pending patch, before/after forecast, tick animations, title navigation, FR/EN, Backlog/Sprint/Daily, resumable saves and postmortem are implemented together so the third delivery commit is runnable without missing imports. The tutorial was solved through browser controls in 1.6 seconds; its result showed three stars. Desktop and 390px postmortem were inspected in the in-app browser.
Deviations: interface modules for steps 4, 6 and 7 were developed in parallel and integrated at this milestone; their acceptance checks are recorded separately below. This preserves a runnable `main` while reducing integration risk, rather than following a strict one-feature-per-commit schedule.
Next: complete generator, series, replay, export and mobile acceptance checks.

## M1 · 4 — forecast validation

Done: 200 generated tickets with 200 random patches each, including intermediate crate/hole/beacon states: 40,000 complete world and event-trace comparisons match actual simulation. Input worlds remain unchanged.
Deviations: none; preview and gameplay call the same simulator.
Next: final procedural-generation campaign and cold generation timings.

## M1 · 5 — certified tickets

Done: generator v3, exact iterative-deepening search, full mutable-state memoization, seed-order-independent proof caching, incident titles and certified optimal patch sequences. 1,000 seeds per tier pass, with 4/4/5/6 arena families; maximum synchronous generation in the campaign was 850ms. Fresh-module async Node profiles with a simulated rAF took 503–1,032ms, maximum synchronous slices 9.01–11.19ms. Browser timing is checked separately.
Deviations: candidates use constructive arena families, variable geometry and catalogued broken programs, then exact certification, rather than uniformly random arenas/programs. Corridors sometimes require more walls than the proposed 8–15 percent. This improves puzzle variety and bounds generation time. On 1,000 seeds per tier, unique initial gameplay states were 312/373/336/164; seeds can therefore share the same logical puzzle. No unproved par is served.
Next: finish all browser acceptance checks and record release evidence.

## M1 · 6 — modes and durable progress

Done: Backlog, eight-ticket Sprint, five-ticket UTC Daily, background daily cache, seed replay, best-score totals, independent series checkpoints, import/export and animated rules. Regression tests cover results between tickets, interrupted triage, unrelated Backlog play, locked daily scores, malformed data and unavailable/quota-limited storage. Native keyboard activation remains available on focused controls.
Deviations: the same logical puzzle can occur for different seeds, as recorded under generator v3. Resume is offered explicitly from the title screen so the required title smoke controls remain predictable.
Next: postmortem, replay and share-card validation.

## M1 · 7 — postmortem and browser acceptance

Done: actual UI controls solved tier 1 (`onboarding`, 1.6 seconds), tier 2 (`acceptance-tier-2`), tier 3 (`acceptance-tier-3`) and tier 4 (`acceptance-tier-4`), each at par/three stars. Browser generation timings for tiers 2/3/4 were 18/34/470ms. PNG export produced a verified 1200×630 card. Title centre-click/right/left/Space smoke passed without console errors. Mobile viewport 390px has no horizontal overflow. Empty replays are guarded, and series solutions/replay-to-solution shortcuts are withheld until completion.
Deviations: browser testing is in the embedded Chromium browser and at a mobile viewport, not a physical iPhone or a Safari/Firefox certification. A stalled local preview reload was recovered after restarting the test server with file-based logging; a bilingual bootstrap error boundary was also added so module failures cannot silently leave a loading screen.
Next: clean-checkout tests, final media/license audit and release tag.

## M1 · 8 — media and release preparation

Done: two original Suno generations selected by duration and officially downloaded; four ElevenLabs cues selected by stable first-variant rule. Included derivatives are OGG/AAC, music 75s/120s with crossfade and normalized levels, four short cues. Source copies remain ignored; public audits include prompts, service/model/plan, URLs, SHA hashes and measured derivatives, excluding account balances, billing data, account handles and absolute user paths. Missing remaining cues and Blender sprites have functional silent/procedural substitutes.
Deviations: source music was officially downloaded as MP3; no WAV arrived from the first multi-format export. No extra generation was made to replace an export. No listening comparison or musical seam quality is claimed. Separate media terms are preserved rather than relicensing the recordings under MIT/CC0. Strict feature-per-commit sequencing was relaxed as documented at step 3.
Next: publish only the verified Git repository and commit; LOB7 publication remains Cédric's step.

Release check: a clean Git archive exposed Windows line-ending normalization of downloaded vendor sources. `.gitattributes` now preserves SDK/font-license bytes and normalizes generated metadata. The clean archive packaging test verifies the original vendor hashes, media hashes and static runtime constraints. CI uses pinned official checkout/setup-node actions and runs the same dependency-free test command.

## M1 — released

`v0.1.0` points to `18cf264de43eae1b1b36b0d9d835c2ec8b86c3a3`. The final clean Git archive passes 8/8 suites in 66.79 seconds, including 4,000 certified tickets and 40,000 forecast comparisons. Both GitHub CI runs on this exact commit passed. Public repository: https://github.com/codex-lm/hotfix . Tracked release: 83 files, 6,372,970 bytes total; code/fonts/metadata 424,155 bytes. LOB7 publication has not been performed.

## M2 — local Prod preview

Done: 4–8 robots, rotating priority, three active beacons, three deterministic bot levels using only observed opponent instructions, local transport, setup/configuration UI, uncertain forecasts, instruction observations, ranking, push statistics, final paths and local wins by bot level. Browser played a complete eight-robot Senior match on `prod-acceptance`: Robot 5 won after four cycles. Actual tick animations displayed one instruction per robot; all 42 opponent slots began unknown and were learned from observations. FR/EN switching retained cycle 2, version 1 and all 42 observations. Result export retained Senior games=1/wins=0. Start/result scroll positions and desktop overflow were checked.
Deviations: online rooms remain unactivated, and there is no full `v0.2.0` certification. The SDK does not identify self/host/sender metadata fields; an explicitly verified adapter is required before connecting. The prepared room transport was independently reviewed: host reload commands, three-silence takeover, late identity projection and exposed observations were corrected and retested. Hashes cover physical state and exclude mutable display metadata. Equal bot scores prefer no patch to avoid unnecessary program changes.
Presentation verified: crates interpolate through pushes/conveyors, holes remain visible while being filled, falls shrink into the hole before respawn/flash, and jumps have a small arc. Shared robot poses keep Prod badges aligned. Numeric Canvas recording checked 164 intermediate frames; small boards group repeated tick numbers inside their actual cell. Browser Prod at 390px supports eight robots with no horizontal overflow and six 48px slot targets; a cycle completed with the final renderer and no console error. The daily date badge explicitly identifies UTC. The exported QA progression was preserved privately and a fresh save was imported/reloaded successfully: French, zero stars, no pending session or daily attempt.

Preview validation: 12/12 local suites passed in 77.01 seconds. The four room regressions passed independent revalidation, including physical hashes after replay/late joins. The next commit is labelled `v0.2.0-preview.1`, not a complete M2 release. A real LOB7 draft/room and two-player verification remain external follow-up; M3 gameplay additions remain future work.

Final accessibility correction (`v0.2.0-preview.2`, refined in `v0.2.0-preview.3`): trajectory tick labels use dark ink, giving 4.68:1 contrast on the orange patch badge and at least 5.54:1 on gray badges. Independent review selected a keyboard focus blue with 3.62:1 contrast against concrete, 3.20:1 against slate and 3.15:1 against the arena background. Both CI runs for the initial Prod preview passed; these focused color corrections preserve gameplay and simulation.
