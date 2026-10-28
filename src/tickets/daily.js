import { GENERATOR_VERSION, generateTicket } from './generator.js';
import { validateTicket } from './ticket.js';

export const dailyTiers = Object.freeze([1, 2, 2, 3, 4]);
export const sprintTiers = Object.freeze([1, 1, 2, 2, 3, 3, 4, 4]);
export function dailySeed(date = new Date()) { return `daily-${new Date(date).toISOString().slice(0, 10)}`; }
export function ticketSeed(seed, index) { return `${seed}:${index}`; }

export function readTicketCache(seed, tier, storage) {
  try {
    storage ??= globalThis.localStorage;
    const data = JSON.parse(storage?.getItem(`hotfix.ticket.v${GENERATOR_VERSION}:${tier}:${seed}`) ?? 'null');
    return validateTicket(data) ? data : null;
  } catch { return null; }
}

export function writeTicketCache(ticket, storage) {
  try {
    storage ??= globalThis.localStorage;
    storage?.setItem(`hotfix.ticket.v${GENERATOR_VERSION}:${ticket.tier}:${ticket.seed}`, JSON.stringify(ticket));
  } catch { /* Private browsing and a full quota must not prevent playing. */ }
  return ticket;
}

export async function cachedTicket(seed, tier, options = {}) {
  return readTicketCache(seed, tier) ?? writeTicketCache(await generateTicket(seed, tier, options));
}

export function dailyTickets(date = new Date(), options = {}) {
  const seed = dailySeed(date);
  // Sequential generation yields to rendering instead of competing searches.
  return dailyTiers.reduce(async (previous, tier, index) => {
    const result = await previous;
    result.push(await cachedTicket(ticketSeed(seed, index), tier, options));
    return result;
  }, Promise.resolve([]));
}
