import assert from 'node:assert/strict';
import { createRoomGame, hashWorld, roomMessageBytes, ROOM_MAX_BYTES } from '../src/net/room.js';
import { setupProd, rankRobots } from '../src/prod/setup.js';
import { runCycle } from '../src/core/sim.js';
import { preview } from '../src/core/trace.js';
import { choosePatch } from '../src/ai/bot.js';

const clone = value => JSON.parse(JSON.stringify(value));
// These fields belong to this test service only. They are not asserted to be
// real LOB7 metadata. The production adapter refuses an unverified schema.
const identityAdapter = {
  verified: true, source: 'authenticated mock service envelope in net.test.mjs',
  getSelfId: room => room.serviceParticipantId,
  getHostId: room => room.serviceHostId,
  getSenderId: envelope => envelope.serviceSenderId,
};

class MockRoomService {
  constructor() { this.messages = []; this.subscribers = new Set(); this.keys = new Map(); this.jobs = Promise.resolve(); this.timeoutOnce = false; this.sends = []; }
  client(id, host = 'host') {
    return {
      room: { serviceParticipantId: id, serviceHostId: host },
      read: async ({ after = 0, limit = 50 } = {}) => {
        const messages = this.messages.filter(item => item.sequence > after).slice(0, limit);
        return { messages: clone(messages), cursor: messages.at(-1)?.sequence ?? after };
      },
      send: async (data, { idempotencyKey }) => {
        this.sends.push({ id, data: clone(data), idempotencyKey });
        const key = `${id}:${idempotencyKey}`;
        if (this.keys.has(key)) return clone(this.keys.get(key));
        const message = this.inject(id, data);
        this.keys.set(key, message);
        if (this.timeoutOnce) { this.timeoutOnce = false; throw Object.assign(new Error('Committed but acknowledgement lost'), { code: 'ROOM_TIMEOUT' }); }
        return clone(message);
      },
      subscribe: (callback, options) => {
        const subscriber = { callback, options, cursor: options.after };
        this.subscribers.add(subscriber);
        for (const message of this.messages) this.deliver(subscriber, message);
        return () => this.subscribers.delete(subscriber);
      },
    };
  }
  deliver(subscriber, message) {
    if (message.sequence <= subscriber.cursor) return;
    subscriber.cursor = message.sequence;
    this.jobs = this.jobs.then(() => subscriber.callback(clone(message)));
  }
  inject(sender, data) {
    const message = { sequence: this.messages.length + 1, data: clone(data), serviceSenderId: sender };
    this.messages.push(message);
    for (const subscriber of this.subscribers) this.deliver(subscriber, message);
    return message;
  }
  async drain() {
    for (let iteration = 0; iteration < 100; iteration++) {
      const jobs = this.jobs;
      await jobs;
      await Promise.resolve();
      if (jobs === this.jobs) return;
    }
    throw new Error('Mock service did not become idle');
  }
  fail(error) { for (const subscriber of this.subscribers) subscriber.options.onError(error); }
}

class Clock {
  constructor(service) { this.service = service; this.time = 1000; this.timers = new Map(); this.serial = 0; }
  now = () => this.time;
  setTimeout = (callback, delay) => { const id = ++this.serial; this.timers.set(id, { callback, time: this.time + delay }); return id; };
  clearTimeout = id => this.timers.delete(id);
  async advance(milliseconds) {
    this.time += milliseconds;
    for (let iteration = 0; iteration < 100; iteration++) {
      const due = [...this.timers].filter(([, timer]) => timer.time <= this.time).sort((a, b) => a[1].time - b[1].time)[0];
      if (!due) return;
      this.timers.delete(due[0]); due[1].callback();
      await Promise.resolve(); await this.service.drain();
    }
    throw new Error('Mock clock did not become idle');
  }
}

function optionsFor(service, clock, participant, config = {}) {
  return { lobby: service.client(participant), identityAdapter, name: participant, seed: 'net-fixture',
    config: { level: 'intern', cycles: 6, ...config }, now: clock.now,
    setTimeout: clock.setTimeout, clearTimeout: clock.clearTimeout, animationMs: 3000 };
}

