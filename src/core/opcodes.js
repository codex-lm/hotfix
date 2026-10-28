export const OPS = Object.freeze(['FWD', 'BACK', 'LEFT', 'RIGHT', 'WAIT', 'JUMP', 'PUSH']);
export const OP_META = Object.freeze({
  FWD: { key: 'f', icon: '↑', label: 'op.FWD', rule: 'rule.FWD' },
  BACK: { key: 'b', icon: '↓', label: 'op.BACK', rule: 'rule.BACK' },
  LEFT: { key: 'l', icon: '↶', label: 'op.LEFT', rule: 'rule.LEFT' },
  RIGHT: { key: 'r', icon: '↷', label: 'op.RIGHT', rule: 'rule.RIGHT' },
  WAIT: { key: 'w', icon: '·', label: 'op.WAIT', rule: 'rule.WAIT' },
  JUMP: { key: 'j', icon: '⇈', label: 'op.JUMP', rule: 'rule.JUMP' },
  PUSH: { key: 'p', icon: '⇥', label: 'op.PUSH', rule: 'rule.PUSH' },
});
export const KEY_TO_OP = Object.freeze(Object.fromEntries(OPS.map(op => [OP_META[op].key, op])));
export const DIRECTIONS = Object.freeze(['N', 'E', 'S', 'O']);
export const DX = Object.freeze([0, 1, 0, -1]);
export const DY = Object.freeze([-1, 0, 1, 0]);
export function isOpcode(op) { return OPS.includes(op); }
