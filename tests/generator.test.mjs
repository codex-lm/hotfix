import assert from 'node:assert/strict';
import { generateTicket, generateTicketSync, solveTicket, buildTicketWorld } from '../src/tickets/generator.js';
import { TIERS } from '../src/tickets/arena-gen.js';
import { validateTicket, starsFor } from '../src/tickets/ticket.js';
import { dailySeed, dailyTiers, sprintTiers, readTicketCache, writeTicketCache } from '../src/tickets/daily.js';
import { OPS } from '../src/core/opcodes.js';
import { runCycle } from '../src/core/sim.js';
import { serializeWorld } from '../src/core/world.js';

// Deliberately independent exhaustive tree: no generator memo, transition cache,
// iterative-deepening implementation or preferred witness is reused here.
function bruteSolution(ticket, budget) {
  function search(world, remaining, path) {
    if (world.status === 'success') return path;
    if (world.status !== 'playing' || world.cycle >= ticket.cycles) return null;
    const patches = [null];
    if (remaining > 0) {
      for (let slot = 0; slot < 6; slot++) for (const op of OPS) {
        if (op !== world.robots[0].program[slot]) patches.push({ slot, op });
      }
    }
    for (const patch of patches) {
      const next = runCycle(world, patch ? [{ robotId: 'r0', ...patch }] : [], { trace: false }).world;
      const result = search(next, remaining - (patch ? 1 : 0), [...path, patch]);
      if (result) return result;
    }
    return null;
  }
  return search(buildTicketWorld(ticket), budget, []);
}

function verifyWitness(ticket) {
  let world = buildTicketWorld(ticket);
  const initial = serializeWorld(world);
  let count = 0;
  const events = [];
  for (const patch of ticket.solution) {
    assert.equal(world.status, 'playing', 'No patch after success');
    if (patch) {
      count++;
      assert.ok(Number.isInteger(patch.slot) && patch.slot >= 0 && patch.slot < 6);
      assert.ok(OPS.includes(patch.op));
      assert.notEqual(patch.op, world.robots[0].program[patch.slot]);
    }
    const result = runCycle(world, patch ? [{ robotId: 'r0', ...patch }] : []);
    events.push(...result.trace.flatMap(tick => tick.events));
    world = result.world;
  }
  assert.equal(world.status, 'success', `${ticket.seed}: certified witness must reach exit`);
  assert.equal(count, ticket.par);
  assert.ok(world.cycle <= ticket.cycles);
  assert.equal(serializeWorld(buildTicketWorld(ticket)), initial, 'Search and replay never mutate the ticket');
  return { world, events };
}

