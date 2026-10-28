import assert from 'node:assert/strict';
import { setupProd } from '../src/prod/setup.js';
import { choosePatch, observedWorld } from '../src/ai/bot.js';
import { serializeWorld } from '../src/core/world.js';

export default async function run() {
  const world = setupProd('bot-determinism', { count: 8 });
  const before = serializeWorld(world);
  for (const level of ['intern', 'ops', 'senior']) {
    assert.deepEqual(choosePatch(world, 'r1', level), choosePatch(world, 'r1', level), `${level} is deterministic`);
  }
  assert.equal(serializeWorld(world), before, 'bots never mutate the real world');
  const known = { observed: Object.fromEntries(world.robots.map(robot => [robot.id, ['FWD', null, 'LEFT', null, 'WAIT', null]])) };
  const observation = observedWorld(world, 'r1', known);
  assert.deepEqual(observation.robots[0].program, ['FWD', 'WAIT', 'LEFT', 'WAIT', 'WAIT', 'WAIT']);
  assert.deepEqual(observation.robots[1].program, world.robots[1].program);
  const expected = choosePatch(world, 'r1', 'ops', known);
  const secretChanged = setupProd('bot-determinism', { count: 8 });
  for (const robot of secretChanged.robots) if (robot.id !== 'r1') robot.program = Array(6).fill('JUMP');
  assert.deepEqual(choosePatch(secretChanged, 'r1', 'ops', known), expected, 'hidden opponent patches cannot affect bot decision');
  for (const robot of secretChanged.robots) if (robot.id !== 'r1') Object.defineProperty(robot, 'program', { enumerable: true, get() { throw new Error('Hidden program was read'); } });
  assert.deepEqual(choosePatch(secretChanged, 'r1', 'ops', known), expected, 'hidden program properties are never read');
  assert.deepEqual(choosePatch(secretChanged, 'r1', 'senior', known), choosePatch(world, 'r1', 'senior', known));

  // Force an adjacent opponent to exercise the complete senior response set.
  const timings = [];
  for (let index = 0; index < 4; index++) {
    const adjacent = setupProd(`senior-performance-${index}`, { count: 8 });
    adjacent.robots[0].x = 4; adjacent.robots[0].y = 4;
    adjacent.robots[1].x = 5; adjacent.robots[1].y = 4;
    adjacent.tiles[4 * 12 + 4] = 0; adjacent.tiles[4 * 12 + 5] = 0;
    adjacent.crates = adjacent.crates.filter(crate => crate.y !== 4 || (crate.x !== 4 && crate.x !== 5));
    const started = performance.now();
    const patch = choosePatch(adjacent, 'r0', 'senior');
    const elapsed = performance.now() - started;
    timings.push(elapsed);
    assert.ok(patch === null || (patch.slot >= 0 && patch.slot < 6));
    assert.ok(elapsed < 100, `senior at eight robots: ${elapsed.toFixed(1)} ms`);
  }
  return { deterministicLevels: 3, hiddenProgramChecks: 3, seniorMaxMs: +Math.max(...timings).toFixed(2), seniorAverageMs: +(timings.reduce((sum, value) => sum + value, 0) / timings.length).toFixed(2) };
}