export default async function run() {
  assert.equal(roomMessageBytes({ v: 1, t: 'hello' }), new TextEncoder().encode('{"v":1,"t":"hello"}').length);
  const emptySize = roomMessageBytes({ text: '' });
  assert.equal(roomMessageBytes({ text: 'a'.repeat(ROOM_MAX_BYTES - emptySize) }), ROOM_MAX_BYTES);
  assert.throws(() => roomMessageBytes({ text: 'a'.repeat(ROOM_MAX_BYTES - emptySize + 1) }), { code: 'ROOM_PAYLOAD_TOO_LARGE' });
  assert.throws(() => roomMessageBytes({ text: 'é'.repeat(4096) }), { code: 'ROOM_PAYLOAD_TOO_LARGE' });
  for (const value of [{ number: Infinity }, { missing: undefined }, { bad: NaN }]) assert.throws(() => roomMessageBytes(value), { code: 'ROOM_PAYLOAD_INVALID' });
  const circular = {}; circular.self = circular;
  assert.throws(() => roomMessageBytes(circular), { code: 'ROOM_PAYLOAD_INVALID' });
  assert.equal(hashWorld(setupProd('hash-test')), hashWorld(setupProd('hash-test')));
  assert.notEqual(hashWorld(setupProd('hash-test')), hashWorld(setupProd('other-hash-test')));
  const physicalFixture = setupProd('hash-test');
  const relabelled = { ...physicalFixture, window: 90, robots: physicalFixture.robots.map(robot => ({
    ...robot, name: 'New controller', color: '#ABCDEF', bot: null, participantId: 'new-person', auto: true, observed: Array(6).fill('FWD'),
  })) };
  assert.equal(hashWorld(physicalFixture), hashWorld(relabelled), 'Presentation and observation changes cannot alter a physics hash');
  assert.notEqual(hashWorld(physicalFixture), hashWorld({ ...physicalFixture,
    robots: physicalFixture.robots.map((robot, index) => index ? robot : { ...robot, x: robot.x + 1 }),
  }), 'Physical position remains part of the hash');

  const service = new MockRoomService(), clock = new Clock(service);
  await assert.rejects(createRoomGame({ lobby: service.client('host') }), { code: 'ROOM_IDENTITY_UNVERIFIED' });
  await assert.rejects(createRoomGame({ lobby: service.client('host'), identityAdapter: { ...identityAdapter, verified: false } }), { code: 'ROOM_IDENTITY_UNVERIFIED' });
  const host = await createRoomGame(optionsFor(service, clock, 'host'));
  await service.drain();
  const guest = await createRoomGame(optionsFor(service, clock, 'guest'));
  await service.drain();
  const games = [host, guest];
  try {
    assert.equal(host.getRoster().length, 4);
    assert.equal(host.getPlayerId(), 'r0');
    assert.equal(guest.getPlayerId(), 'r1');
    await assert.rejects(guest.start(), { code: 'ROOM_START_FORBIDDEN' });
    await host.start(); await service.drain();
    assert.equal(host.getState().phase, 'window');
    assert.equal(guest.getState().phase, 'window');
    assert.equal(hashWorld(host.getWorld()), hashWorld(guest.getWorld()));

    // Host authority comes from the service envelope, never a payload field.
    const before = hashWorld(host.getWorld());
    service.inject('guest', { v: 1, t: 'cycle', from: 'host', n: 0, patches: [], hash: '00000000' });
    service.inject('guest', { v: 1, t: 'roster', from: 'host', robots: [] });
    service.inject('guest', { v: 1, t: 'tick', from: 'host', cycle: 0, deadline: 2 });
    await service.drain();
    assert.equal(hashWorld(host.getWorld()), before);
    assert.equal(host.getState().deadline, 46000);
    await assert.rejects(guest.send({ patch: { slot: 6, op: 'FWD' } }), { code: 'ROOM_PATCH_INVALID' });
    await assert.rejects(guest.chat('x'.repeat(201)), { code: 'ROOM_CHAT_INVALID' });

    // A command may not claim another robot, even if it includes that id.
    service.inject('outsider', { v: 1, t: 'cmd', cycle: 0, robotId: 'r0', patch: { slot: 0, op: 'LEFT' } });
    service.inject('guest', { v: 1, t: 'cmd', cycle: 0, robotId: 'r0', patch: { slot: 0, op: 'RIGHT' } });
    await service.drain();
    assert.equal(host.getWorld().cycle, 0);
    service.timeoutOnce = true;
    await host.send({ patch: null }); await service.drain();
    assert.equal(host.getWorld().cycle, 1);
    assert.equal(guest.getWorld().cycle, 1);
    assert.equal(host.getHistory()[0].patches.find(entry => entry.robotId === 'r0').patch, null);
    assert.deepEqual(host.getHistory()[0].patches.find(entry => entry.robotId === 'r1').patch, { slot: 0, op: 'RIGHT' });
    const hostCommandSends = service.sends.filter(item => item.id === 'host' && item.data.t === 'cmd' && item.data.cycle === 0);
    assert.equal(hostCommandSends.length, 2);
    assert.equal(hostCommandSends[0].idempotencyKey, hostCommandSends[1].idempotencyKey);
    assert.equal(service.messages.filter(item => item.serviceSenderId === 'host' && item.data.t === 'cmd' && item.data.cycle === 0).length, 1);
    assert.equal(hashWorld(host.getWorld()), hashWorld(guest.getWorld()));

    // Duplicate cycles and stale commands cannot advance the simulation.
    const cycleMessage = service.messages.find(item => item.data.t === 'cycle');
    service.inject('host', cycleMessage.data);
    service.inject('guest', { v: 1, t: 'cmd', cycle: 0, patch: null });
    await service.drain();
    assert.equal(host.getWorld().cycle, 1);
    await clock.advance(3000);
    assert.equal(host.getState().phase, 'window');
    service.inject('guest', { v: 1, t: 'cmd', cycle: 0, patch: null });
    await service.drain(); assert.equal(host.getWorld().cycle, 1);

    // A wrong hash is never committed. Recovery contains seed+patch acts,
    // never an authoritative state snapshot supplied by another client.
    const current = host.getWorld();
    const patches = current.robots.map(robot => ({ robotId: robot.id, patch: null }));
    const wrong = hashWorld(runCycle(current, patches).world) === 'deadbeef' ? 'ffffffff' : 'deadbeef';
    service.inject('host', { v: 1, t: 'cycle', n: current.cycle, patches, hash: wrong });
    await service.drain();
    assert.equal(host.getWorld().cycle, 1); assert.equal(guest.getWorld().cycle, 1);
    assert.equal(hashWorld(host.getWorld()), hashWorld(guest.getWorld()));
    const logs = service.messages.filter(item => item.data.t === 'log');
    assert(logs.length >= 2);
    for (const item of logs) { assert(!Object.hasOwn(item.data, 'world')); assert(!Object.hasOwn(item.data, 'snapshot')); roomMessageBytes(item.data); }
    assert(logs.some(item => item.data.start && Array.isArray(item.data.cycles)));

    // A late participant reconstructs the exact world, then takes an intern
    // bot seat. It cannot inject a custom world during joining.
    const late = await createRoomGame(optionsFor(service, clock, 'late'));
    games.push(late); await service.drain();
    assert.equal(late.getPlayerId(), 'r2');
    assert.equal(hashWorld(host.getWorld()), hashWorld(late.getWorld()));
    const statuses = [];
    late.onStatus(value => statuses.push(value));
    await late.requestReplay('test'); await service.drain();
    assert(statuses.some(item => item.code === 'ROOM_SYNCED'));
    assert.equal(hashWorld(host.getWorld()), hashWorld(late.getWorld()));

    const chat = [];
    host.onChat(value => chat.push(value));
    await guest.chat('hello'); await service.drain();
    assert.deepEqual(chat.at(-1), { participantId: 'guest', text: 'hello' });
    service.fail(Object.assign(new Error('Host closed room'), { code: 'ROOM_CONNECTION_CLOSED' }));
    assert.equal(host.getState().phase, 'closed');
    assert.equal(late.getState().phase, 'closed');
    assert(statuses.some(item => item.code === 'ROOM_CLOSED' && item.canContinueSolo));
    const closedWorld = host.getWorld();
    const closedPatches = closedWorld.robots.map(robot => ({ robotId: robot.id, patch: null }));
    service.inject('host', { v: 1, t: 'cycle', n: closedWorld.cycle, patches: closedPatches,
      hash: hashWorld(runCycle(closedWorld, closedPatches).world) });
    await service.drain();
    assert.equal(hashWorld(host.getWorld()), hashWorld(closedWorld), 'Room closure freezes the state offered for solo continuation');
    await assert.rejects(late.requestReplay('closed'), { code: 'ROOM_CLOSED' });
  } finally { for (const game of games) game.dispose(); }
  assert.equal(service.subscribers.size, 0);

  // Three silent cycles switch humans to auto; a return hello restores the
  // same seat, and an unassigned late join may take another auto seat.
  const silenceService = new MockRoomService(), silenceClock = new Clock(silenceService);
  const quietHost = await createRoomGame(optionsFor(silenceService, silenceClock, 'host', { cycles: 12, level: 'ops' }));
  await silenceService.drain();
  const quietGuest = await createRoomGame(optionsFor(silenceService, silenceClock, 'guest', { cycles: 12, level: 'ops' }));
  await silenceService.drain();
  try {
    await quietHost.start(); await silenceService.drain();
    const spectator = await createRoomGame(optionsFor(silenceService, silenceClock, 'spectator', { cycles: 12, level: 'ops' }));
    try {
      await silenceService.drain(); assert.equal(spectator.getPlayerId(), null);
      await assert.rejects(spectator.send({ patch: null }), { code: 'ROOM_SPECTATOR' });
      for (let cycle = 0; cycle < 3; cycle++) {
        await silenceClock.advance(45000);
        if (cycle < 2) await silenceClock.advance(3000);
      }
      assert.equal(quietHost.getWorld().cycle, 3);
      assert(quietHost.getRoster().find(seat => seat.id === 'r1').auto);
      await quietGuest.claimRobot(); await silenceService.drain();
      assert.equal(quietGuest.getPlayerId(), 'r1');
      assert.equal(quietHost.getRoster().find(seat => seat.id === 'r1').auto, false);
      await spectator.claimRobot(); await silenceService.drain();
      assert.equal(spectator.getPlayerId(), 'r0');
      assert.equal(quietHost.getPlayerId(), null);
    } finally { spectator.dispose(); }
  } finally { quietHost.dispose(); quietGuest.dispose(); }

  const joinService = new MockRoomService(), joinClock = new Clock(joinService);
  const joinHost = await createRoomGame(optionsFor(joinService, joinClock, 'host'));
  await joinService.drain();
  try {
    joinService.inject('first', { v: 1, t: 'hello', name: 'first', lang: 'en', color: '#3B8EA5' });
    joinService.inject('second', { v: 1, t: 'hello', name: 'second', lang: 'en', color: '#8E5CC9' });
    await joinService.drain();
    assert.equal(joinHost.getRoster().find(seat => seat.participantId === 'first').id, 'r1');
    assert.equal(joinHost.getRoster().find(seat => seat.participantId === 'second').id, 'r2');
  } finally { joinHost.dispose(); }

  // Maximum-length authenticated participant identifiers and a full 8-player
  // history exercise multipart replay while keeping every message <=8192 B.
  const largeService = new MockRoomService(), largeClock = new Clock(largeService);
  const largeHost = await createRoomGame({ ...optionsFor(largeService, largeClock, 'host', { count: 8, cycles: 12 }),
    name: 'H'.repeat(40), seed: 'large-replay-'.repeat(18) });
  await largeService.drain();
  const participantIds = Array.from({ length: 7 }, (_, index) => `p${index}`.padEnd(128, String(index)));
  let observer;
  try {
    for (const [index, participant] of participantIds.entries()) largeService.inject(participant,
      { v: 1, t: 'hello', name: String(index).repeat(40), lang: 'en', color: '#3B8EA5' });
    await largeService.drain();
    assert.equal(largeHost.getRoster().filter(seat => seat.participantId !== null).length, 8);
    await largeHost.start(); await largeService.drain();
    for (let cycle = 0; cycle < 12 && largeHost.getWorld().status === 'playing'; cycle++) {
      const patch = { slot: cycle % 6, op: 'WAIT' };
      for (const participant of participantIds) largeService.inject(participant, { v: 1, t: 'cmd', cycle, patch });
      await largeHost.send({ patch }); await largeService.drain();
      if (largeHost.getWorld().status === 'playing') await largeClock.advance(3000);
    }
    assert.equal(largeHost.getWorld().cycle, 12);
    observer = await createRoomGame(optionsFor(largeService, largeClock, 'observer'));
    await largeService.drain();
    await observer.requestReplay('multipart'); await largeService.drain();
    const chunks = largeService.messages.filter(item => item.data.t === 'log' && item.data.for === 'observer');
    assert(chunks.length >= 2, 'Maximum-size history should use multiple replay messages');
    assert.equal(hashWorld(observer.getWorld()), hashWorld(largeHost.getWorld()));
    for (const chunk of chunks) assert(roomMessageBytes(chunk.data) <= ROOM_MAX_BYTES);
  } finally { observer?.dispose(); largeHost.dispose(); }

  // A host reload during an open window restores the guest's authenticated
  // command from history instead of silently replacing it at the deadline.
  const reloadService = new MockRoomService(), reloadClock = new Clock(reloadService);
  let reloadHost = await createRoomGame(optionsFor(reloadService, reloadClock, 'host', { level: 'ops', cycles: 12 }));
  await reloadService.drain();
  const reloadGuest = await createRoomGame(optionsFor(reloadService, reloadClock, 'guest', { level: 'ops', cycles: 12 }));
  await reloadService.drain();
  try {
    await reloadHost.start(); await reloadService.drain();
    await reloadGuest.send({ patch: { slot: 0, op: 'LEFT' } }); await reloadService.drain();
    reloadHost.dispose();
    reloadHost = await createRoomGame(optionsFor(reloadService, reloadClock, 'host', { level: 'ops', cycles: 12 }));
    await reloadService.drain();
    await reloadHost.send({ patch: null }); await reloadService.drain();
    assert.equal(reloadHost.getWorld().cycle, 1, 'The restored guest command allows immediate resolution with the host command');
    assert.deepEqual(reloadHost.getHistory()[0].patches.find(entry => entry.robotId === 'r1').patch, { slot: 0, op: 'LEFT' });
    assert.equal(hashWorld(reloadHost.getWorld()), hashWorld(reloadGuest.getWorld()));
    await reloadClock.advance(45000);
    assert.deepEqual(reloadHost.getHistory()[0].patches.find(entry => entry.robotId === 'r1').patch, { slot: 0, op: 'LEFT' });
  } finally { reloadHost.dispose(); reloadGuest.dispose(); }

  // If all commands reached the service just before the host disappeared,
  // bootstrap must finish first, then publish exactly one cycle immediately.
  const completeService = new MockRoomService(), completeClock = new Clock(completeService);
  let completeHost = await createRoomGame(optionsFor(completeService, completeClock, 'host'));
  await completeService.drain();
  const completeGuest = await createRoomGame(optionsFor(completeService, completeClock, 'guest'));
  await completeService.drain();
  try {
    await completeHost.start(); await completeService.drain();
    completeService.inject('guest', { v: 1, t: 'cmd', cycle: 0, patch: { slot: 0, op: 'LEFT' } });
    completeService.inject('host', { v: 1, t: 'cmd', cycle: 0, patch: null });
    completeHost.dispose();
    completeHost = await createRoomGame(optionsFor(completeService, completeClock, 'host'));
    await completeService.drain();
    assert.equal(completeHost.getWorld().cycle, 1);
    assert.equal(completeService.messages.filter(message => message.data.t === 'cycle' && message.data.n === 0).length, 1);
    assert.deepEqual(completeHost.getHistory()[0].patches.find(entry => entry.robotId === 'r1').patch, { slot: 0, op: 'LEFT' });
  } finally { completeHost.dispose(); completeGuest.dispose(); }

  // The first two human absences ship null patches. Consecutive absences
  // survive a host reload; only the third invokes the bot and marks auto.
  const thresholdService = new MockRoomService(), thresholdClock = new Clock(thresholdService);
  let thresholdHost = await createRoomGame(optionsFor(thresholdService, thresholdClock, 'host', { level: 'ops', cycles: 12 }));
  await thresholdService.drain();
  const thresholdGuest = await createRoomGame(optionsFor(thresholdService, thresholdClock, 'guest', { level: 'ops', cycles: 12 }));
  await thresholdService.drain();
  try {
    await thresholdHost.start(); await thresholdService.drain();
    for (let cycle = 0; cycle < 2; cycle++) {
      await thresholdHost.send({ patch: null }); await thresholdService.drain();
      await thresholdClock.advance(45000);
      assert.equal(thresholdHost.getHistory()[cycle].patches.find(entry => entry.robotId === 'r1').patch, null);
      assert.equal(thresholdHost.getRoster().find(seat => seat.id === 'r1').auto, false);
      await thresholdClock.advance(3000);
    }
    thresholdHost.dispose();
    thresholdHost = await createRoomGame(optionsFor(thresholdService, thresholdClock, 'host', { level: 'ops', cycles: 12 }));
    await thresholdService.drain();
    const beforeTakeover = thresholdHost.getWorld();
    const expectedBotPatch = choosePatch(beforeTakeover, 'r1', 'ops');
    await thresholdHost.send({ patch: null }); await thresholdService.drain();
    await thresholdClock.advance(45000);
    assert.equal(thresholdHost.getWorld().cycle, 3);
    assert.equal(thresholdHost.getRoster().find(seat => seat.id === 'r1').auto, true);
    assert.deepEqual(thresholdHost.getHistory()[2].patches.find(entry => entry.robotId === 'r1').patch, expectedBotPatch);
  } finally { thresholdHost.dispose(); thresholdGuest.dispose(); }

  // Presentation is decorated from the latest roster without changing the
  // replayed physics. Observed slots are exposed progressively in trace
  // frames and fully after a complete cycle, for correct future forecasts.
  const viewService = new MockRoomService(), viewClock = new Clock(viewService);
  const viewHost = await createRoomGame(optionsFor(viewService, viewClock, 'host', { cycles: 2 }));
  await viewService.drain();
  const viewGuest = await createRoomGame(optionsFor(viewService, viewClock, 'guest', { cycles: 2 }));
  await viewService.drain();
  let viewLate;
  const visibleCycles = [];
  viewHost.onCycle(payload => visibleCycles.push(payload));
  try {
    await viewHost.start(); await viewService.drain();
    await viewGuest.send({ patch: null }); await viewHost.send({ patch: null }); await viewService.drain();
    assert.equal(visibleCycles[0].trace.length, 6);
    const first = visibleCycles[0];
    for (const frame of first.trace) {
      const before = frame.before.robots.find(robot => robot.id === 'r1');
      const after = frame.world.robots.find(robot => robot.id === 'r1');
      for (let slot = frame.tick; slot < 6; slot++) assert.equal(before.observed[slot], null, 'Future slots must not leak before observation');
      assert.equal(after.observed[frame.tick], after.program[frame.tick]);
      for (let slot = frame.tick + 1; slot < 6; slot++) assert.equal(after.observed[slot], null);
    }
    const visible = viewHost.getWorld();
    for (const robot of visible.robots) assert.deepEqual(robot.observed, robot.program);
    const forecast = preview(visible, 'r0');
    assert.equal(hashWorld(forecast.world), hashWorld(runCycle(visible).world), 'With all slots observed and no new patches, forecasting uses the observed programs');
    assert.equal(hashWorld(visible), viewHost.getHistory()[0].hash);
    viewLate = await createRoomGame({ ...optionsFor(viewService, viewClock, 'late', { cycles: 2 }), name: 'LATE HUMAN', color: '#00AA99' });
    await viewService.drain();
    for (const controller of [viewHost, viewGuest, viewLate]) {
      const robot = controller.getWorld().robots.find(item => item.id === 'r2');
      assert.equal(robot.name, 'LATE HUMAN'); assert.equal(robot.color, '#00AA99');
      assert.equal(robot.bot, null); assert.equal(robot.participantId, 'late');
      assert.equal(hashWorld(controller.getWorld()), viewHost.getHistory()[0].hash, 'Taking a bot seat cannot rewrite the last physics hash');
      assert.equal(rankRobots(controller.getWorld()).find(item => item.id === 'r2').name, 'LATE HUMAN');
    }
    await viewLate.requestReplay('presentation'); await viewService.drain();
    assert.equal(viewLate.getWorld().robots.find(item => item.id === 'r2').name, 'LATE HUMAN');
    assert.deepEqual(viewLate.getWorld().robots.find(item => item.id === 'r1').observed, visible.robots.find(item => item.id === 'r1').observed);
    await viewClock.advance(3000);
    await viewHost.send({ patch: null }); await viewGuest.send({ patch: null }); await viewLate.send({ patch: null });
    await viewService.drain();
    const final = visibleCycles.at(-1);
    assert.equal(final.world.robots.find(item => item.id === 'r2').name, 'LATE HUMAN');
    assert.equal(final.ranking.find(item => item.id === 'r2').name, 'LATE HUMAN');
    assert.equal(hashWorld(final.world), viewHost.getHistory().at(-1).hash);
    final.world.robots[0].x = -100;
    final.world.robots[0].observed[0] = null;
    assert.notEqual(viewHost.getWorld().robots[0].x, -100, 'A presentation callback cannot mutate internal physics');
    assert.notEqual(viewHost.getWorld().robots[0].observed[0], null);
  } finally { viewHost.dispose(); viewGuest.dispose(); viewLate?.dispose(); }
}
