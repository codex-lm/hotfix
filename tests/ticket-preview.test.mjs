import assert from 'node:assert/strict';
import { generateTicketSync } from '../src/tickets/generator.js';
import { createRng } from '../src/core/rng.js';
import { OPS } from '../src/core/opcodes.js';
import { worldFromTicket, serializeWorld } from '../src/core/world.js';
import { preview } from '../src/core/trace.js';
import { runCycle } from '../src/core/sim.js';

export default async function run() {
  const rng = createRng('generated-ticket-preview-matrix');
  const started = performance.now();
  let comparisons = 0;
  for (let ticketIndex = 0; ticketIndex < 200; ticketIndex++) {
    const ticket = generateTicketSync(`ticket-preview-${ticketIndex}`, ticketIndex % 4 + 1);
    const initial = worldFromTicket(ticket);
    let world = initial;
    // Exercise intermediate crate/hole/beacon states as well as initial boards.
    const prefix = ticketIndex % ticket.cycles;
    for (let cycle = 0; cycle < prefix && world.status === 'playing'; cycle++) {
      const patch = ticket.solution[cycle];
      world = runCycle(world, patch ? [{ robotId: 'r0', ...patch }] : [], { trace: false }).world;
    }
    if (world.status !== 'playing') world = initial;
    const before = serializeWorld(world);
    for (let patchIndex = 0; patchIndex < 200; patchIndex++) {
      const slot = rng.int(6);
      const op = rng.pick(OPS.filter(candidate => candidate !== world.robots[0].program[slot]));
      const patch = { slot, op };
      const predicted = preview(world, 'r0', patch);
      const played = runCycle(world, [{ robotId: 'r0', ...patch }]);
      assert.equal(serializeWorld(predicted.world), serializeWorld(played.world), `ticket ${ticketIndex} patch ${patchIndex}: final world`);
      assert.deepEqual(predicted.trace, played.trace, `ticket ${ticketIndex} patch ${patchIndex}: every tick and event`);
      comparisons++;
    }
    assert.equal(serializeWorld(world), before, `ticket ${ticketIndex}: forecast never mutates live world`);
  }
  return { generatedTickets: 200, randomPatchesPerTicket: 200, comparisons, milliseconds: Math.round(performance.now() - started) };
}
