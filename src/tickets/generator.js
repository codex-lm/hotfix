import { createRng, derive, hashSeed } from '../core/rng.js';
import { worldFromTicket, serializeWorld } from '../core/world.js';
import { runCycle } from '../core/sim.js';
import { OPS } from '../core/opcodes.js';
import { generateArena, generateLogicalArena, TIERS } from './arena-gen.js';
import { CATALOG } from './catalog.js';

export const GENERATOR_VERSION = 3;
export const buildTicketWorld = worldFromTicket;
const clock = () => globalThis.performance?.now?.() ?? Date.now();
const proofCache = new Map();

// Counters which cannot change future ticket outcomes (falls and cosmetic
// version numbers) are intentionally omitted. All mutable geometry is retained.
function stateKey(world, holes) {
  return `${world.robots.map(robot => `${robot.x},${robot.y},${robot.dir},${robot.claims},${robot.program.join('.')}`).join(';')}|${holes.map(index => world.tiles[index]).join('')}|${world.crates.map(crate => `${crate.id},${crate.x},${crate.y}`).sort().join(';')}|${world.beacons.map(beacon => `${beacon.id},${beacon.x},${beacon.y}`).sort().join(';')}|${world.claimSerial ?? 0}`;
}

function optionsFor(world, preferred) {
  const program = world.robots[0].program;
  const options = [null];
  if (preferred && preferred.op !== program[preferred.slot]) options.unshift(preferred);
  for (let slot = 0; slot < 6; slot++) for (const op of OPS) {
    if (op !== program[slot] && !(preferred?.slot === slot && preferred.op === op)) options.push({ slot, op });
  }
  return options;
}

function advance(world, patch) {
  return runCycle(world, patch ? [{ robotId: world.robots[0].id, ...patch }] : [], { trace: false }).world;
}

function* searchWithBudget(ticket, budget, stats, context, preferredSolution = []) {
  const visited = new Map();
  function* visit(world, remaining, path) {
    if (world.status === 'success') return path;
    if (world.cycle >= ticket.cycles || world.status !== 'playing') return null;
    const futureKey = stateKey(world, context.holes);
    const key = `${world.cycle}|${futureKey}`;
    if ((visited.get(key) ?? -1) >= remaining) return null;
    visited.set(key, remaining);
    if (stats.nodes++ % 8 === 0) yield stats;
    if (remaining === 0) {
      let current = world;
      const tail = [...path];
      while (current.cycle < ticket.cycles && current.status === 'playing') {
        current = context.advance(current, null);
        stats.cycles++;
        tail.push(null);
        if (current.status === 'success') return tail;
      }
      return null;
    }
    for (const patch of optionsFor(world, preferredSolution[world.cycle])) {
      const next = context.advance(world, patch, futureKey);
      stats.cycles++;
      const result = yield* visit(next, remaining - (patch ? 1 : 0), [...path, patch]);
      if (result) return result;
    }
    return null;
  }
  return yield* visit({ ...worldFromTicket(ticket), maxCycles: Number.MAX_SAFE_INTEGER }, budget, []);
}

function* solveSteps(ticket, { maxPatches = 3, preferredSolution = [] } = {}) {
  const started = clock();
  const stats = { nodes: 0, cycles: 0, milliseconds: 0 };
  const initial = worldFromTicket(ticket);
  const holes = Array.from(initial.tiles.keys()).filter(index => initial.tiles[index] === 2);
  const transitions = new Map();
  const context = {
    holes,
    advance(world, patch, knownKey) {
      // Solo tick semantics do not depend on cycle number. Reuse identical
      // transitions reached on different cycles, while retaining the cycle in
      // the search memo and restoring it on every successor. Counters omitted
      // from the key cannot affect ticket solvability.
      const key = `${knownKey ?? stateKey(world, holes)}|${patch ? `${patch.slot}:${patch.op}` : '-'}`;
      let next = transitions.get(key);
      if (!next) {
        next = advance(world, patch);
        transitions.set(key, next);
      }
      return next.cycle === world.cycle + 1 ? next : { ...next, cycle: world.cycle + 1 };
    },
  };
  for (let par = 0; par <= maxPatches; par++) {
    const solution = yield* searchWithBudget(ticket, par, stats, context, preferredSolution);
    if (solution) {
      stats.milliseconds = clock() - started;
      return { par: solution.filter(Boolean).length, solution, stats };
    }
  }
  return null;
}

export function solveTicket(ticket, options = {}) {
  const iterator = solveSteps(ticket, options);
  let item;
  do { item = iterator.next(); } while (!item.done);
  return item.value;
}

async function drainAsync(iterator, options = {}) {
  let item;
  while (true) {
    const start = clock();
    do {
      item = iterator.next();
      if (item.done) return item.value;
    } while (clock() - start < 6);
    options.onProgress?.(item.value);
    await new Promise(resolve => {
      if (typeof requestAnimationFrame === 'function') requestAnimationFrame(resolve);
      else setTimeout(resolve, 0);
    });
  }
}

