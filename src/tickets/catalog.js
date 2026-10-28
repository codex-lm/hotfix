// Seeded constructive archetypes. These witnesses only guide the search;
// generator.js independently proves minimality before serving every ticket.
const patch = (slot, op) => ({ slot, op });
export const CATALOG = Object.freeze({
  1: [
    { family: 'elbow', reflected: false, program: ['LEFT', 'FWD', 'JUMP', 'LEFT', 'WAIT', 'BACK'], witness: [patch(0, 'JUMP'), null] },
    { family: 'elbow', reflected: true, program: ['FWD', 'JUMP', 'PUSH', 'PUSH', 'PUSH', 'BACK'], witness: [null, patch(2, 'RIGHT'), null] },
    { family: 'zigzag', reflected: true, program: ['JUMP', 'FWD', 'LEFT', 'LEFT', 'BACK', 'LEFT'], witness: [null, patch(3, 'JUMP')] },
    { family: 'switchback', reflected: false, program: ['FWD', 'BACK', 'FWD', 'FWD', 'FWD', 'PUSH'], witness: [null, patch(1, 'LEFT'), null] },
    { family: 'switchback', reflected: false, program: ['JUMP', 'RIGHT', 'PUSH', 'LEFT', 'BACK', 'FWD'], witness: [patch(1, 'JUMP'), null] },
  ],
  2: [
    { family: 'elbow', reflected: true, program: ['FWD', 'RIGHT', 'FWD', 'RIGHT', 'BACK', 'LEFT'], witness: [patch(1, 'JUMP'), patch(4, 'JUMP'), null] },
    { family: 'elbow', reflected: false, program: ['FWD', 'PUSH', 'BACK', 'PUSH', 'FWD', 'RIGHT'], witness: [patch(5, 'JUMP'), null, patch(1, 'LEFT'), null] },
    { family: 'zigzag', reflected: false, program: ['BACK', 'LEFT', 'BACK', 'WAIT', 'BACK', 'JUMP'], witness: [null, patch(5, 'BACK'), null, patch(1, 'RIGHT')] },
    { family: 'zigzag', reflected: false, program: ['WAIT', 'JUMP', 'RIGHT', 'LEFT', 'FWD', 'WAIT'], witness: [null, patch(2, 'FWD'), patch(3, 'RIGHT'), null] },
    { family: 'jump', reflected: true, program: ['LEFT', 'BACK', 'JUMP', 'RIGHT', 'PUSH', 'WAIT'], witness: [patch(0, 'JUMP'), patch(1, 'LEFT'), null] },
    { family: 'jump', reflected: true, program: ['JUMP', 'RIGHT', 'FWD', 'BACK', 'LEFT', 'RIGHT'], witness: [patch(5, 'FWD'), patch(3, 'JUMP'), null] },
  ],
  3: [
    { family: 'elbow', reflected: false, program: ['RIGHT', 'BACK', 'FWD', 'LEFT', 'JUMP', 'PUSH'], witness: [patch(1, 'JUMP'), patch(0, 'JUMP'), null] },
    { family: 'elbow', reflected: false, program: ['LEFT', 'FWD', 'PUSH', 'RIGHT', 'JUMP', 'PUSH'], witness: [null, null, null, patch(5, 'FWD'), patch(3, 'FWD')] },
    { family: 'zigzag', reflected: false, program: ['FWD', 'PUSH', 'JUMP', 'PUSH', 'LEFT', 'FWD'], witness: [patch(0, 'JUMP'), patch(4, 'RIGHT'), null] },
    { family: 'zigzag', reflected: false, program: ['JUMP', 'BACK', 'PUSH', 'FWD', 'LEFT', 'PUSH'], witness: [patch(1, 'FWD'), null, patch(4, 'RIGHT'), null, null] },
    { family: 'jump', reflected: false, program: ['BACK', 'PUSH', 'FWD', 'FWD', 'LEFT', 'JUMP'], witness: [patch(0, 'FWD'), patch(4, 'RIGHT'), null] },
    { family: 'jump', reflected: false, program: ['RIGHT', 'JUMP', 'JUMP', 'WAIT', 'WAIT', 'BACK'], witness: [null, null, patch(3, 'RIGHT'), patch(0, 'FWD')] },
    { family: 'conveyor', reflected: true, program: ['PUSH', 'JUMP', 'PUSH', 'JUMP', 'WAIT', 'JUMP'], witness: [null, patch(0, 'LEFT'), null, patch(1, 'FWD'), null] },
    { family: 'conveyor', reflected: true, program: ['RIGHT', 'WAIT', 'WAIT', 'FWD', 'PUSH', 'JUMP'], witness: [patch(0, 'FWD'), patch(0, 'LEFT'), null, null, null] },
  ],
  4: [
    { family: 'elbow', reflected: true, program: ['RIGHT', 'FWD', 'RIGHT', 'BACK', 'JUMP', 'RIGHT'], witness: [null, patch(2, 'JUMP'), patch(0, 'LEFT'), patch(0, 'JUMP')] },
    { family: 'elbow', reflected: true, program: ['RIGHT', 'JUMP', 'WAIT', 'FWD', 'PUSH', 'RIGHT'], witness: [patch(0, 'JUMP'), patch(2, 'LEFT'), null, null, null, patch(2, 'FWD')] },
    { family: 'zigzag', reflected: true, program: ['WAIT', 'JUMP', 'PUSH', 'WAIT', 'BACK', 'RIGHT'], witness: [patch(5, 'JUMP'), patch(2, 'RIGHT'), patch(0, 'JUMP'), null, null, null] },
    { family: 'zigzag', reflected: false, program: ['WAIT', 'WAIT', 'JUMP', 'LEFT', 'PUSH', 'BACK'], witness: [patch(1, 'JUMP'), null, patch(0, 'RIGHT'), patch(4, 'BACK'), null] },
    { family: 'jump', reflected: true, program: ['PUSH', 'PUSH', 'PUSH', 'JUMP', 'RIGHT', 'BACK'], witness: [null, null, patch(0, 'LEFT'), patch(5, 'LEFT'), null, patch(0, 'FWD')] },
    { family: 'jump', reflected: false, program: ['WAIT', 'WAIT', 'JUMP', 'JUMP', 'WAIT', 'PUSH'], witness: [patch(0, 'JUMP'), patch(1, 'LEFT'), patch(2, 'BACK')] },
    { family: 'cargo', reflected: true, program: ['FWD', 'LEFT', 'LEFT', 'JUMP', 'LEFT', 'BACK'], witness: [patch(1, 'RIGHT'), patch(2, 'FWD'), null, patch(0, 'BACK'), null, null] },
    { family: 'cargo', reflected: false, program: ['FWD', 'WAIT', 'WAIT', 'RIGHT', 'LEFT', 'BACK'], witness: [patch(5, 'JUMP'), null, patch(3, 'JUMP'), patch(0, 'JUMP')] },
    { family: 'conveyor', reflected: true, program: ['LEFT', 'PUSH', 'JUMP', 'BACK', 'PUSH', 'LEFT'], witness: [patch(0, 'JUMP'), patch(1, 'RIGHT'), patch(0, 'BACK'), null, null, null] },
    { family: 'conveyor', reflected: true, program: ['PUSH', 'BACK', 'BACK', 'BACK', 'PUSH', 'WAIT'], witness: [patch(3, 'JUMP'), patch(2, 'JUMP'), patch(0, 'RIGHT'), null, null, null] },
  ],
});
