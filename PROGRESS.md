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
