import { cloneWorld } from './world.js';
import { runCycle } from './sim.js';

export function preview(input, robotId, patch = null, cycles = 1) {
  let world = cloneWorld(input);
  if (world.mode === 'prod') {
    for (const robot of world.robots) if (robot.id !== robotId) {
      robot.program = Array.from({ length: 6 }, (_, index) => robot.observed?.[index] ?? 'WAIT');
    }
  }
  const trace = [];
  for (let index = 0; index < cycles && world.status === 'playing'; index++) {
    const result = runCycle(world, index === 0 && patch ? [{ robotId, ...patch }] : []);
    world = result.world;
    trace.push(...result.trace);
  }
  return { world, trace };
}

export function summarizeTrace(trace, robotId) {
  const events = trace.flatMap(tick => tick.events);
  return {
    moves: events.filter(event => event.type === 'moved' && event.robotId === robotId).length,
    pushes: events.filter(event => event.type === 'pushed' && event.by === robotId).length,
    falls: events.filter(event => event.type === 'fell' && event.robotId === robotId).length,
    claims: events.filter(event => event.type === 'claimed' && event.robotId === robotId).length,
  };
}
