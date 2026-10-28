import assert from 'node:assert/strict';
import { setupProd, setupRoster, rankRobots } from '../src/prod/setup.js';
import { serializeWorld } from '../src/core/world.js';
import { runCycle } from '../src/core/sim.js';
import { createLocalGame } from '../src/net/local.js';

export default async function run() {
  for (let index = 0; index < 100; index++) {
    const world = setupProd(`prod-test-${index}`, { count: 4 + index % 5 });
    assert.equal(world.w, 12); assert.equal(world.h, 9);
    assert.equal(world.maxCycles, 12); assert.equal(world.targetClaims, 3);
    assert.equal(world.mode, 'prod'); assert.equal(world.beacons.length, 3); assert.equal(world.crates.length, 2);
    assert.ok(world.conveyors.size >= 2 && world.conveyors.size <= 8, 'one or two conveyor lines');
    assert.equal(serializeWorld(setupProd(`prod-test-${index}`, { count: 4 + index % 5 })), serializeWorld(world));
    for (const robot of world.robots) {
      assert.ok(robot.program.filter(op => ['FWD', 'BACK', 'JUMP'].includes(op)).length >= 2);
      assert.equal(world.tiles[robot.y * world.w + robot.x], 0);
      for (const other of world.robots) if (other !== robot) assert.ok(Math.abs(other.x - robot.x) + Math.abs(other.y - robot.y) >= 3);
      for (const beacon of world.beacons) assert.ok(Math.abs(beacon.x - robot.x) + Math.abs(beacon.y - robot.y) >= 3);
    }
  }
  assert.equal(setupRoster({ count: 2 }).length, 4, 'bots fill to minimum four');
  const roster = setupRoster({ roster: [{ id: 'alice', bot: null }, { id: 'bob', bot: null }] });
  assert.equal(roster[0].bot, null); assert.equal(roster[1].bot, null); assert.ok(roster[3].bot);
  assert.throws(() => setupRoster({ roster: [{ id: 'r' }, { id: 'r' }] }), /Duplicate/);
  const rankingWorld = setupProd('ranking');
  Object.assign(rankingWorld.robots[0], { claims: 2, falls: 1, lastClaim: 5 });
  Object.assign(rankingWorld.robots[1], { claims: 2, falls: 0, lastClaim: 9 });
  Object.assign(rankingWorld.robots[2], { claims: 2, falls: 0, lastClaim: 7 });
  assert.deepEqual(rankRobots(rankingWorld).map(row => row.id), ['r2', 'r1', 'r0', 'r3']);
  const shortWorld = setupProd('local-game', { cycles: 2, level: 'intern' });
  const game = createLocalGame(shortWorld);
  let callbacks = 0;
  const unsubscribe = game.onCycle(result => { callbacks++; assert.equal(result.patches.length, 4); });
  const initialSnapshot = serializeWorld(shortWorld);
  const result = game.send(null);
  assert.equal(result.world.cycle, 1); assert.equal(callbacks, 1);
  assert.equal(serializeWorld(shortWorld), initialSnapshot, 'local game never mutates caller world');
  const direct = runCycle(shortWorld, result.patches).world;
  for (const robot of direct.robots) robot.observed = [...result.world.robots.find(other => other.id === robot.id).observed];
  assert.equal(serializeWorld(direct), serializeWorld(result.world), 'local transport delegates every rule to shared simulator');
  assert.equal(game.send({ cycle: 0, patch: null }), null, 'late cycle command ignored');
  const isolated = game.getWorld(); isolated.robots[0].claims = 99;
  assert.notEqual(game.getWorld().robots[0].claims, 99, 'getWorld returns independent copy');
  unsubscribe();
  const final = game.send({ patch: null });
  assert.equal(final.world.status, 'ended'); assert.equal(final.ranking.length, 4); assert.equal(callbacks, 1);
  game.dispose(); assert.throws(() => game.send(null), /disposed/);
  return { setupSeeds: 100, localCycles: 2 };
}
