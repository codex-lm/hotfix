import { cloneWorld, FLOOR, WALL, HOLE, tileAt, indexOf } from './world.js';
import { DX, DY, isOpcode } from './opcodes.js';
import { createRng, derive } from './rng.js';

function at(world, x, y, exclude = null) {
  for (const robot of world.robots) if (robot !== exclude && robot.x === x && robot.y === y) return { object: robot, kind: 'robot' };
  for (const crate of world.crates) if (crate !== exclude && crate.x === x && crate.y === y) return { object: crate, kind: 'crate' };
  return null;
}
function point(object) { return { x: object.x, y: object.y }; }
function order(world) {
  const count = world.robots.length;
  return Array.from({ length: count }, (_, index) => world.robots[(world.cycle + index) % count]);
}
function eventFor(type, object, kind, detail = {}) {
  return { type, ...(kind === 'robot' ? { robotId: object.id } : { crateId: object.id }), kind, ...detail };
}

function fillHole(world, object, kind, events) {
  if (kind !== 'crate' || tileAt(world, object.x, object.y) !== HOLE) return;
  world.tiles[indexOf(world, object.x, object.y)] = FLOOR;
  world.crates = world.crates.filter(crate => crate !== object);
  events?.push(eventFor('filled', object, kind, { at: point(object) }));
}

function push(world, x, y, dir, robotId, events) {
  const chain = [];
  let currentX = x;
  let currentY = y;
  while (true) {
    if (tileAt(world, currentX, currentY) === WALL) return false;
    const occupant = at(world, currentX, currentY);
    if (!occupant) break;
    chain.push(occupant);
    currentX += DX[dir]; currentY += DY[dir];
  }
  for (let index = chain.length - 1; index >= 0; index--) {
    const { object, kind } = chain[index];
    const from = point(object);
    object.x += DX[dir]; object.y += DY[dir];
    events?.push(eventFor('pushed', object, kind, { by: robotId, from, to: point(object), dir }));
    fillHole(world, object, kind, events);
  }
  return true;
}

function execute(world, robot, tick, events) {
  const op = robot.program[tick];
  events?.push({ type: 'instruction', robotId: robot.id, op, slot: tick });
  if (op === 'LEFT' || op === 'RIGHT') {
    const fromDir = robot.dir;
    robot.dir = (robot.dir + (op === 'LEFT' ? 3 : 1)) % 4;
    events?.push({ type: 'turned', robotId: robot.id, fromDir, dir: robot.dir, at: point(robot) });
    return;
  }
  if (op === 'WAIT') return;
  const dir = op === 'BACK' ? (robot.dir + 2) % 4 : robot.dir;
  const distance = op === 'JUMP' ? 2 : 1;
  const x = robot.x + DX[dir] * distance;
  const y = robot.y + DY[dir] * distance;
  const occupant = at(world, x, y);
  if (op === 'PUSH') {
    if (occupant && !push(world, x, y, dir, robot.id, events)) events?.push({ type: 'blocked', robotId: robot.id, op, at: point(robot) });
    return;
  }
  if (tileAt(world, x, y) === WALL || (occupant && (op !== 'FWD' || !push(world, x, y, dir, robot.id, events)))) {
    events?.push({ type: 'blocked', robotId: robot.id, op, at: point(robot), target: { x, y } });
    return;
  }
  const from = point(robot);
  robot.x = x; robot.y = y;
  events?.push({ type: 'moved', robotId: robot.id, op, from, to: point(robot), dir });
}

function respawnPoint(world, robot) {
  // BFS expands N-E-S-O without treating walls as distance barriers: the rule
  // requires Manhattan distance, not the length of a walkable route.
  const queue = [{ x: robot.home.x, y: robot.home.y }];
  const visited = new Set();
  for (let head = 0; head < queue.length; head++) {
    const candidate = queue[head];
    const key = `${candidate.x},${candidate.y}`;
    if (visited.has(key)) continue;
    visited.add(key);
    if (candidate.x < 0 || candidate.y < 0 || candidate.x >= world.w || candidate.y >= world.h) continue;
    if (tileAt(world, candidate.x, candidate.y) === FLOOR && !at(world, candidate.x, candidate.y, robot)) return candidate;
    for (let dir = 0; dir < 4; dir++) queue.push({ x: candidate.x + DX[dir], y: candidate.y + DY[dir] });
  }
  throw new RangeError('No safe respawn tile');
}

function falls(world, events) {
  for (const robot of order(world)) {
    if (tileAt(world, robot.x, robot.y) !== HOLE) continue;
    const from = point(robot);
    robot.falls++;
    const destination = respawnPoint(world, robot);
    robot.x = destination.x; robot.y = destination.y; robot.dir = robot.home.dir;
    events?.push({ type: 'fell', robotId: robot.id, from, falls: robot.falls });
    events?.push({ type: 'respawned', robotId: robot.id, to: point(robot), dir: robot.dir });
  }
}

