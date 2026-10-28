import { OPS } from './opcodes.js';

export const FLOOR = 0;
export const WALL = 1;
export const HOLE = 2;
export const TILE = Object.freeze({ FLOOR, WALL, HOLE });

function direction(value = 0) {
  if (typeof value === 'string') value = { N: 0, E: 1, S: 2, O: 3, W: 3 }[value.toUpperCase()];
  if (!Number.isInteger(value) || value < 0 || value > 3) throw new RangeError('Invalid direction');
  return value;
}

export function createWorld(config = {}) {
  const w = config.w ?? 8;
  const h = config.h ?? 6;
  if (!Number.isInteger(w) || !Number.isInteger(h) || w < 1 || h < 1) throw new RangeError('Invalid arena size');
  const tiles = config.tiles ? Uint8Array.from(config.tiles) : new Uint8Array(w * h);
  if (tiles.length !== w * h || tiles.some(value => value > HOLE)) throw new RangeError('Invalid tiles');
  const sourceConveyors = config.conveyors instanceof Map ? config.conveyors : new Map(config.conveyors ?? []);
  const conveyors = new Map([...sourceConveyors].map(([index, dir]) => [Number(index), direction(dir)]));
  const robots = (config.robots ?? []).map((robot, index) => {
    const dir = direction(robot.dir);
    const program = [...(robot.program ?? Array(6).fill('WAIT'))];
    if (program.length !== 6 || program.some(op => !OPS.includes(op))) throw new RangeError('Invalid program');
    return {
      ...robot, id: robot.id ?? `r${index}`, x: robot.x ?? 1, y: robot.y ?? 1, dir, program,
      home: { x: robot.home?.x ?? robot.x ?? 1, y: robot.home?.y ?? robot.y ?? 1, dir: direction(robot.home?.dir ?? dir) },
      falls: robot.falls ?? 0, claims: robot.claims ?? 0, version: robot.version ?? 0,
      ...(robot.observed ? { observed: [...robot.observed] } : {}),
    };
  });
  return {
    ...config, w, h, tiles, conveyors, robots,
    crates: (config.crates ?? []).map((crate, index) => ({ ...crate, id: crate.id ?? `c${index}` })),
    beacons: (config.beacons ?? []).map((beacon, index) => ({ ...beacon, id: beacon.id ?? `b${index}` })),
    exit: config.exit ? { ...config.exit } : null,
    cycle: config.cycle ?? 0, tick: config.tick ?? 0,
    mode: config.mode ?? 'tickets', status: config.status ?? 'playing', seed: String(config.seed ?? 'hotfix'),
    requiredClaims: config.requiredClaims ?? 0,
    maxCycles: config.maxCycles ?? config.cycles ?? (config.mode === 'prod' ? 12 : 6),
    claimSerial: config.claimSerial ?? 0, beaconSerial: config.beaconSerial ?? 0,
  };
}

export function cloneWorld(world) {
  return {
    ...world, tiles: world.tiles.slice(), conveyors: new Map(world.conveyors),
    robots: world.robots.map(robot => ({ ...robot, program: [...robot.program], home: { ...robot.home }, ...(robot.observed ? { observed: [...robot.observed] } : {}) })),
    crates: world.crates.map(crate => ({ ...crate })), beacons: world.beacons.map(beacon => ({ ...beacon })),
    exit: world.exit ? { ...world.exit } : null,
  };
}

export function worldFromTicket(ticket) {
  return createWorld({
    ...ticket.arena, seed: ticket.seed, mode: 'tickets',
    exit: ticket.exit, beacons: ticket.beacons ?? ticket.arena.beacons ?? [],
    maxCycles: ticket.cycles, requiredClaims: ticket.requiredClaims ?? 0,
    robots: [{ ...ticket.start, id: ticket.start.id ?? 'r0', program: [...ticket.program], home: { ...ticket.start } }],
  });
}

function canonical(value) {
  if (value instanceof Uint8Array) return Array.from(value);
  if (value instanceof Map) return [...value].sort(([a], [b]) => Number(a) - Number(b)).map(([key, item]) => [key, canonical(item)]);
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().filter(key => value[key] !== undefined).map(key => [key, canonical(value[key])]));
  return value;
}

export function serializeWorld(world) { return JSON.stringify(canonical(world)); }
export function deserializeWorld(serialized) { return createWorld(JSON.parse(serialized)); }
export function indexOf(world, x, y) { return y * world.w + x; }
export function tileAt(world, x, y) {
  return x < 0 || y < 0 || x >= world.w || y >= world.h ? WALL : world.tiles[indexOf(world, x, y)];
}
