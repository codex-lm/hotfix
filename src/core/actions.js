export const ACTIONS = Object.freeze(['NEW_TICKET', 'PATCH', 'DEPLOY', 'SHIP_AS_IS', 'NEXT_TICKET', 'ABANDON', 'START']);
export function isAction(action) { return ACTIONS.includes(typeof action === 'string' ? action : action?.type); }
