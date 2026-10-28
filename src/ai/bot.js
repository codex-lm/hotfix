import { createWorld } from '../core/world.js';
import { runCycle } from '../core/sim.js';
import { DX, DY, isOpcode } from '../core/opcodes.js';

export const BOT_TIE_ORDER = Object.freeze(['FWD', 'LEFT', 'RIGHT', 'JUMP', 'PUSH', 'WAIT', 'BACK']);

function patchOptions(program) {
  const options = [null];
  for (let slot = 0; slot < 6; slot++) for (const op of BOT_TIE_ORDER) if (program[slot] !== op) options.push({ slot, op });
  return options;
}

function publicRobot(robot, robotId, observations) {
  // Copy public metadata without even reading the opponent's program property.
  // This makes the information boundary testable using a throwing getter.
  const copy = {};
  for (const key of Object.keys(robot)) if (key !== 'program') copy[key] = robot[key];
  if (robot.id === robotId) copy.program = [...robot.program];
  else {
    const observed = observations?.observed?.[robot.id] ?? observations?.[robot.id] ?? robot.observed ?? [];
    copy.program = Array.from({ length: 6 }, (_, index) => isOpcode(observed[index]) ? observed[index] : 'WAIT');
  }
  return copy;
}

export function observedWorld(world, robotId, observations) {
  return createWorld({ ...world, robots: world.robots.map(robot => publicRobot(robot, robotId, observations)) });
}

function score(world, robotId, initialClaims, initialFalls) {
  const robot = world.robots.find(item => item.id === robotId);
  let distance = Infinity; let facing = false;
  for (const beacon of world.beacons) {
    const d = Math.abs(beacon.x - robot.x) + Math.abs(beacon.y - robot.y);
    const next = Math.abs(beacon.x - robot.x - DX[robot.dir]) + Math.abs(beacon.y - robot.y - DY[robot.dir]);
    if (d < distance) { distance = d; facing = next < d; }
    else if (d === distance && next < d) facing = true;
  }
  if (!Number.isFinite(distance)) distance = 0;
  // Facing means that one forward step would reduce Manhattan distance.
  return 100 * (robot.claims - initialClaims) - 30 * (robot.falls - initialFalls) - distance + (facing ? 5 : 0);
}

function evaluate(world, robotId, patch, horizon, neighborPatch, neighborId) {
  const own = world.robots.find(robot => robot.id === robotId);
  const claims = own.claims; const falls = own.falls;
  const patches = [];
  if (patch) patches.push({ robotId, ...patch });
  if (neighborPatch) patches.push({ robotId: neighborId, ...neighborPatch });
  let next = world;
  for (let cycle = 0; cycle < horizon && next.status === 'playing'; cycle++) next = runCycle(next, cycle === 0 ? patches : [], { trace: false }).world;
  return score(next, robotId, claims, falls);
}

export function choosePatch(input, robotId, level = 'ops', observations) {
  if (input.status !== 'playing') return null;
  let world = observedWorld(input, robotId, observations);
  const robot = world.robots.find(item => item.id === robotId);
  if (!robot) throw new RangeError('Unknown bot robot');
  if (level === 'intern') world = createWorld({ ...world, robots: [robot] });
  const options = patchOptions(robot.program);
  const horizon = level === 'intern' ? 1 : 2;
  const neighbor = level === 'senior' ? world.robots.find(other => other.id !== robotId && Math.abs(other.x - robot.x) + Math.abs(other.y - robot.y) === 1) : null;
  const responses = neighbor ? patchOptions(neighbor.program) : [null];
  let best = null; let bestScore = -Infinity;
  for (const patch of options) {
    let worst = Infinity;
    for (const response of responses) {
      const value = evaluate(world, robotId, patch, horizon, response, neighbor?.id);
      if (value < worst) worst = value;
      // Exact minimax pruning: this candidate cannot beat the earlier choice.
      if (worst <= bestScore) break;
    }
    if (worst > bestScore) { bestScore = worst; best = patch; }
  }
  return best;
}
