import { cloneWorld } from '../core/world.js';
import { runCycle } from '../core/sim.js';
import { choosePatch } from '../ai/bot.js';
import { rankRobots } from '../prod/setup.js';

export function createLocalGame(initialWorld, { playerId = 'r0', levels = {} } = {}) {
  let world = cloneWorld(initialWorld);
  let disposed = false;
  const listeners = new Set();
  const observed = Object.fromEntries(world.robots.map(robot => [robot.id, [...(robot.observed ?? Array(6).fill(null))]]));
  return {
    send(cmd) {
      if (disposed) throw new Error('Local game is disposed');
      if (cmd?.cycle !== undefined && cmd.cycle !== world.cycle) return null;
      if (world.status !== 'playing') return { world: cloneWorld(world), trace: [], patches: [], ranking: rankRobots(world) };
      const patch = cmd === null || cmd === undefined || cmd.type === 'SHIP_AS_IS' ? null : Object.hasOwn(cmd, 'patch') ? cmd.patch : cmd;
      const patches = world.robots.map(robot => ({
        robotId: robot.id,
        patch: robot.id === playerId ? patch : choosePatch(world, robot.id, levels[robot.id] ?? robot.bot ?? 'ops', { observed }),
      }));
      const result = runCycle(world, patches);
      for (const frame of result.trace) for (const event of frame.events) if (event.type === 'instruction') observed[event.robotId][event.slot] = event.op;
      for (const robot of result.world.robots) robot.observed = [...observed[robot.id]];
      world = cloneWorld(result.world);
      const payload = { ...result, patches, ...(world.status !== 'playing' ? { ranking: rankRobots(world) } : {}) };
      for (const callback of listeners) callback(payload);
      return payload;
    },
    onCycle(callback) {
      if (typeof callback !== 'function') throw new TypeError('Cycle callback must be a function');
      listeners.add(callback);
      return () => listeners.delete(callback);
    },
    getWorld() { return cloneWorld(world); },
    dispose() { disposed = true; listeners.clear(); },
  };
}
