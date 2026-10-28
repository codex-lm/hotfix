import assert from 'node:assert/strict';
import { createWorld, cloneWorld, serializeWorld, FLOOR, WALL, HOLE } from '../src/core/world.js';
import { step, runCycle } from '../src/core/sim.js';

const waiting = () => Array(6).fill('WAIT');
const program = op => [op, ...Array(5).fill('WAIT')];

// ASCII is deliberately independent of the production arena generator.
function ascii(text, robotConfigs = [], extra = {}) {
  const rows = text.trim().split('\n').map(row => row.trim());
  const w = rows[0].length;
  const h = rows.length;
  assert.ok(rows.every(row => row.length === w));
  const tiles = new Uint8Array(w * h);
  const conveyors = new Map();
  const robots = [];
  const crates = [];
  const beacons = [];
  let exit = null;
  rows.forEach((row, y) => [...row].forEach((char, x) => {
    tiles[y * w + x] = char === '#' ? WALL : char === 'O' ? HOLE : FLOOR;
    if ('^>v<'.includes(char)) conveyors.set(y * w + x, '^>v<'.indexOf(char));
    if (char === 'C') crates.push({ x, y });
    if (char === '*') beacons.push({ x, y });
    if (char === 'X') exit = { x, y };
    if (/\d/.test(char)) {
      const index = Number(char);
      robots[index] = { id: `r${index}`, x, y, dir: 1, program: waiting(), ...robotConfigs[index] };
    }
  }));
  return createWorld({ w, h, tiles, conveyors, crates, beacons, exit, robots, ...extra });
}