export function solveTicketAsync(ticket, options = {}) { return drainAsync(solveSteps(ticket, options), options); }

// This bounded beam search is only an upper-bound witness finder. It never
// certifies difficulty: every accepted witness is followed by exact search.
export function* witnessSteps(ticket, maxPatches = 3, width = 24) {
  let frontier = [{ world: worldFromTicket(ticket), solution: [], patches: 0, score: 0 }];
  let count = 0;
  const holes = Array.from(ticket.arena.tiles.keys()).filter(index => ticket.arena.tiles[index] === 2);
  for (let cycle = 0; cycle < ticket.cycles; cycle++) {
    const next = [];
    const seen = new Set();
    for (const entry of frontier) {
      const choices = entry.patches < maxPatches ? optionsFor(entry.world) : [null];
      for (const patch of choices) {
        const world = advance(entry.world, patch);
        const solution = [...entry.solution, patch];
        if (world.status === 'success') return solution;
        if (world.status !== 'playing') continue;
        const patches = entry.patches + (patch ? 1 : 0);
        const key = `${stateKey(world, holes)}|${patches}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const robot = world.robots[0];
        const distance = Math.abs(robot.x - ticket.exit.x) + Math.abs(robot.y - ticket.exit.y);
        const score = distance + robot.falls * 0.2 + patches * 0.05 - robot.claims * 2;
        next.push({ world, solution, patches, score });
        if (count++ % 16 === 0) yield { witness: true, nodes: count };
      }
    }
    next.sort((a, b) => a.score - b.score);
    // Keep some low-patch states even when deploying a patch gives an
    // immediate distance advantage. That preserves room for delayed fixes.
    const keep = [];
    for (let patches = 0; patches <= maxPatches; patches++) keep.push(...next.filter(entry => entry.patches === patches).slice(0, Math.ceil(width / (maxPatches + 1))));
    const selected = new Set(keep);
    for (const entry of next) if (keep.length < width && !selected.has(entry)) { keep.push(entry); selected.add(entry); }
    frontier = keep;
    if (!frontier.length) break;
  }
  return null;
}

export function findWitness(ticket, maxPatches = 3, width = 24) {
  const iterator = witnessSteps(ticket, maxPatches, width);
  let item;
  do { item = iterator.next(); } while (!item.done);
  return item.value;
}

function diagnose(ticket) {
  let world = worldFromTicket(ticket);
  let blocked = false;
  const visited = new Set([`${world.robots[0].x},${world.robots[0].y}`]);
  for (let cycle = 0; cycle < ticket.cycles && world.status === 'playing'; cycle++) {
    const result = runCycle(world);
    for (const tick of result.trace) {
      if (tick.events.some(event => event.type === 'fell')) return { titleKey: 'ticket.fall', titleParams: { tick: tick.tick + 1 } };
      blocked ||= tick.events.some(event => event.type === 'blocked');
      visited.add(`${tick.world.robots[0].x},${tick.world.robots[0].y}`);
    }
    world = result.world;
  }
  if (visited.size <= 3) return { titleKey: blocked ? 'ticket.wall' : 'ticket.loop', titleParams: {} };
  return { titleKey: 'ticket.miss', titleParams: {} };
}

function witnessResolves(ticket, witness) {
  let world = worldFromTicket(ticket);
  for (const patch of witness) {
    if (world.status !== 'playing') break;
    world = advance(world, patch);
  }
  return world.status === 'success';
}

function candidate(seed, tier, attempt) {
  const random = createRng(derive(seed, 'ticket', attempt));
  let layout = generateArena(seed, tier, attempt);
  let program;
  let preferredSolution;
  let family = 'aisle';
  if (seed !== 'onboarding' && random() < 0.86) {
    const archetype = random.pick(CATALOG[tier]);
    layout = generateLogicalArena(seed, tier, attempt, archetype.family);
    family = archetype.family;
    const reflect = op => archetype.reflected !== layout.reflected && (op === 'LEFT' || op === 'RIGHT') ? (op === 'LEFT' ? 'RIGHT' : 'LEFT') : op;
    program = archetype.program.map(reflect);
    preferredSolution = archetype.witness.map(patch => patch ? { slot: patch.slot, op: reflect(patch.op) } : null);
  } else if (tier === 1) {
    program = seed === 'onboarding' ? ['BACK', 'FWD', 'BACK', 'FWD', 'WAIT', 'WAIT'] :
      [...random.shuffle(['BACK', 'FWD', 'BACK', 'FWD']), random() < 0.5 ? 'WAIT' : 'PUSH', 'WAIT'];
    preferredSolution = [{ slot: program.indexOf('BACK'), op: 'FWD' }];
  } else if (tier === 2 || tier === 3) {
    program = Array(6).fill('BACK');
    if (tier === 2 || random() < 0.65) program[random.int(6)] = 'FWD';
    const slots = program.flatMap((op, slot) => op === 'BACK' ? [slot] : []).slice(0, 3);
    preferredSolution = slots.map(slot => ({ slot, op: 'JUMP' }));
  } else {
    program = Array(6).fill('BACK');
    if (random() < 0.65) program[random.int(6)] = random() < 0.5 ? 'WAIT' : 'PUSH';
    const slots = program.flatMap((op, slot) => op === 'BACK' ? [slot] : []).slice(0, 3);
    preferredSolution = slots.map(slot => ({ slot, op: 'JUMP' }));
  }
  const reporters = ['Ops', 'QA', 'Nuit', 'Alex', 'Sam', 'Robin', 'Camille'];
  const ticket = {
      id: `INC-${String(hashSeed(derive(seed, 'id')) % 10000).padStart(4, '0')}`,
      seed: String(seed), tier, arena: layout.arena, start: layout.start, exit: layout.exit, family,
      title: '', titleKey: '', titleParams: {}, reporter: reporters[random.int(reporters.length)],
      beacons: tier === 4 && family === 'aisle' && random() < 0.3 ? [{ id: 'b0', x: layout.start.x + (layout.start.dir === 1 ? 2 : -2), y: layout.start.y }] : [],
      program, cycles: TIERS[tier].cycles, par: null, solution: [],
      generatorVersion: GENERATOR_VERSION,
    };
  if (attempt === 0 && family !== 'aisle') {
    if (random() < 0.4) {
      const variant = 1 + random.int(15);
      const proposed = generateLogicalArena(seed, tier, attempt, family, variant);
      const changed = { ...ticket, arena: proposed.arena, start: proposed.start, exit: proposed.exit };
      if (witnessResolves(changed, preferredSolution)) Object.assign(ticket, changed, { layoutVariant: variant });
    }
    if (random() < 0.45) {
      for (let probe = 0; probe < 3; probe++) {
        const slot = random.int(6);
        if (slot === preferredSolution[0]?.slot) continue;
        const op = random.pick(OPS.filter(value => value !== ticket.program[slot]));
        const changed = { ...ticket, program: ticket.program.map((value, index) => index === slot ? op : value) };
        if (changed.program.filter(value => ['FWD', 'BACK', 'JUMP'].includes(value)).length < 2) continue;
        if (witnessResolves(changed, preferredSolution)) { Object.assign(ticket, changed, { programVariant: true }); break; }
      }
    }
  }
  return { ticket, preferredSolution };
}

function* generateSteps(seed, tier = 1, options = {}) {
  if (!TIERS[tier]) throw new RangeError('Invalid ticket tier');
  for (let attempt = 0; attempt < 40; attempt++) {
    const { ticket, preferredSolution } = candidate(String(seed), tier, attempt);
    ticket.requiredClaims = ticket.beacons.length;
    // Solo has no runtime randomness. An exact proof may be reused only when
    // the COMPLETE initial gameplay state is identical, excluding its seed
    // label. Different crates, holes, programs or beacons receive another key.
    // The preferred witness is part of the key too: it determines DFS order
    // and therefore which equally optimal solution is returned.
    const proofKey = `${serializeWorld({ ...worldFromTicket(ticket), seed: '' })}|${JSON.stringify(preferredSolution)}`;
    let proof;
    if (proofCache.has(proofKey)) proof = proofCache.get(proofKey);
    else {
      proof = yield* solveSteps(ticket, { maxPatches: Math.max(...TIERS[tier].pars), preferredSolution });
      proofCache.set(proofKey, proof);
      if (proofCache.size > 512) proofCache.delete(proofCache.keys().next().value);
    }
    if (proof && TIERS[tier].pars.includes(proof.par)) {
      Object.assign(ticket, { par: proof.par, solution: proof.solution.map(patch => patch ? { ...patch } : null), ...diagnose(ticket), attempt });
      ticket.title = ticket.titleKey;
      options.onProof?.({ ...proof.stats });
      return ticket;
    }
    yield { attempt: attempt + 1, rejected: true };
  }
  // Never label an easier puzzle with a harder priority. A fallback is explicit
  // and receives its own certified tier and dimensions, matching the spec.
  if (tier > 1) {
    const fallback = yield* generateSteps(seed, tier - 1, options);
    return { ...fallback, requestedTier: tier };
  }
  throw new Error('Unable to generate a certified ticket');
}

export function generateTicketSync(seed, tier = 1, options = {}) {
  const iterator = generateSteps(seed, tier, options);
  let item;
  do { item = iterator.next(); } while (!item.done);
  return item.value;
}

export function generateTicket(seed, tier = 1, options = {}) {
  return drainAsync(generateSteps(seed, tier, options), options);
}