export default async function run() {
  const samples = Number(process.env.HOTFIX_GENERATOR_SAMPLES ?? 1000);
  assert.ok(Number.isInteger(samples) && samples > 0);
  const allStarted = performance.now();
  for (let tier = 1; tier <= 4; tier++) {
    const started = performance.now();
    let worst = 0;
    const programFamilies = new Set();
    const families = new Map();
    const solutionOps = new Set();
    const uniqueInitialStates = new Set();
    let geometryVariants = 0;
    let programVariants = 0;
    for (let index = 0; index < samples; index++) {
      const sampleStarted = performance.now();
      const seed = `test:${tier}:${index}`;
      const ticket = generateTicketSync(seed, tier);
      const elapsed = performance.now() - sampleStarted;
      worst = Math.max(worst, elapsed);
      assert.equal(ticket.tier, tier, `${seed}: no silent tier downgrade in validation corpus`);
      assert.equal(validateTicket(ticket), true);
      assert.ok(TIERS[tier].pars.includes(ticket.par));
      assert.equal(ticket.cycles, TIERS[tier].cycles);
      assert.equal(ticket.arena.w, TIERS[tier].w);
      assert.equal(ticket.arena.h, TIERS[tier].h);
      assert.ok(Math.abs(ticket.start.x - ticket.exit.x) + Math.abs(ticket.start.y - ticket.exit.y) >= 5);
      assert.ok(!ticket.arena.conveyors.some(([cell]) => cell === ticket.exit.y * ticket.arena.w + ticket.exit.x));
      assert.ok(ticket.program.filter(op => ['FWD', 'BACK', 'JUMP'].includes(op)).length >= 2);
      assert.match(ticket.id, /^INC-\d{4}$/);
      assert.ok(['ticket.fall', 'ticket.wall', 'ticket.loop', 'ticket.miss'].includes(ticket.titleKey));
      if (tier === 1) assert.ok(!ticket.arena.tiles.includes(2));
      if (tier >= 2) assert.ok(ticket.arena.tiles.includes(2));
      if (tier >= 3) assert.ok(ticket.arena.conveyors.length >= 2);
      if (tier === 4) assert.ok(ticket.arena.crates.length >= 1);
      const { events } = verifyWitness(ticket);
      if (['elbow', 'zigzag', 'switchback'].includes(ticket.family)) assert.ok(events.some(event => event.type === 'turned'));
      if (ticket.family === 'jump') assert.ok(events.some(event => event.type === 'moved' && event.op === 'JUMP'));
      if (ticket.family === 'cargo') assert.ok(events.some(event => event.type === 'filled'), 'Cargo route requires filling the gap');
      if (ticket.family === 'conveyor') assert.ok(events.some(event => event.type === 'conveyed' && event.robotId === 'r0'), 'Conveyor is used on the witnessed route');
      families.set(ticket.family, (families.get(ticket.family) ?? 0) + 1);
      for (const patch of ticket.solution) if (patch) solutionOps.add(patch.op);
      uniqueInitialStates.add(serializeWorld({ ...buildTicketWorld(ticket), seed: '' }));
      if (ticket.layoutVariant) geometryVariants++;
      if (ticket.programVariant) programVariants++;
      programFamilies.add(ticket.program.join(','));
      if (index < 2) {
        const repeated = generateTicketSync(seed, tier);
        assert.deepEqual(repeated, ticket, 'Same seed produces byte-identical ticket data');
      }
      if (tier <= 2 && index < 8) {
        assert.equal(bruteSolution(ticket, ticket.par - 1), null, 'Independent exhaustive search disproves lower par');
        assert.ok(bruteSolution(ticket, ticket.par), 'Independent exhaustive search confirms par');
      }
      if (index > 0 && index % 250 === 0) console.log(`  generator: tier ${tier}, ${index}/${samples} certified`);
    }
    if (samples >= 20) assert.ok(programFamilies.size >= 2, `Tier ${tier}: varied broken programs`);
    if (samples >= 100) {
      assert.ok(families.size >= 4, `Tier ${tier}: at least four distinct logical families`);
      for (const op of ['FWD', 'JUMP', 'LEFT', 'RIGHT']) assert.ok(solutionOps.has(op), `Tier ${tier}: patches include ${op}`);
    }
    // This is an observed local-hardware budget, not a universal device promise.
    assert.ok(worst < 2000, `Tier ${tier}: slowest generation ${Math.round(worst)} ms exceeded 2 seconds on this host`);
    console.log(`  generator: tier ${tier}, ${samples} certified tickets, ${Math.round(performance.now() - started)} ms total, ${Math.round(worst)} ms maximum`);
    console.log(`  generator: tier ${tier} families ${[...families].map(([family, count]) => `${family}=${count}`).join(', ')}; patch opcodes ${[...solutionOps].sort().join(', ')}`);
    console.log(`  generator: tier ${tier} unique initial states ${uniqueInitialStates.size}/${samples}; accepted geometry variants ${geometryVariants}, program variants ${programVariants}`);
  }

  const tutorial = generateTicketSync('onboarding', 1);
  assert.equal(tutorial.par, 1);
  assert.equal(tutorial.solution.find(Boolean).op, 'FWD');
  assert.equal(starsFor(tutorial, 1), 3);
  assert.equal(starsFor(tutorial, 2), 2);
  assert.equal(starsFor(tutorial, 3), 1);
  assert.equal(starsFor(tutorial, 1, false), 0);
  assert.deepEqual(await generateTicket('onboarding', 1), tutorial, 'Async and synchronous generation share the same search');
  assert.equal(dailySeed('2026-10-28T23:59:59Z'), 'daily-2026-10-28');
  assert.equal(dailySeed('2026-10-29T00:00:00Z'), 'daily-2026-10-29');
  assert.deepEqual(dailyTiers, [1, 2, 2, 3, 4]);
  assert.deepEqual(sprintTiers, [1, 1, 2, 2, 3, 3, 4, 4]);
  const cache = new Map();
  const storage = { getItem: key => cache.get(key), setItem: (key, value) => cache.set(key, value) };
  writeTicketCache(tutorial, storage);
  assert.deepEqual(readTicketCache(tutorial.seed, tutorial.tier, storage), tutorial);
  assert.equal(readTicketCache('missing', 1, storage), null);
  const unavailable = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('quota'); } };
  assert.equal(readTicketCache('x', 1, unavailable), null);
  assert.equal(writeTicketCache(tutorial, unavailable), tutorial);

  // Cases with mutable props exercise the full key, instead of a position-only
  // memo. The second search has no dependency on the production solver.
  for (let index = 0; index < 4; index++) {
    const ticket = generateTicketSync(`mutable:${index}`, 2);
    ticket.arena.crates = [{ x: ticket.start.x + (ticket.start.dir === 1 ? 1 : -1), y: ticket.start.y }];
    ticket.arena.tiles[ticket.start.y * ticket.arena.w + ticket.start.x + (ticket.start.dir === 1 ? 2 : -2)] = 2;
    const brute = bruteSolution(ticket, 1);
    const exact = solveTicket(ticket, { maxPatches: 1 });
    assert.equal(Boolean(exact), Boolean(brute), 'Mutable crate/hole state agrees with independent search');
  }
  const forwardModule = await import(new URL('../src/tickets/generator.js?generation-order=forward', import.meta.url));
  const reverseModule = await import(new URL('../src/tickets/generator.js?generation-order=reverse', import.meta.url));
  const requests = Array.from({ length: 8 }, (_, index) => ({ seed: `order:${index % 2}`, tier: 1 + Math.floor(index / 2) }));
  const forward = new Map(requests.map(({ seed, tier }) => [`${tier}:${seed}`, forwardModule.generateTicketSync(seed, tier)]));
  for (const { seed, tier } of [...requests].reverse()) {
    assert.deepEqual(reverseModule.generateTicketSync(seed, tier), forward.get(`${tier}:${seed}`), 'Complete ticket data is independent of earlier generation order and proof cache');
  }
  console.log('  generator: fresh-module forward/reverse generation order is byte-identical');
  console.log(`  generator: ${samples * 4} tickets checked in ${Math.round(performance.now() - allStarted)} ms`);
}
