import { OPS } from '../core/opcodes.js';
import { cloneWorld, serializeWorld } from '../core/world.js';
import { runCycle } from '../core/sim.js';
import { setupProd, rankRobots } from '../prod/setup.js';
import { choosePatch } from '../ai/bot.js';

export const ROOM_MAX_BYTES = 8192;
const LEVELS = ['intern', 'ops', 'senior'];
const WINDOWS = [30, 45, 60, 90];
const FATAL = new Set(['ROOM_EXPIRED', 'ROOM_NOT_FOUND', 'RELEASE_NOT_FOUND', 'ACCOUNT_SUSPENDED',
  'GAME_NOT_ALLOWED', 'SCOPE_REQUIRED', 'ROOM_CHANGED', 'ROOM_CONNECTION_CLOSED', 'HOST_DISCONNECTED',
  'ROOM_SENDER_UNVERIFIED']);
const clone = value => JSON.parse(JSON.stringify(value));
const roomError = (code, message = code) => Object.assign(new Error(message), { code });
const validId = value => typeof value === 'string' && value.length > 0 && value.length <= 128;
const validPatch = patch => patch === null || (patch && Number.isInteger(patch.slot)
  && patch.slot >= 0 && patch.slot < 6 && OPS.includes(patch.op));

export function roomMessageBytes(data) {
  const seen = new Set();
  function finiteJson(value, depth = 0) {
    if (depth > 64) return false;
    if (value === null || typeof value === 'string' || typeof value === 'boolean') return true;
    if (typeof value === 'number') return Number.isFinite(value);
    if (!value || typeof value !== 'object' || seen.has(value)) return false;
    if (!Array.isArray(value) && ![Object.prototype, null].includes(Object.getPrototypeOf(value))) return false;
    seen.add(value);
    return Object.values(value).every(item => finiteJson(item, depth + 1));
  }
  if (!finiteJson(data)) throw roomError('ROOM_PAYLOAD_INVALID', 'Room messages must contain finite JSON data.');
  const size = new TextEncoder().encode(JSON.stringify(data)).byteLength;
  if (size > ROOM_MAX_BYTES) throw roomError('ROOM_PAYLOAD_TOO_LARGE', 'Room message exceeds 8192 UTF-8 bytes.');
  return size;
}

