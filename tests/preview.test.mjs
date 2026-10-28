import assert from 'node:assert/strict';
import { createWorld, serializeWorld } from '../src/core/world.js';
import { createRng } from '../src/core/rng.js';
import { OPS } from '../src/core/opcodes.js';
import { runCycle } from '../src/core/sim.js';
import { preview } from '../src/core/trace.js';

export default async function run() {
  const rng = createRng('preview-acceptance');
  for (let index = 0; index < 200; index++) {
    const w = 10; const h = 8;
    const tiles = Array.from({ length: w * h }, (_, cell) => {
      const x = cell % w; const y = Math.floor(cell / w);
      if (x === 0 || y === 0 || x === w - 1 || y === h - 1) return 1;
      return rng() < 0.1 ? 2 : rng() < 0.12 ? 1 : 0;
    });
    tiles[11] = 0; tiles[68] = 0;
    const world = createWorld({ w, h, tiles, exit: { x: 8, y: 6 }, maxCycles: 6, seed: `preview-${index}`,
      robots: [{ id: 'r0', x: 1, y: 1, dir: rng.int(4), program: Array.from({ length: 6 }, () => rng.pick(OPS)) }],
    });
    const patch = { slot: rng.int(6), op: rng.pick(OPS) };
    const before = serializeWorld(world);
    const predicted = preview(world, 'r0', patch);
    const played = runCycle(world, [{ robotId: 'r0', ...patch }]);
    assert.equal(serializeWorld(predicted.world), serializeWorld(played.world), `preview world ${index}`);
    assert.equal(JSON.stringify(predicted.trace), JSON.stringify(played.trace), `preview trace ${index}`);
    assert.equal(serializeWorld(world), before, `preview purity ${index}`);
  }
  return { worlds: 200, patches: 200 };
}
