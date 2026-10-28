import assert from 'node:assert/strict';
import { checkpoint, readSave, writeSave, validateSave, recordBest, SAVE_KEY } from '../src/ui/storage.js';

const initial = () => validateSave({ schemaVersion: 1 });
const roundTrip = save => validateSave(JSON.parse(JSON.stringify(save)));
const result = (index, stars = 2, tier = 1, seed = 'series') => ({ stars, patches: 1, cycles: 2, falls: index % 2, tier, seed: `${seed}:${index}`, elapsed: 1234 });
function snapshot(kind, { index = 0, phase = 'play', practice = false, results, seed = kind === 'daily' ? 'daily-2026-10-28' : `${kind}-test`, tier = 1 } = {}) {
  const tiers = kind === 'daily' ? [1, 2, 2, 3, 4] : kind === 'sprint' ? [1, 1, 2, 2, 3, 3, 4, 4] : [tier];
  const count = index + (phase === 'result' ? 1 : 0);
  results ??= Array.from({ length: count }, (_, number) => result(number, 2, tiers[number], seed));
  return { seed: `${seed}:${index}`, tier: tiers[index], history: phase === 'result' ? [null, { slot: 0, op: 'FWD' }] : [null], elapsed: 4321, phase,
    result: phase === 'result' ? results[index] : null,
    run: { kind, seed, index, tiers, results, practice },
  };
}

