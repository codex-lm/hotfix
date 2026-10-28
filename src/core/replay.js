import { createWorld, worldFromTicket, cloneWorld } from './world.js';
import { runCycle } from './sim.js';

export function replay(seed, mode = 'tickets', config = {}, entries = []) {
  let world = config.initialWorld ? cloneWorld(config.initialWorld) : config.ticket ? worldFromTicket(config.ticket) : createWorld({ ...config, seed, mode });
  const grouped = new Map();
  // Accept deployment arrays as well as the explicit (cycle, robotId, patch)
  // log used by networking and persistent saves.
  entries.forEach((entry, index) => {
    if (Array.isArray(entry)) { grouped.set(index, entry); return; }
    const cycle = entry?.cycle ?? index;
    const patches = grouped.get(cycle) ?? [];
    if (entry?.patches) patches.push(...entry.patches);
    else if (entry) patches.push({ robotId: entry.robotId ?? world.robots[0]?.id, patch: Object.hasOwn(entry, 'patch') ? entry.patch : { slot: entry.slot, op: entry.op } });
    grouped.set(cycle, patches);
  });
  const finalCycle = grouped.size ? Math.max(...grouped.keys()) : -1;
  while (world.status === 'playing' && world.cycle <= finalCycle) world = runCycle(world, grouped.get(world.cycle) ?? []).world;
  return world;
}
