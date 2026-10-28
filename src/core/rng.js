// All gameplay randomness comes from these seed-derived, independent streams.
export function hashSeed(value) {
  const text = String(value);
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function derive(seed, ...labels) {
  // Length prefixes keep derive('ab', 'c') distinct from derive('a', 'bc').
  return hashSeed([seed, ...labels].map(value => `${String(value).length}:${value}`).join('|')).toString(16).padStart(8, '0');
}

export function createRng(seed) {
  let state = hashSeed(seed);
  const random = () => {
    state = (state + 0x6D2B79F5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
  random.int = (min, max) => {
    if (max === undefined) { max = min; min = 0; }
    if (!Number.isInteger(min) || !Number.isInteger(max) || max <= min) throw new RangeError('Invalid random integer range');
    return min + Math.floor(random() * (max - min));
  };
  random.pick = values => values[random.int(values.length)];
  random.shuffle = values => {
    const copy = [...values];
    for (let i = copy.length - 1; i > 0; i--) {
      const j = random.int(i + 1);
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  };
  return random;
}