export default async function run() {
  const cases = [
    ['FWD advances', '########\n#0.....#\n########', 'FWD', [2, 1, 1]],
    ['BACK keeps heading', '########\n#.0....#\n########', 'BACK', [1, 1, 1]],
    ['LEFT rotates', '########\n#0.....#\n########', 'LEFT', [1, 1, 0]],
    ['RIGHT rotates', '########\n#0.....#\n########', 'RIGHT', [1, 1, 2]],
    ['WAIT holds', '########\n#0.....#\n########', 'WAIT', [1, 1, 1]],
    ['JUMP skips a hole', '########\n#0O....#\n########', 'JUMP', [3, 1, 1]],
    ['JUMP skips a crate', '########\n#0C....#\n########', 'JUMP', [3, 1, 1]],
    ['JUMP skips a wall', '########\n#0#....#\n########', 'JUMP', [3, 1, 1]],
    ['FWD wall blocks', '########\n#0#....#\n########', 'FWD', [1, 1, 1]],
    ['BACK wall blocks', '########\n#0.....#\n########', 'BACK', [1, 1, 1]],
    ['JUMP occupied landing blocks', '########\n#0.C...#\n########', 'JUMP', [1, 1, 1]],
    ['BACK never pushes', '########\n#C0....#\n########', 'BACK', [2, 1, 1]],
    ['PUSH does not move pusher', '########\n#0C....#\n########', 'PUSH', [1, 1, 1]],
  ];
  for (const [name, board, op, expected] of cases) {
    const initial = ascii(board, [{ program: program(op) }]);
    const before = serializeWorld(initial);
    const { world } = step(initial, 0);
    const robot = world.robots[0];
    assert.deepEqual([robot.x, robot.y, robot.dir], expected, name);
    assert.equal(serializeWorld(initial), before, `${name}: no input mutation`);
  }

  let initial = ascii('########\n#0CC...#\n########', [{ program: program('FWD') }]);
  let result = step(initial, 0);
  assert.equal(result.world.robots[0].x, 2);
  assert.deepEqual(result.world.crates.map(crate => crate.x), [3, 4], 'whole chain moves atomically');
  assert.equal(result.events.filter(event => event.type === 'pushed').length, 2);

  initial = ascii('########\n#0CC#..#\n########', [{ program: program('FWD') }]);
  result = step(initial, 0);
  assert.deepEqual(result.world.crates.map(crate => crate.x), [2, 3], 'wall blocks whole push chain');
  assert.equal(result.world.robots[0].x, 1);

  initial = ascii('########\n#0CO...#\n########', [{ program: program('FWD') }]);
  result = step(initial, 0);
  assert.equal(result.world.crates.length, 0, 'crate disappears into hole');
  assert.equal(result.world.tiles[1 * 8 + 3], FLOOR, 'crate permanently fills hole');
  assert.equal(initial.tiles[1 * 8 + 3], HOLE, 'input tile map unchanged');

  initial = ascii('########\n#01....#\n########', [{ program: program('PUSH') }, { dir: 2 }]);
  result = step(initial, 0);
  assert.deepEqual([result.world.robots[1].x, result.world.robots[1].dir], [3, 2], 'pushed robot keeps orientation');

  initial = ascii('########\n#0O....#\n########', [{ program: program('FWD'), home: { x: 1, y: 1, dir: 0 } }]);
  result = step(initial, 0);
  assert.deepEqual([result.world.robots[0].x, result.world.robots[0].y, result.world.robots[0].dir, result.world.robots[0].falls], [1, 1, 0, 1]);
  assert.deepEqual(result.events.filter(event => ['fell', 'respawned'].includes(event.type)).map(event => event.type), ['fell', 'respawned']);

  initial = ascii('#######\n#.....#\n#.1...#\n#.0O..#\n#.....#\n#######', [
    { program: program('FWD'), home: { x: 2, y: 2, dir: 3 } }, { dir: 0 },
  ]);
  result = step(initial, 0);
  assert.deepEqual([result.world.robots[0].x, result.world.robots[0].y], [2, 1], 'occupied home chooses nearest N tile');

  initial = ascii('########\n#0.O...#\n########', [{ program: program('JUMP') }]);
  result = step(initial, 0);
  assert.equal(result.world.robots[0].falls, 1, 'jump landing on hole falls');

  initial = ascii('########\n#0>....#\n########', [{ program: program('FWD') }]);
  result = step(initial, 0);
  assert.equal(result.world.robots[0].x, 3, 'conveyor acts after instruction');
  assert.equal(result.world.robots[0].dir, 1);

  initial = ascii('########\n#0>O...#\n########', [{ program: program('FWD') }]);
  result = step(initial, 0);
  assert.equal(result.world.robots[0].falls, 1, 'conveyor can cause fall');

  initial = ascii('########\n#0C>O..#\n########', [{ program: program('PUSH') }]);
  result = step(initial, 0);
  assert.equal(result.world.crates.length, 0, 'conveyor crate fills hole');
  assert.equal(result.world.tiles[12], FLOOR);

  initial = ascii('#######\n#0.1..#\n#######');
  initial.conveyors.set(8, 1); initial.conveyors.set(10, 3);
  result = step(initial, 0);
  assert.deepEqual(result.world.robots.map(robot => robot.x), [1, 3], 'simultaneous destination conflict blocks both');

  initial = ascii('#######\n#01C..#\n#######');
  initial.conveyors.set(8, 1); initial.conveyors.set(9, 1);
  result = step(initial, 0);
  assert.deepEqual(result.world.robots.map(robot => robot.x), [1, 2], 'stationary blocker propagates backwards');

  initial = ascii('#######\n#01...#\n#######');
  initial.conveyors.set(8, 1); initial.conveyors.set(9, 3);
  result = step(initial, 0);
  assert.deepEqual(result.world.robots.map(robot => robot.x), [2, 1], 'closed conveyor cycle swaps simultaneously');

  initial = ascii('########\n#0.1...#\n########', [{ program: program('FWD') }, { dir: 3, program: program('FWD') }]);
  const firstPriority = step(initial, 0).world;
  initial.cycle = 1;
  const secondPriority = step(initial, 0).world;
  assert.deepEqual(firstPriority.robots.map(robot => robot.x), [1, 2]);
  assert.deepEqual(secondPriority.robots.map(robot => robot.x), [2, 3], 'priority rotates each cycle');

  initial = ascii('########\n#0X*...#\n########', [{ program: ['FWD', 'FWD', 'BACK', 'WAIT', 'WAIT', 'WAIT'] }], { requiredClaims: 1 });
  result = runCycle(initial);
  assert.equal(result.world.status, 'success');
  assert.equal(result.world.robots[0].claims, 1);
  assert.equal(result.trace.length, 3, 'exit remains locked until beacon claimed');
  assert.equal(result.world.cycle, 1);

  initial = ascii('########\n#0X....#\n########', [{ program: program('FWD') }]);
  result = runCycle(initial);
  assert.equal(result.trace.length, 1, 'successful tick ends cycle immediately');
  assert.equal(result.world.cycle, 1);
  assert.equal(result.world.status, 'success');
  assert.equal(runCycle(result.world).world.cycle, 1, 'finished world does not advance');

  initial = ascii('########\n#0.....#\n########', [], { maxCycles: 1 });
  result = runCycle(initial, [{ robotId: 'r0', slot: 0, op: 'RIGHT' }]);
  assert.equal(result.world.status, 'ended', 'cycle budget exhausts');
  assert.equal(result.world.robots[0].version, 1);
  assert.equal(result.world.robots[0].dir, 2, 'patch is active before tick one');
  assert.equal(initial.robots[0].program[0], 'WAIT');
  assert.throws(() => runCycle(initial, [{ robotId: 'r0', slot: 6, op: 'FWD' }]), /Invalid patch/);
  assert.throws(() => runCycle(initial, [{ robotId: 'r0', slot: 1, op: 'FWD' }, { robotId: 'r0', slot: 2, op: 'FWD' }]), /Only one patch/);

  const copy = cloneWorld(initial);
  copy.robots[0].home.x = 4; copy.conveyors.set(10, 1); copy.tiles[10] = HOLE;
  assert.equal(initial.robots[0].home.x, 1);
  assert.equal(initial.conveyors.size, 0);
  assert.equal(initial.tiles[10], FLOOR);

  initial = ascii('########\n#0>>...#\n########', [{ program: program('FWD') }]);
  result = step(initial, 0);
  assert.equal(result.world.robots[0].x, 3, 'conveyors move each object exactly once per tick');

  initial = ascii('########\n#0C....#\n########', [{ program: program('BACK') }]);
  initial.conveyors.set(10, 3);
  result = step(initial, 0);
  assert.equal(result.world.crates[0].x, 2, 'conveyor never pushes stationary robot');

  initial = ascii('########\n#0O....#\n########', [{ program: program('FWD'), home: { x: 1, y: 1, dir: 0 } }]);
  initial.conveyors.set(9, 1);
  result = step(initial, 0);
  assert.equal(result.world.robots[0].falls, 2, 'a respawn can be conveyed into another fall during same tick');

  initial = ascii('########\n#0..*..#\n#......#\n#......#\n#......#\n########', [{ program: program('FWD') }], { mode: 'prod', maxCycles: 12 });
  initial.beacons[0].x = 2;
  result = step(initial, 0);
  assert.equal(result.world.robots[0].claims, 1, 'prod beacon is claimed');
  assert.equal(result.world.beacons.length, 1, 'prod beacon immediately respawns');
  const spawned = result.world.beacons[0];
  assert.ok(Math.abs(spawned.x - 2) + Math.abs(spawned.y - 1) >= 3);
  assert.equal(serializeWorld(step(initial, 0).world), serializeWorld(result.world), 'beacon respawn is deterministic');
  initial.robots[0].claims = 2;
  result = step(initial, 0);
  assert.equal(result.world.status, 'ended', 'third prod beacon wins immediately');
  assert.equal(result.world.solvedBy, 'r0');

  initial = ascii('########\n#0CO...#\n#......#\n########', [{ program: ['PUSH', 'FWD', 'RIGHT', 'FWD', 'JUMP', 'LEFT'] }]);
  assert.equal(serializeWorld(runCycle(initial).world), serializeWorld(runCycle(initial, [], { trace: false }).world), 'trace-free simulator has identical state');
  assert.deepEqual(runCycle(initial, [], { trace: false }).trace, []);
  return { asciiCases: cases.length, ruleGroups: 30 };
}
