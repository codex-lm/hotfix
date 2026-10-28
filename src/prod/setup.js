import { createRng, derive } from '../core/rng.js';
import { createWorld, FLOOR, WALL, HOLE } from '../core/world.js';
import { OPS, DX, DY } from '../core/opcodes.js';

export const ROBOT_COLORS = Object.freeze(['#F2652B', '#3B8EA5', '#8E5CC9', '#3C9D5D', '#E0B23C', '#D64A8A', '#5B6B7F', '#2BB3A3']);
export const BOT_LEVELS = Object.freeze(['intern', 'ops', 'senior']);

export function setupRoster(config = {}) {
  const source = config.roster ?? [];
  const count = Math.max(4, Math.min(8, Math.trunc(config.count ?? Math.max(4, source.length))));
  const bots = Math.max(0, Math.min(count - 1, Math.trunc(config.bots ?? count - 1)));
  const humanCount = count - bots;
  const level = BOT_LEVELS.includes(config.level) ? config.level : 'ops';
  const roster = Array.from({ length: count }, (_, index) => {
    const given = source[index];
    return {
      id: given?.id ?? `r${index}`,
      participantId: given?.participantId ?? null,
      name: String(given?.name ?? (given?.id ?? `r${index}`).toUpperCase()).slice(0, 40),
      color: given?.color ?? ROBOT_COLORS[index],
      bot: given && Object.hasOwn(given, 'bot') ? given.bot : index < humanCount ? null : level,
    };
  });
  if (new Set(roster.map(robot => robot.id)).size !== count) throw new RangeError('Duplicate robot ids');
  if (roster.some(robot => robot.bot !== null && !BOT_LEVELS.includes(robot.bot))) throw new RangeError('Invalid bot level');
  return roster;
}

export function setupProd(seed, config = {}) {
  const rng = createRng(derive(seed, 'prod-arena'));
  const w = 12; const h = 9;
  const tiles = Uint8Array.from({ length: w * h }, (_, index) => {
    const x = index % w; const y = Math.floor(index / w);
    return x === 0 || y === 0 || x === w - 1 || y === h - 1 ? WALL : FLOOR;
  });
  const roster = setupRoster(config);
  // Every pair in this fixed perimeter set is at Manhattan distance >= 3.
  // Shuffling only assigns seats; there is no geometry retry or timing input.
  const homes = rng.shuffle([{ x: 1, y: 1 }, { x: 5, y: 1 }, { x: 10, y: 1 }, { x: 10, y: 4 }, { x: 10, y: 7 }, { x: 6, y: 7 }, { x: 1, y: 7 }, { x: 1, y: 4 }]).slice(0, roster.length);
  const reserved = (x, y) => homes.some(home => Math.abs(home.x - x) + Math.abs(home.y - y) <= 1);
  const interior = [];
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) if (!reserved(x, y)) interior.push({ x, y });
  const shuffled = rng.shuffle(interior);
  for (const cell of shuffled.slice(0, 6)) tiles[cell.y * w + cell.x] = WALL;
  for (const cell of shuffled.slice(6, 10)) tiles[cell.y * w + cell.x] = HOLE;
  const conveyors = new Map();
  const lineCount = rng.int(1, 3);
  for (let line = 0; line < lineCount; line++) {
    for (let attempt = 0; attempt < 40; attempt++) {
      const start = rng.pick(interior); const dir = rng.int(4); const length = rng.int(2, 5);
      const cells = Array.from({ length }, (_, index) => ({ x: start.x + DX[dir] * index, y: start.y + DY[dir] * index }));
      if (cells.some(cell => cell.x < 1 || cell.y < 1 || cell.x >= w - 1 || cell.y >= h - 1 || reserved(cell.x, cell.y) || tiles[cell.y * w + cell.x] !== FLOOR || conveyors.has(cell.y * w + cell.x))) continue;
      for (const cell of cells) conveyors.set(cell.y * w + cell.x, dir);
      break;
    }
  }
  const crateCells = rng.shuffle(interior.filter(cell => tiles[cell.y * w + cell.x] === FLOOR && !conveyors.has(cell.y * w + cell.x))).slice(0, 2);
  const crates = crateCells.map((cell, index) => ({ ...cell, id: `c${index}` }));
  const robots = roster.map((robot, index) => {
    const home = homes[index];
    const dx = (w - 1) / 2 - home.x; const dy = (h - 1) / 2 - home.y;
    const dir = Math.abs(dx) >= Math.abs(dy) ? dx >= 0 ? 1 : 3 : dy >= 0 ? 2 : 0;
    const programRng = createRng(derive(seed, 'prod-program', index));
    const program = Array.from({ length: 6 }, () => programRng.pick(OPS));
    // Ensure movement without re-rolling streams or leaking seat programs.
    if (program.filter(op => ['FWD', 'BACK', 'JUMP'].includes(op)).length < 2) { program[0] = 'FWD'; program[3] = 'FWD'; }
    return { ...robot, ...home, dir, home: { ...home, dir }, program, observed: Array(6).fill(null) };
  });
  const beaconCells = [];
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    if (tiles[y * w + x] !== FLOOR || conveyors.has(y * w + x) || crates.some(crate => crate.x === x && crate.y === y)) continue;
    if (robots.some(robot => Math.abs(robot.x - x) + Math.abs(robot.y - y) < 3)) continue;
    beaconCells.push({ x, y });
  }
  if (beaconCells.length < 3) throw new RangeError('Arena has too few beacon cells');
  const beacons = createRng(derive(seed, 'beacon', 0)).shuffle(beaconCells).slice(0, 3).map((cell, index) => ({ ...cell, id: `b${index}` }));
  return createWorld({ w, h, tiles, conveyors, crates, beacons, robots, seed, mode: 'prod', maxCycles: Math.max(1, Math.min(12, Math.trunc(config.cycles ?? config.maxCycles ?? 12))), targetClaims: Math.max(1, Math.min(3, Math.trunc(config.targetClaims ?? config.beacons ?? 3))), window: [30, 45, 60, 90].includes(config.window) ? config.window : 45 });
}

export function rankRobots(world) {
  return world.robots.map((robot, index) => ({
    id: robot.id, robotId: robot.id, name: robot.name ?? robot.id, color: robot.color,
    claims: robot.claims, falls: robot.falls, lastClaim: robot.claims ? robot.lastClaim ?? Infinity : Infinity,
    index,
  })).sort((a, b) => b.claims - a.claims || a.falls - b.falls || a.lastClaim - b.lastClaim || a.index - b.index)
    .map(({ index, ...robot }, position) => ({ ...robot, lastClaim: Number.isFinite(robot.lastClaim) ? robot.lastClaim : null, rank: position + 1, winner: position === 0 }));
}