export function hashWorld(world) {
  // Labels, seat ownership and observed instructions are presentation/control
  // data. A late join or a newly observed slot must not change a physics hash
  // or make an old cycle impossible to verify against its original setup.
  const { window, ...simulation } = world;
  simulation.robots = world.robots.map(robot => {
    const { name, color, bot, participantId, auto, observed, ...physical } = robot;
    return physical;
  });
  let hash = 2166136261;
  for (const byte of new TextEncoder().encode(serializeWorld(simulation))) hash = Math.imul(hash ^ byte, 16777619);
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function cleanConfig(value = {}) {
  const result = {
    window: value.window ?? 45, cycles: value.cycles ?? 12, beacons: value.beacons ?? 3,
    count: value.count ?? 4, level: value.level ?? 'ops', variants: value.variants ?? [],
  };
  if (!WINDOWS.includes(result.window) || !Number.isInteger(result.cycles) || result.cycles < 1 || result.cycles > 12
    || !Number.isInteger(result.beacons) || result.beacons < 1 || result.beacons > 3
    || !Number.isInteger(result.count) || result.count < 4 || result.count > 8 || !LEVELS.includes(result.level)
    || !Array.isArray(result.variants) || result.variants.length) throw roomError('ROOM_CONFIG_INVALID');
  return result;
}

function cleanRoster(value) {
  if (!Array.isArray(value) || value.length < 4 || value.length > 8) throw roomError('ROOM_ROSTER_INVALID');
  const ids = new Set(), participants = new Set();
  return value.map((robot, index) => {
    if (robot?.id !== `r${index}` || ids.has(robot.id) || typeof robot.name !== 'string' || robot.name.length > 40
      || !/^#[0-9a-f]{6}$/i.test(robot.color) || (robot.bot !== null && !LEVELS.includes(robot.bot))
      || (robot.participantId !== null && (!validId(robot.participantId) || participants.has(robot.participantId)))) {
      throw roomError('ROOM_ROSTER_INVALID');
    }
    ids.add(robot.id);
    if (robot.participantId !== null) participants.add(robot.participantId);
    return { id: robot.id, participantId: robot.participantId, name: robot.name, color: robot.color,
      bot: robot.bot, auto: Boolean(robot.auto) };
  });
}

function assertIdentityAdapter(adapter, room) {
  // The bundled SDK forwards room metadata and service message envelopes
  // unchanged; its source does NOT define their identity field names. Supply
  // an adapter only after observing the authenticated service schema in LOB7.
  // No heuristic or data.from fallback is safe. Mock tests explicitly attest
  // their own envelope schema; they do not verify the real LOB7 schema.
  if (!adapter || adapter.verified !== true || typeof adapter.source !== 'string' || !adapter.source
    || typeof adapter.getSelfId !== 'function' || typeof adapter.getHostId !== 'function'
    || typeof adapter.getSenderId !== 'function') throw roomError('ROOM_IDENTITY_UNVERIFIED',
    'The authenticated LOB7 identity fields must be verified before online play.');
  const selfId = adapter.getSelfId(room), hostId = adapter.getHostId(room);
  if (!validId(selfId) || !validId(hostId)) throw roomError('ROOM_IDENTITY_INVALID');
  return { selfId, hostId };
}

export async function createRoomGame(options = {}) {
  const sdk = options.sdk ?? globalThis.LOB7Rooms;
  if (!options.lobby && typeof sdk?.connect !== 'function') throw roomError('ROOM_BRIDGE_UNAVAILABLE');
  const lobby = options.lobby ?? await sdk.connect();
  const { selfId, hostId } = assertIdentityAdapter(options.identityAdapter, lobby.room);
  const isHost = selfId === hostId;
  const now = options.now ?? (() => Date.now());
  const later = options.setTimeout ?? globalThis.setTimeout.bind(globalThis);
  const cancel = options.clearTimeout ?? globalThis.clearTimeout.bind(globalThis);
  let config = cleanConfig(options.config);
  let seed = String(options.seed ?? 'hotfix-room');
  if (!seed || seed.length > 256) throw roomError('ROOM_SEED_INVALID');
  let roster = [], initialRoster = [], proposedRoster = null;
  let world = null, history = [], observed = {};
  let phase = 'lobby', deadline = null, cursor = 0, disposed = false, bootstrapping = true;
  let resolving = false, started = false, windowTimer = null, nextTimer = null, helloTimer = null;
  let unsubscribe = null, replayCounter = 0, pendingReplay = null, replayParts = new Map(), needsReplay = null;
  const seen = new Set(), commands = new Map(), silence = new Map();
  const cycles = new Set(), statuses = new Set(), rosters = new Set(), chats = new Set();
  const name = String(options.name ?? 'Player').slice(0, 40);
  const color = /^#[0-9a-f]{6}$/i.test(options.color ?? '') ? options.color : '#F2652B';

  function schedule(fn, delay) {
    const timer = later(() => { if (!disposed) Promise.resolve(fn()).catch(reportError); }, Math.max(0, delay));
    timer?.unref?.();
    return timer;
  }
  function status(code, extra = {}) {
    const value = { code, phase, deadline, selfId, hostId, isHost, ...extra };
    for (const listener of statuses) listener(value);
  }
  function reportError(error) {
    if (FATAL.has(error?.code) || error?.code?.startsWith('AUTH_')) {
      phase = 'closed';
      for (const timer of [windowTimer, nextTimer, helloTimer]) if (timer !== null) cancel(timer);
      status('ROOM_CLOSED', { reason: error.code, canContinueSolo: Boolean(world) });
    } else status(error?.code ?? 'ROOM_REQUEST_FAILED', { error });
  }
  async function publish(data, key) {
    if (disposed || phase === 'closed') throw roomError('ROOM_CLOSED');
    roomMessageBytes(data);
    let attempt = 0;
    while (true) {
      try {
        // Only envelopes delivered by subscribe/read change game state. A send
        // acknowledgement may precede unseen lower-sequence service messages.
        return await lobby.send(data, { idempotencyKey: `${selfId}:${key}` });
      } catch (error) {
        if (error.code === 'ROOM_TIMEOUT' && attempt++ === 0) continue;
        reportError(error);
        throw error;
      }
    }
  }
  function notifyRoster() { for (const listener of rosters) listener(clone(roster)); }
  function observe(trace) {
    for (const frame of trace) for (const event of frame.events) if (event.type === 'instruction') {
      observed[event.robotId] ??= Array(6).fill(null);
      observed[event.robotId][event.slot] = event.op;
    }
  }
  function presentationWorld(input, knowledge = observed) {
    const output = cloneWorld(input);
    for (const robot of output.robots) {
      const seat = roster.find(item => item.id === robot.id);
      if (seat) Object.assign(robot, { name: seat.name, color: seat.color, bot: seat.bot,
        participantId: seat.participantId, auto: seat.auto });
      robot.observed = [...(knowledge[robot.id] ?? robot.observed ?? Array(6).fill(null))];
    }
    return output;
  }
  function presentationCycle(result, previousKnowledge, patches) {
    const knowledge = clone(previousKnowledge);
    const trace = result.trace.map(frame => {
      const before = presentationWorld(frame.before, knowledge);
      for (const event of frame.events) if (event.type === 'instruction') {
        knowledge[event.robotId] ??= Array(6).fill(null);
        knowledge[event.robotId][event.slot] = event.op;
      }
      return { ...frame, before, world: presentationWorld(frame.world, knowledge), events: clone(frame.events) };
    });
    const visibleWorld = presentationWorld(result.world);
    return { world: visibleWorld, trace, patches: clone(patches),
      ...(visibleWorld.status === 'playing' ? {} : { ranking: rankRobots(visibleWorld) }) };
  }
  function makeRoster() {
    const colors = ['#F2652B', '#3B8EA5', '#8E5CC9', '#3C9D5D', '#E0B23C', '#D64A8A', '#5B6B7F', '#2BB3A3'];
    return Array.from({ length: config.count }, (_, index) => ({
      id: `r${index}`, participantId: index === 0 ? selfId : null,
      name: index === 0 ? name : `Bot ${index}`, color: colors[index], bot: index === 0 ? null : config.level, auto: false,
    }));
  }
  async function publishRoster(value, key) {
    // Reserve seats while the authoritative act is in flight. Several hello
    // commands can arrive in one bridge poll before our roster acts return.
    proposedRoster = clone(value);
    await publish({ v: 1, t: 'roster', robots: value }, `roster:${key}`);
  }
  async function hello() {
    if (phase !== 'lobby') return;
    await publish({ v: 1, t: 'hello', name, lang: options.lang === 'fr' ? 'fr' : 'en', color }, `hello:${Math.floor(now() / 30000)}`);
    helloTimer = schedule(hello, 30000);
  }
  async function openWindow() {
    if (!isHost || disposed || !world || world.status !== 'playing' || phase === 'closed') return;
    await publish({ v: 1, t: 'tick', cycle: world.cycle, deadline: now() + config.window * 1000 }, `tick:${world.cycle}`);
  }
  function armWindow() {
    if (!isHost || bootstrapping || phase !== 'window' || deadline === null) return;
    if (windowTimer !== null) cancel(windowTimer);
    windowTimer = schedule(resolveCycle, deadline - now());
  }
  async function resolveCycle() {
    if (!isHost || resolving || phase !== 'window' || !world || world.status !== 'playing') return;
    resolving = true;
    if (windowTimer !== null) cancel(windowTimer);
    windowTimer = null;
    const n = world.cycle;
    const updatedRoster = clone(roster);
    const patches = world.robots.map(robot => {
      const seat = updatedRoster.find(item => item.id === robot.id);
      const command = commands.get(robot.id);
      if (command) {
        seat.auto = false;
        return { robotId: robot.id, patch: command.patch };
      }
      if (seat.participantId !== null) {
        const missed = (silence.get(robot.id) || 0) + 1;
        if (missed >= 3) seat.auto = true;
        // Humans ship their unchanged program for the first two missed
        // windows. A bot takes over only at the third consecutive silence.
        if (!seat.auto) return { robotId: robot.id, patch: null };
      }
      return { robotId: robot.id, patch: choosePatch(world, robot.id, seat.bot || config.level, { observed }) };
    });
    const result = runCycle(world, patches);
    try {
      await publish({ v: 1, t: 'cycle', n, patches, hash: hashWorld(result.world) }, `cycle:${n}`);
      if (JSON.stringify(updatedRoster) !== JSON.stringify(roster)) await publishRoster(updatedRoster, `auto:${n}`);
    } catch (error) {
      resolving = false;
      throw error;
    }
  }
  function allSubmitted() {
    return roster.filter(seat => seat.participantId !== null && !seat.auto).every(seat => commands.has(seat.id));
  }
  async function requestReplay(reason = 'manual') {
    if (disposed || !started) return;
    if (phase === 'closed') throw roomError('ROOM_CLOSED');
    phase = 'syncing';
    pendingReplay = `${selfId}:${++replayCounter}`;
    replayParts = new Map();
    status('ROOM_SYNCING', { reason });
    await publish({ v: 1, t: 'need', reason, requestId: pendingReplay }, `need:${replayCounter}`);
  }
  function replayChunks(participantId, requestId) {
    const base = { v: 1, t: 'log', for: participantId, requestId, total: 32, part: 0,
      start: { seed, config, roster: initialRoster }, roster, deadline, cycles: [] };
    const chunks = [base];
    for (const entry of history) {
      const target = chunks[chunks.length - 1];
      const proposed = { ...target, cycles: [...target.cycles, entry] };
      try { roomMessageBytes(proposed); target.cycles.push(clone(entry)); }
      catch (error) {
        if (error.code !== 'ROOM_PAYLOAD_TOO_LARGE') throw error;
        chunks.push({ v: 1, t: 'log', for: participantId, requestId, total: 32, part: chunks.length, cycles: [clone(entry)] });
      }
    }
    return chunks.map((chunk, part) => ({ ...chunk, part, total: chunks.length }));
  }
  function verifyCycle(current, data) {
    if (current.status !== 'playing' || data.n !== current.cycle || !Array.isArray(data.patches) || data.patches.length !== current.robots.length
      || new Set(data.patches.map(entry => entry.robotId)).size !== current.robots.length
      || data.patches.some(entry => !current.robots.some(robot => robot.id === entry.robotId) || !validPatch(entry.patch))
      || !/^[0-9a-f]{8}$/.test(data.hash)) throw roomError('ROOM_CYCLE_INVALID');
    const result = runCycle(current, data.patches);
    if (hashWorld(result.world) !== data.hash) throw roomError('ROOM_HASH_MISMATCH');
    return result;
  }

  async function handle(data, sender) {
    if (data.t === 'hello' && isHost && !bootstrapping) {
      if (typeof data.name !== 'string' || data.name.length > 40 || !/^#[0-9a-f]{6}$/i.test(data.color)) return;
      const availableRoster = proposedRoster ?? roster;
      const existing = availableRoster.find(seat => seat.participantId === sender);
      if (existing) {
        if (existing.auto) {
          const next = clone(availableRoster);
          next.find(seat => seat.id === existing.id).auto = false;
          await publishRoster(next, `return:${sender}:${world?.cycle ?? 0}`);
        }
        return;
      }
      const available = availableRoster.find(seat => !started ? seat.participantId === null
        : seat.auto || (seat.participantId === null && seat.bot === 'intern'));
      if (!available) { status('ROOM_SPECTATOR_JOINED', { participantId: sender }); return; }
      const next = clone(availableRoster);
      Object.assign(next.find(seat => seat.id === available.id), { participantId: sender, name: data.name, color: data.color, bot: null, auto: false });
      await publishRoster(next, `join:${sender}`);
      return;
    }
    if (data.t === 'cmd') {
      if (!isHost || phase !== 'window' || data.cycle !== world?.cycle || !validPatch(data.patch)) return;
      const seat = roster.find(item => item.participantId === sender);
      if (!seat || commands.has(seat.id)) return;
      commands.set(seat.id, { patch: data.patch === null ? null : { slot: data.patch.slot, op: data.patch.op } });
      // Reconstruct pending commands on host reload, but never resolve or
      // publish while replaying historical service envelopes.
      if (!bootstrapping && allSubmitted()) await resolveCycle();
      return;
    }
    if (data.t === 'need') {
      if (!isHost || bootstrapping || !started || !validId(data.requestId)) return;
      const chunks = replayChunks(sender, data.requestId);
      for (const chunk of chunks) await publish(chunk, `log:${data.requestId}:${chunk.part}`);
      return;
    }
    if (data.t === 'chat') {
      if (typeof data.text !== 'string' || data.text.length > 200) return;
      for (const listener of chats) listener({ participantId: sender, text: data.text });
      return;
    }
    // A forged host identifier inside data never grants authority.
    if (sender !== hostId) return;
    if (data.t === 'roster') {
      const next = cleanRoster(data.robots);
      if (started && next.length !== initialRoster.length) throw roomError('ROOM_ROSTER_INVALID');
      for (const seat of next) {
        const previous = roster.find(item => item.id === seat.id);
        if (!previous || previous.participantId !== seat.participantId || (previous.auto && !seat.auto)) silence.set(seat.id, 0);
      }
      roster = next;
      if (JSON.stringify(proposedRoster) === JSON.stringify(next)) proposedRoster = null;
      notifyRoster();
      return;
    }
    if (data.t === 'start') {
      if (started || !roster.length || typeof data.seed !== 'string' || data.seed.length > 256) return;
      config = cleanConfig(data.config);
      if (config.count !== roster.length) throw roomError('ROOM_CONFIG_INVALID');
      seed = data.seed; initialRoster = clone(roster);
      world = setupProd(seed, { ...config, roster: initialRoster });
      started = true; phase = 'starting'; history = []; observed = {};
      if (helloTimer !== null) cancel(helloTimer);
      status('ROOM_STARTED');
      if (isHost && !bootstrapping) await openWindow();
      return;
    }
    if (data.t === 'tick') {
      if (!world || world.status !== 'playing' || data.cycle !== world.cycle || !Number.isFinite(data.deadline)) return;
      if (data.deadline < 0 || phase === 'window') return;
      deadline = data.deadline; phase = 'window'; resolving = false; commands.clear();
      armWindow(); status('ROOM_WINDOW');
      if (isHost && !bootstrapping && allSubmitted()) await resolveCycle();
      return;
    }
    if (data.t === 'cycle') {
      if (!world || data.n < world.cycle || world.status !== 'playing') return;
      if (data.n > world.cycle) { needsReplay = 'cycle-gap'; if (!bootstrapping) await requestReplay(needsReplay); return; }
      let result;
      try { result = verifyCycle(world, data); }
      catch (error) {
        if (error.code !== 'ROOM_HASH_MISMATCH') throw error;
        needsReplay = 'hash-mismatch';
        if (!bootstrapping) await requestReplay(needsReplay);
        return;
      }
      // Count completed windows, including during a host's history replay.
      // Keeping this out of resolveCycle avoids losing consecutive silences
      // on reload or incrementing them for an unconfirmed/failed publication.
      if (isHost) for (const seat of roster) if (seat.participantId !== null) {
        silence.set(seat.id, commands.has(seat.id) ? 0 : (silence.get(seat.id) || 0) + 1);
      }
      const previousKnowledge = clone(observed);
      world = result.world; observe(result.trace); history.push(clone({ n: data.n, patches: data.patches, hash: data.hash }));
      phase = world.status === 'playing' ? 'animating' : 'ended'; deadline = null; resolving = false; commands.clear();
      if (windowTimer !== null) cancel(windowTimer);
      windowTimer = null;
      const output = presentationCycle(result, previousKnowledge, data.patches);
      for (const listener of cycles) listener(output);
      status(world.status === 'playing' ? 'ROOM_CYCLE' : 'ROOM_ENDED');
      if (isHost && !bootstrapping) {
        if (world.status === 'playing') nextTimer = schedule(openWindow, options.animationMs ?? 3000);
        else await publish({ v: 1, t: 'end', ranking: rankRobots(presentationWorld(world)) }, `end:${world.cycle}`);
      }
      return;
    }
    if (data.t === 'log' && data.for === selfId && data.requestId === pendingReplay) {
      if (!Number.isInteger(data.total) || data.total < 1 || data.total > 32
        || !Number.isInteger(data.part) || data.part < 0 || data.part >= data.total || !Array.isArray(data.cycles)) throw roomError('ROOM_REPLAY_INVALID');
      replayParts.set(data.part, clone(data));
      if (replayParts.size !== data.total) return;
      const parts = Array.from({ length: data.total }, (_, index) => replayParts.get(index));
      if (parts.some(part => !part || part.total !== data.total)) throw roomError('ROOM_REPLAY_INVALID');
      const start = parts[0].start;
      if (!start || typeof start.seed !== 'string') throw roomError('ROOM_REPLAY_INVALID');
      const nextConfig = cleanConfig(start.config), nextRoster = cleanRoster(start.roster);
      if (nextConfig.count !== nextRoster.length) throw roomError('ROOM_REPLAY_INVALID');
      let restored = setupProd(start.seed, { ...nextConfig, roster: nextRoster });
      const restoredHistory = [], restoredObserved = {};
      for (const entry of parts.flatMap(part => part.cycles)) {
        const result = verifyCycle(restored, entry);
        restored = result.world;
        for (const frame of result.trace) for (const event of frame.events) if (event.type === 'instruction') {
          restoredObserved[event.robotId] ??= Array(6).fill(null);
          restoredObserved[event.robotId][event.slot] = event.op;
        }
        restoredHistory.push(clone(entry));
      }
      const latestRoster = cleanRoster(parts[0].roster);
      if (latestRoster.length !== nextRoster.length) throw roomError('ROOM_REPLAY_INVALID');
      world = restored; config = nextConfig; seed = start.seed; initialRoster = nextRoster; roster = latestRoster;
      history = restoredHistory; observed = restoredObserved; pendingReplay = null; replayParts.clear(); needsReplay = null;
      deadline = Number.isFinite(parts[0].deadline) ? parts[0].deadline : null;
      phase = world.status !== 'playing' ? 'ended' : deadline !== null ? 'window' : 'animating';
      notifyRoster(); armWindow(); status('ROOM_SYNCED');
      return;
    }
    if (data.t === 'end' && world && world.status !== 'playing') { phase = 'ended'; status('ROOM_ENDED', { ranking: rankRobots(presentationWorld(world)) }); }
  }

  async function receive(envelope) {
    if (disposed || phase === 'closed' || !Number.isSafeInteger(envelope?.sequence) || envelope.sequence < 1 || seen.has(envelope.sequence)) return;
    const sender = options.identityAdapter.getSenderId(envelope);
    if (!validId(sender)) throw roomError('ROOM_SENDER_UNVERIFIED');
    const data = envelope.data;
    roomMessageBytes(data);
    if (!data || data.v !== 1 || typeof data.t !== 'string') return;
    seen.add(envelope.sequence); cursor = Math.max(cursor, envelope.sequence);
    await handle(data, sender);
  }

  try {
    while (true) {
      const batch = await lobby.read({ after: cursor, limit: 100 });
      if (!Array.isArray(batch?.messages) || !Number.isSafeInteger(batch.cursor) || batch.cursor < cursor) throw roomError('ROOM_HISTORY_INVALID');
      const before = cursor;
      for (const envelope of batch.messages) await receive(envelope);
      cursor = Math.max(cursor, batch.cursor);
      if (cursor === before || !batch.messages.length) break;
    }
    bootstrapping = false;
    unsubscribe = lobby.subscribe(async envelope => {
      try { await receive(envelope); } catch (error) { reportError(error); }
    }, { after: cursor, onError: reportError });
    if (isHost && !roster.length) await publishRoster(makeRoster(), 'initial');
    if (started) {
      if (needsReplay) await requestReplay(needsReplay);
      else if (isHost && world.status === 'playing') {
        if (phase === 'window') {
          armWindow();
          if (allSubmitted()) await resolveCycle();
        }
        else nextTimer = schedule(openWindow, options.animationMs ?? 3000);
      }
      await publish({ v: 1, t: 'hello', name, lang: options.lang === 'fr' ? 'fr' : 'en', color }, `late-hello:${cursor}`);
    } else await hello();
  } catch (error) {
    unsubscribe?.();
    for (const timer of [windowTimer, nextTimer, helloTimer]) if (timer !== null) cancel(timer);
    throw error;
  }

  return {
    getSelfId: () => selfId, getHostId: () => hostId,
    getPlayerId: () => roster.find(seat => seat.participantId === selfId)?.id ?? null,
    getWorld: () => world ? presentationWorld(world) : null,
    getRoster: () => clone(roster),
    getHistory: () => clone(history),
    getState: () => ({ phase, deadline, started, isHost, selfId, hostId, seed, config: clone(config), canContinueSolo: Boolean(world) }),
    onCycle(listener) { cycles.add(listener); return () => cycles.delete(listener); },
    onStatus(listener) { statuses.add(listener); listener({ code: 'ROOM_STATE', ...this.getState() }); return () => statuses.delete(listener); },
    onRoster(listener) { rosters.add(listener); listener(clone(roster)); return () => rosters.delete(listener); },
    onChat(listener) { chats.add(listener); return () => chats.delete(listener); },
    async start() {
      if (!isHost || started || !roster.length) throw roomError('ROOM_START_FORBIDDEN');
      return publish({ v: 1, t: 'start', seed, config: { ...config, count: roster.length } }, 'start');
    },
    async send(cmd) {
      if (phase !== 'window' || !world) throw roomError('ROOM_WINDOW_CLOSED');
      if (!roster.some(seat => seat.participantId === selfId)) throw roomError('ROOM_SPECTATOR');
      const patch = cmd === null ? null : Object.hasOwn(cmd, 'patch') ? cmd.patch : cmd;
      if (!validPatch(patch)) throw roomError('ROOM_PATCH_INVALID');
      return publish({ v: 1, t: 'cmd', cycle: world.cycle, patch: patch === null ? null : { slot: patch.slot, op: patch.op } }, `cmd:${world.cycle}`);
    },
    async chat(text) {
      if (typeof text !== 'string' || text.length > 200) throw roomError('ROOM_CHAT_INVALID');
      return publish({ v: 1, t: 'chat', text }, `chat:${cursor}:${text}`);
    },
    claimRobot() { return publish({ v: 1, t: 'hello', name, lang: options.lang === 'fr' ? 'fr' : 'en', color }, `claim:${cursor}`); },
    requestReplay,
    dispose() {
      disposed = true; unsubscribe?.();
      for (const timer of [windowTimer, nextTimer, helloTimer]) if (timer !== null) cancel(timer);
      cycles.clear(); statuses.clear(); rosters.clear(); chats.clear();
    },
  };
}