function conveyors(world, events) {
  const objects = [
    ...world.robots.map(object => ({ object, kind: 'robot' })),
    ...world.crates.map(object => ({ object, kind: 'crate' })),
  ];
  const occupancy = new Map(objects.map(item => [indexOf(world, item.object.x, item.object.y), item.object]));
  const candidates = new Map();
  const destinations = new Map();
  for (const item of objects) {
    const { object } = item;
    const dir = world.conveyors.get(indexOf(world, object.x, object.y));
    if (dir === undefined) continue;
    const x = object.x + DX[dir]; const y = object.y + DY[dir];
    if (tileAt(world, x, y) === WALL) continue;
    const destination = indexOf(world, x, y);
    candidates.set(object, { ...item, x, y, dir, destination });
    destinations.set(destination, (destinations.get(destination) ?? 0) + 1);
  }
  for (const [object, candidate] of candidates) if (destinations.get(candidate.destination) > 1) candidates.delete(object);
  // Remove blocked dependencies until stable. Closed conveyor cycles survive.
  let changed = true;
  while (changed) {
    changed = false;
    for (const [object, candidate] of candidates) {
      const blocking = occupancy.get(candidate.destination);
      if (blocking && !candidates.has(blocking)) { candidates.delete(object); changed = true; }
    }
  }
  for (const candidate of candidates.values()) {
    const from = point(candidate.object);
    candidate.object.x = candidate.x; candidate.object.y = candidate.y;
    events?.push(eventFor('conveyed', candidate.object, candidate.kind, { from, to: point(candidate.object), dir: candidate.dir }));
  }
  for (const candidate of candidates.values()) fillHole(world, candidate.object, candidate.kind, events);
}

function relocateBeacon(world, beacon, events) {
  const candidates = [];
  for (let y = 0; y < world.h; y++) for (let x = 0; x < world.w; x++) {
    if (tileAt(world, x, y) !== FLOOR || world.conveyors.has(indexOf(world, x, y)) || at(world, x, y)) continue;
    if (world.beacons.some(other => other !== beacon && other.x === x && other.y === y)) continue;
    if (world.robots.some(robot => Math.abs(robot.x - x) + Math.abs(robot.y - y) < 3)) continue;
    candidates.push({ x, y });
  }
  world.beaconSerial++;
  // Arena setup guarantees a candidate; fail explicitly for malformed inputs.
  if (!candidates.length) throw new RangeError('No legal beacon respawn tile');
  const next = createRng(derive(world.seed, 'beacon', world.beaconSerial)).pick(candidates);
  beacon.x = next.x; beacon.y = next.y;
  events?.push({ type: 'beaconSpawned', beaconId: beacon.id, at: point(beacon) });
}

function claims(world, events) {
  for (const robot of order(world)) {
    const beacon = world.beacons.find(item => item.x === robot.x && item.y === robot.y);
    if (beacon) {
      robot.claims++; world.claimSerial++;
      robot.lastClaim = world.claimSerial;
      events?.push({ type: 'claimed', robotId: robot.id, beaconId: beacon.id, at: point(robot), claims: robot.claims });
      if (world.mode === 'prod') {
        if (robot.claims >= (world.targetClaims ?? 3)) { world.status = 'ended'; world.solvedBy = robot.id; return; }
        relocateBeacon(world, beacon, events);
      } else world.beacons = world.beacons.filter(item => item !== beacon);
    }
    if (world.mode === 'tickets' && world.exit && robot.x === world.exit.x && robot.y === world.exit.y && robot.claims >= world.requiredClaims) {
      world.status = 'success'; world.solvedBy = robot.id;
      events?.push({ type: 'exited', robotId: robot.id, at: point(robot) });
      return;
    }
  }
}

export function step(input, tick = input.tick ?? 0, options = {}) {
  if (!Number.isInteger(tick) || tick < 0 || tick > 5) throw new RangeError('Invalid tick');
  const world = cloneWorld(input);
  const events = options.events === false ? null : [];
  if (world.status !== 'playing') return { world, events: events ?? [] };
  for (const robot of order(world)) execute(world, robot, tick, events);
  falls(world, events);
  conveyors(world, events);
  falls(world, events);
  claims(world, events);
  world.tick = tick;
  return { world, events: events ?? [] };
}

export function applyPatches(input, patches = []) {
  const world = cloneWorld(input);
  const seen = new Set();
  for (const entry of patches) {
    if (!entry) continue;
    const robotId = entry.robotId ?? world.robots[0]?.id;
    if (seen.has(robotId)) throw new RangeError('Only one patch per robot per cycle');
    seen.add(robotId);
    const patch = Object.hasOwn(entry, 'patch') ? entry.patch : entry;
    if (patch === null) continue;
    const robot = world.robots.find(item => item.id === robotId);
    if (!robot || !Number.isInteger(patch.slot) || patch.slot < 0 || patch.slot > 5 || !isOpcode(patch.op)) throw new RangeError('Invalid patch');
    if (robot.program[patch.slot] !== patch.op) { robot.program[patch.slot] = patch.op; robot.version++; }
  }
  return world;
}

export function runCycle(input, patches = [], options = {}) {
  let world = input.status === 'playing' ? applyPatches(input, patches) : cloneWorld(input);
  const trace = [];
  if (world.status !== 'playing') return { world, trace };
  for (let tick = 0; tick < 6; tick++) {
    const before = world;
    const result = step(world, tick, { events: options.trace !== false });
    world = result.world;
    if (options.trace !== false) trace.push({ tick, before, world, events: result.events });
    if (world.status !== 'playing') break;
  }
  // The cycle counter counts deployments, including a partial winning cycle.
  world = { ...world, cycle: world.cycle + 1, tick: 0 };
  if (world.status === 'playing' && world.cycle >= world.maxCycles) world.status = 'ended';
  return { world, trace };
}
