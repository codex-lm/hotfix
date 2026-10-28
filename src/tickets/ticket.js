import { TIERS } from './arena-gen.js';
import { OPS } from '../core/opcodes.js';

export function starsFor(ticket, patches, success = true) {
  if (!success) return 0;
  return patches <= ticket.par ? 3 : patches === ticket.par + 1 ? 2 : 1;
}

export function validateTicket(ticket) {
  const config = TIERS[ticket?.tier];
  if (!config) return false;
  const position = value => value && Number.isInteger(value.x) && Number.isInteger(value.y) &&
    value.x >= 0 && value.x < config.w && value.y >= 0 && value.y < config.h;
  const opcode = value => typeof value === 'string' && OPS.includes(value);
  return Boolean(typeof ticket.seed === 'string' && Array.isArray(ticket.program) && ticket.program.length === 6 && ticket.program.every(opcode) &&
    ticket.arena?.w === config.w && ticket.arena?.h === config.h &&
    Array.isArray(ticket.arena.tiles) && ticket.arena.tiles.length === config.w * config.h && ticket.arena.tiles.every(tile => Number.isInteger(tile) && tile >= 0 && tile <= 2) &&
    Array.isArray(ticket.arena.conveyors) && ticket.arena.conveyors.every(value => Array.isArray(value) && value.length === 2 && Number.isInteger(value[0]) && value[0] >= 0 && value[0] < config.w * config.h && Number.isInteger(value[1]) && value[1] >= 0 && value[1] <= 3) &&
    Array.isArray(ticket.arena.crates) && ticket.arena.crates.every(position) &&
    position(ticket.start) && Number.isInteger(ticket.start.dir) && ticket.start.dir >= 0 && ticket.start.dir <= 3 && position(ticket.exit) &&
    Array.isArray(ticket.beacons) && ticket.beacons.every(position) && ticket.cycles === config.cycles &&
    Number.isInteger(ticket.par) && config.pars.includes(ticket.par) &&
    Array.isArray(ticket.solution) && ticket.solution.filter(Boolean).length === ticket.par &&
    ticket.solution.every(value => value === null || (value && Number.isInteger(value.slot) && value.slot >= 0 && value.slot < 6 && opcode(value.op))) &&
    ticket.solution.length <= ticket.cycles);
}
