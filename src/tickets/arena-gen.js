import { createRng, derive } from '../core/rng.js';

export const TIERS = Object.freeze([
  null,
  { w: 8, h: 6, cycles: 3, pars: [1] },
  { w: 10, h: 7, cycles: 4, pars: [2] },
  { w: 10, h: 8, cycles: 5, pars: [2, 3] },
  { w: 12, h: 9, cycles: 6, pars: [3] },
]);

// Constructive candidates preserve a clear maintenance aisle. Decorations and
// hazards vary by seed; the solver, never the template, certifies their par.
export function generateArena(seed, tier = 1, attempt = 0) {
  const config = TIERS[tier];
  if (!config) throw new RangeError('Invalid ticket tier');
  const random = createRng(derive(seed, 'arena', tier, attempt));
  const { w, h } = config;
  const tiles = Array(w * h).fill(0);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (x === 0 || y === 0 || x === w - 1 || y === h - 1) tiles[y * w + x] = 1;
  }
  const row = 1 + random.int(h - 2);
  const mirrored = random() < 0.5;
  const start = { x: mirrored ? w - 2 : 1, y: row, dir: mirrored ? 3 : 1 };
  const exit = { x: mirrored ? 1 : w - 2, y: row };
  const available = [];
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    if (y !== row) available.push(y * w + x);
  }
  const shuffled = random.shuffle(available);
  const interiors = (w - 2) * (h - 2);
  const wallCount = Math.round(interiors * (0.08 + random() * 0.07));
  for (const index of shuffled.splice(0, wallCount)) tiles[index] = 1;
  if (tier >= 2) {
    const holeCount = Math.max(1, Math.floor(interiors * (0.025 + random() * 0.05)));
    for (const index of shuffled.splice(0, holeCount)) tiles[index] = 2;
  }
  const conveyors = [];
  if (tier >= 3) {
    const conveyorY = row === 1 ? h - 2 : 1;
    const length = 2 + random.int(3);
    const begin = 1 + random.int(w - length - 2);
    const direction = random() < 0.5 ? 0 : 2;
    for (let x = begin; x < begin + length; x++) {
      tiles[conveyorY * w + x] = 0;
      conveyors.push([conveyorY * w + x, direction]);
    }
  }
  if (tier >= 2 && !tiles.includes(2)) {
    const hole = shuffled.find(index => !conveyors.some(([cell]) => cell === index));
    if (hole !== undefined) tiles[hole] = 2;
  }
  const crates = [];
  if (tier === 4) {
    const count = 1 + random.int(3);
    const choices = random.shuffle(shuffled.filter(index => tiles[index] === 0 && !conveyors.some(([cell]) => cell === index)));
    for (const index of choices.slice(0, count)) crates.push({ x: index % w, y: Math.floor(index / w) });
  }
  return { arena: { w, h, tiles, conveyors, crates }, start, exit };
}

export function generateLogicalArena(seed, tier = 1, attempt = 0, family = 'elbow', variant = 0) {
  const { w, h } = TIERS[tier];
  const random = createRng(derive(seed, 'logical-arena', tier, attempt, family));
  const tiles = Array(w * h).fill(1);
  const conveyors = [];
  const crates = [];
  const carve = (x, y) => { tiles[y * w + x] = 0; };
  const horizontal = (x1, x2, y) => { for (let x = Math.min(x1, x2); x <= Math.max(x1, x2); x++) carve(x, y); };
  const vertical = (x, y1, y2) => { for (let y = Math.min(y1, y2); y <= Math.max(y1, y2); y++) carve(x, y); };
  let left = 1 + (variant & 1);
  let right = w - 2 - ((variant >> 1) & 1);
  let bottom = h - 2 - ((variant >> 2) & 1);
  let top = 1 + ((variant >> 3) & 1);
  if (right - left + bottom - top < (family === 'switchback' ? 7 : 5)) { left = 1; right = w - 2; bottom = h - 2; top = 1; }
  const start = { x: left, y: bottom, dir: 1 };
  let exit = { x: right, y: top };
  const middle = Math.ceil((left + right) / 2);
  if (family === 'elbow') {
    horizontal(left, right, bottom);
    vertical(right, top, bottom);
  } else if (family === 'zigzag') {
    horizontal(left, middle, bottom);
    vertical(middle, top, bottom);
    horizontal(middle, right, top);
  } else if (family === 'switchback') {
    horizontal(left, right, bottom);
    vertical(right, top, bottom);
    horizontal(left, right, top);
    exit = { x: left, y: top };
    // The route is long even though the exit is nearby. A shifted home keeps
    // the specification's Manhattan separation for the small tier-one board.
    start.x = left + 1;
    exit.x = right - 1;
  } else if (family === 'jump') {
    for (let y = 1; y < h - 1; y++) horizontal(1, w - 2, y);
    for (let y = 1; y < h - 1; y++) tiles[y * w + middle] = 2;
  } else if (family === 'cargo') {
    horizontal(left, right, bottom);
    vertical(right, top, bottom);
    tiles[bottom * w + middle] = 2;
    crates.push({ x: middle - 1, y: bottom });
  } else if (family === 'conveyor') {
    horizontal(left, middle, bottom);
    vertical(middle, top, bottom);
    horizontal(middle, right, top);
    for (let y = bottom; y >= Math.max(top + 1, bottom - 3); y--) conveyors.push([y * w + middle, 0]);
    // A visible off-route hazard remains part of the full simulation state.
    tiles[2 * w + 1] = 2;
  } else throw new RangeError('Invalid arena family');
  if (tier >= 2 && family !== 'jump' && family !== 'cargo' && family !== 'conveyor') tiles[2 * w + 1] = 2;
  if (tier >= 3 && family !== 'conveyor') {
    const y = family === 'jump' ? 1 : Math.max(1, h - 4);
    for (let x = 1; x <= 2; x++) {
      carve(x, y);
      conveyors.push([y * w + x, 1]);
    }
  }
  if (tier === 4 && family !== 'cargo') {
    carve(1, 2);
    crates.push({ x: 1, y: 2 });
  }
  if (tier >= 2 && !tiles.includes(2)) tiles[2 * w + 2] = 2;
  // Reflection preserves rectangular dimensions. Both the board and turning
  // opcodes are reflected, so a witnessed route remains meaningful.
  const mirrorX = random() < 0.5;
  const mirrorY = random() < 0.5;
  const mapPoint = point => ({ ...point, x: mirrorX ? w - 1 - point.x : point.x, y: mirrorY ? h - 1 - point.y : point.y });
  const mapDir = dir => {
    if (mirrorX && (dir === 1 || dir === 3)) dir = (dir + 2) % 4;
    if (mirrorY && (dir === 0 || dir === 2)) dir = (dir + 2) % 4;
    return dir;
  };
  const mappedTiles = Array(w * h).fill(1);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const point = mapPoint({ x, y });
    mappedTiles[point.y * w + point.x] = tiles[y * w + x];
  }
  return {
    arena: {
      w, h, tiles: mappedTiles,
      conveyors: conveyors.map(([index, dir]) => { const point = mapPoint({ x: index % w, y: Math.floor(index / w) }); return [point.y * w + point.x, mapDir(dir)]; }),
      crates: crates.map(mapPoint),
    },
    start: { ...mapPoint(start), dir: mapDir(start.dir) }, exit: mapPoint(exit),
    reflected: mirrorX !== mirrorY, family,
  };
}
