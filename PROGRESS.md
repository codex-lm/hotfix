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
