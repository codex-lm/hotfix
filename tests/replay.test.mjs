import assert from 'node:assert/strict';
import { createRng, derive } from '../src/core/rng.js';
import { createWorld, serializeWorld, deserializeWorld } from '../src/core/world.js';
import { replay } from '../src/core/replay.js';
import { runCycle } from '../src/core/sim.js';

export default async function run() {
  const a = createRng('seed'); const b = createRng('seed');
  assert.deepEqual(Array.from({ length: 100 }, a), Array.from({ length: 100 }, b));
  assert.notEqual(derive('ab', 'c'), derive('a', 'bc'));
  assert.notEqual(derive('seed', 'ticket', 0), derive('seed', 'ticket', 1));
  const initialWorld = createWorld({
    w: 8, h: 6, conveyors: [[10, 1], [11, 2]], seed: 'replay', maxCycles: 6,
    tiles: Array.from({ length: 48 }, (_, index) => index === 27 ? 2 : 0),
    crates: [{ x: 4, y: 2 }],
    robots: [{ id: 'r0', x: 1, y: 1, dir: 1, program: ['FWD', 'RIGHT', 'FWD', 'LEFT', 'WAIT', 'JUMP'] }],
  });
  const log = [
    { cycle: 0, robotId: 'r0', patch: { slot: 4, op: 'FWD' } },
    { cycle: 1, robotId: 'r0', patch: null },
    { cycle: 2, robotId: 'r0', patch: { slot: 5, op: 'BACK' } },
  ];
  const first = replay('replay', 'tickets', { initialWorld }, log);
  const second = replay('replay', 'tickets', { initialWorld }, log);
  assert.equal(serializeWorld(first), serializeWorld(second), 'replay is byte-identical');
  assert.equal(serializeWorld(deserializeWorld(serializeWorld(first))), serializeWorld(first), 'world round trip preserves canonical bytes');
  let direct = initialWorld;
  for (const entry of log) direct = runCycle(direct, [entry]).world;
  assert.equal(serializeWorld(first), serializeWorld(direct), 'replay matches played deployments');
  const differentlyOrderedMap = createWorld({ ...initialWorld, conveyors: [[11, 2], [10, 1]] });
  assert.equal(serializeWorld(initialWorld), serializeWorld(differentlyOrderedMap), 'canonical map ordering');
  return { replays: 3, deterministicDraws: 100 };
}