export default async function run() {
  const oldStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const memory = new Map();
  const storage = { getItem: key => memory.get(key) ?? null, setItem: (key, value) => memory.set(key, value) };
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: storage });
  try {
    assert.deepEqual(readSave(), initial());
    let save = initial();
    checkpoint(save, snapshot('sprint'));
    save = roundTrip(save);
    assert.equal(save.session.phase, 'play'); assert.equal(save.sprint.phase, 'play');
    assert.equal(save.sprint.run.index, 0); assert.deepEqual(save.sprint.history, [null]);
    checkpoint(save, snapshot('sprint', { phase: 'result' }));
    assert.ok(writeSave(save));
    save = readSave();
    assert.equal(save.session.phase, 'result'); assert.equal(save.sprint.phase, 'result');
    assert.equal(save.sprint.run.results.length, 1);
    assert.equal(save.sprint.result.elapsed, 1234, 'result checkpoint retains elapsed time');
    const duringTriage = snapshot('sprint', { phase: 'result' });
    checkpoint(save, duringTriage);
    duringTriage.run.index++;
    duringTriage.history.push({ slot: 2, op: 'JUMP' });
    save = roundTrip(save);
    assert.equal(save.sprint.run.index, 0, 'starting next triage cannot mutate previous durable checkpoint');
    assert.equal(save.sprint.phase, 'result');
    assert.equal(save.sprint.history.length, 2, 'checkpoint owns its deployment history');
    const sprintCheckpoint = JSON.stringify(save.sprint);
    checkpoint(save, snapshot('backlog', { tier: 3 }));
    save = roundTrip(save);
    assert.equal(save.session.run.kind, 'backlog');
    assert.equal(JSON.stringify(save.sprint), sprintCheckpoint, 'opening Backlog preserves independent Sprint result checkpoint');
    checkpoint(save, snapshot('sprint', { index: 1 }));
    save = roundTrip(save);
    assert.equal(save.sprint.run.index, 1); assert.equal(save.sprint.run.results.length, 1);
    checkpoint(save, snapshot('sprint', { index: 7, phase: 'result' }));
    assert.equal(save.sprint, null); assert.equal(save.session, null, 'completed Sprint clears active checkpoints');

    save = initial();
    checkpoint(save, snapshot('daily'));
    save = roundTrip(save);
    assert.equal(save.daily.complete, false); assert.equal(save.daily.session.phase, 'play');
    checkpoint(save, snapshot('daily', { phase: 'result' }));
    save = roundTrip(save);
    assert.equal(save.daily.results.length, 1); assert.equal(save.daily.session.phase, 'result');
    const dailyCheckpoint = JSON.stringify(save.daily);
    checkpoint(save, snapshot('backlog', { tier: 2 }));
    save = roundTrip(save);
    assert.equal(JSON.stringify(save.daily), dailyCheckpoint, 'first Daily result remains resumable after an unrelated Backlog');
    assert.equal(save.daily.session.run.index, 0);
    checkpoint(save, snapshot('daily', { index: 1 }));
    save = roundTrip(save);
    assert.equal(save.daily.session.run.index, 1); assert.equal(save.daily.results.length, 1);
    checkpoint(save, snapshot('daily', { index: 4, phase: 'result' }));
    save = roundTrip(save);
    assert.equal(save.daily.complete, true); assert.equal(save.daily.results.length, 5); assert.equal(save.daily.session, null);
    const officialScore = JSON.stringify(save.daily);
    checkpoint(save, snapshot('daily', { practice: true }));
    checkpoint(save, snapshot('daily', { index: 4, phase: 'result', practice: true, results: Array.from({ length: 5 }, (_, index) => result(index, 3, [1, 2, 2, 3, 4][index], 'practice')) }));
    save = roundTrip(save);
    assert.equal(JSON.stringify(save.daily), officialScore, 'a better practice run cannot replace the first Daily score');

    save = initial();
    recordBest(save, 'seed', 1, 1); recordBest(save, 'seed', 1, 1);
    assert.deepEqual(save.progress.stars, [1, 0, 0, 0]); assert.equal(save.progress.tickets, 1);
    recordBest(save, 'seed', 1, 3); recordBest(save, 'seed', 1, 0);
    recordBest(save, 'seed', 2, 2); recordBest(save, 'other', 4, 0);
    assert.deepEqual(save.progress.stars, [3, 2, 0, 0]); assert.equal(save.progress.tickets, 2);
    save.progress.stars = [999, 999, 999, 999]; save.progress.tickets = 999;
    save = roundTrip(save);
    assert.deepEqual(save.progress.stars, [3, 2, 0, 0]); assert.equal(save.progress.tickets, 2, 'import recomputes totals from individual bests');
    save.prod.games.senior=3;save.prod.wins.senior=1;
    save=roundTrip(save);
    assert.equal(save.prod.games.senior,3);assert.equal(save.prod.wins.senior,1,'bot-level results survive save/import');
    assert.equal(validateSave({schemaVersion:1}).prod.wins.ops,0,'older Tickets saves remain compatible');
    assert.equal(validateSave({schemaVersion:1,prod:{games:{ops:2},wins:{ops:99}}}).prod.wins.ops,2,'wins cannot exceed completed games');

    assert.throws(() => validateSave(null), /Invalid/);
    assert.throws(() => validateSave({ schemaVersion: 2 }), /Invalid/);
    const malformed = snapshot('sprint'); malformed.history = [{ slot: 99, op: 'FWD' }];
    assert.equal(validateSave({ schemaVersion: 1, session: malformed }).session, null);
    const inconsistent = snapshot('daily', { phase: 'result' }); inconsistent.run.results = [];
    assert.equal(validateSave({ schemaVersion: 1, session: inconsistent }).session, null, 'checkpoint with missing prior result is rejected');
    const sanitized = validateSave({ schemaVersion: 1, settings: { lang: 'xx', speed: 99, music: 5, sfx: -1 } });
    assert.deepEqual(sanitized.settings, { lang: null, speed: 1, reduceMotion: false, music: 1, sfx: 0 });
    memory.set(SAVE_KEY, '{broken'); assert.deepEqual(readSave(), initial(), 'malformed stored JSON falls back safely');
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem() { throw new Error('Private mode'); }, setItem() { throw new Error('Quota exceeded'); } } });
    assert.deepEqual(readSave(), initial(), 'private storage never prevents startup');
    assert.equal(writeSave(save), false, 'quota failure is reported without throwing');
    return { checkpointModes: 3, dailyFirstScoreLocked: true, independentSeriesResume: true, storageFailures: 2 };
  } finally {
    if (oldStorage) Object.defineProperty(globalThis, 'localStorage', oldStorage);
    else delete globalThis.localStorage;
  }
}
