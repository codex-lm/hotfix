import { setupProd, rankRobots, BOT_LEVELS } from '../prod/setup.js';
import { createLocalGame } from '../net/local.js';
import { preview, summarizeTrace } from '../core/trace.js';
import { KEY_TO_OP } from '../core/opcodes.js';
import { drawArena, getRobotPose } from './arena.js';
import { programHTML } from './program.js';
import { logHTML, logText } from './log.js';
import { escapeHTML as e, icon } from './dom.js';
import { t as baseT, getLanguage } from './i18n.js';
import fr from '../i18n/prod-fr.js';
import en from '../i18n/prod-en.js';

export const prodDictionaries = { fr, en };
export function prodT(key, params = {}) {
  const text = prodDictionaries[getLanguage()][key];
  return text === undefined ? baseT(key, params) : text.replace(/\{(\w+)\}/g, (_, name) => String(params[name] ?? `{${name}}`));
}
const tr = prodT;
const shortOp = op => ({ FWD: 'F', BACK: 'B', LEFT: 'L', RIGHT: 'R', WAIT: 'W', JUMP: 'J', PUSH: 'P' }[op] ?? '?');
const todaySeed = () => `daily-${new Date().toISOString().slice(0, 10)}`;

export function createProdUI(initialContainer, options = {}) {
  const settings = options.settings ?? { speed: 1, reduceMotion: false };
  let container = null, disposed = false, game = null, phase = 'configure', world = null, displayWorld = null;
  let busy = false, selected = 0, pending = null, hoverPatch = null, activeTick = -1, lastSlot = -1;
  let config = { seed: todaySeed(), bots: 3, level: 'ops' };
  let observed = {}, currentOps = {}, log = [], observationLog = [], frames = [], lastCycle = [], lastClaimTraces = {};
  let pushes = [], firstClaims = {}, startedAt = 0, finishedAt = 0, announced = '', notice = '', reported = false, closedEarly = false;
  let selectedTrace = 'r0', previewKey = '', baseForecast = null, patchedForecast = null;
  let animationId = null, animationResolve = null, resizeObserver = null, demoWorld = null, demoKey = '';

  const player = () => (displayWorld ?? world)?.robots.find(robot => robot.id === 'r0');
  const label = robotId => robotId === 'r0' ? tr('prod.you') : tr('prod.robot', { n: Math.max(0, world?.robots.findIndex(robot => robot.id === robotId) ?? Number(robotId.slice(1))) + 1 });
  const reduced = () => settings.reduceMotion === true || globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const speed = () => [1, 2, 4].includes(settings.speed) ? settings.speed : 1;
  const playSound = type => options.audio?.play?.(type);
  const unlock = () => options.audio?.unlock?.();
  const priority = state => {
    const index = state.robots.findIndex(robot => robot.id === 'r0');
    const position = (index - state.cycle % state.robots.length + state.robots.length) % state.robots.length + 1;
    return position === 1 ? tr('prod.priorityFirst') : tr('prod.priority', { position });
  };
  function notify(payload) {
    try { options.onProgress?.(payload); } catch { /* A storage callback cannot interrupt a resolved cycle. */ }
  }
  function arenaDescription(state) {
    const robot = state.robots.find(item => item.id === 'r0');
    return tr('prod.arenaDescription', { w: state.w, h: state.h, x: robot.x + 1, y: robot.y + 1,
      dir: tr(['north', 'east', 'south', 'west'][robot.dir]), robots: state.robots.length, beacons: state.beacons.length, crates: state.crates.length });
  }
  function demo() {
    const key = `${config.seed}|${config.bots}|${config.level}`;
    if (key !== demoKey) { demoKey = key; demoWorld = setupProd(config.seed || todaySeed(), { count: config.bots + 1, level: config.level }); }
    return demoWorld;
  }
  function configureHTML() {
    return `<main class="prod-page prod-configure"><div class="prod-mode-line"><button data-prod-action="home">${icon('back', 15)}${tr('prod.back')}</button><span class="prod-local-badge"><i></i>${tr('prod.local')}</span></div>
      <section class="prod-intro"><div><p class="eyebrow">${tr('prod.eyebrow')}</p><h1>${tr('prod.title')}</h1><p class="prod-intro-copy">${tr('prod.intro')}</p><div class="prod-facts"><div><strong>3</strong><span>${tr('prod.three')}</span></div><div><strong>12</strong><span>${tr('prod.twelve')}</span></div><div><strong>1</strong><span>${tr('prod.one')}</span></div></div></div><div class="prod-demo"><div class="prod-demo-caption"><span>${icon('grid', 16)}${tr('prod.previewWarehouse')}</span><code>12 × 9</code></div><canvas data-prod-canvas="demo" role="img" aria-label="${e(arenaDescription(demo()))}"></canvas><p>${tr('prod.previewWarehouseDetail')}</p></div></section>
      <form class="prod-configuration" data-prod-form><div class="prod-config-heading"><span class="section-number">02</span><div><h2>${tr('prod.configure')}</h2><p>${tr('prod.localDetail')}</p></div></div><div class="prod-config-fields"><div class="prod-seed-control"><label for="prod-seed">${tr('prod.seedLabel')}</label><div><input id="prod-seed" name="seed" value="${e(config.seed)}" placeholder="${e(tr('prod.seedPlaceholder'))}" maxlength="120" autocomplete="off" required><button type="button" class="prod-seed-daily" data-prod-action="daily">${icon('calendar', 16)}${tr('prod.dailySeed')}</button></div></div><div class="prod-count-control"><label for="prod-bots">${tr('prod.botCount')}</label><select id="prod-bots" name="bots">${[3, 4, 5, 6, 7].map(count => `<option value="${count}" ${config.bots === count ? 'selected' : ''}>${tr('prod.botCountOption', { count, total: count + 1 })}</option>`).join('')}</select></div><fieldset class="prod-levels"><legend>${tr('prod.levelLabel')}</legend><div>${BOT_LEVELS.map(level => `<label class="prod-level ${config.level === level ? 'chosen' : ''}"><input type="radio" name="level" value="${level}" ${config.level === level ? 'checked' : ''}><span>${tr(`prod.level.${level}`)}</span><small>${tr(`prod.levelDesc.${level}`)}</small></label>`).join('')}</div></fieldset><button class="button primary prod-start" type="submit">${tr('prod.start')}${icon('arrow', 22)}</button></div></form>
      <aside class="prod-online-notice"><span class="prod-online-icon">${icon('info', 21)}</span><div><h2>${tr('prod.onlineTitle')}</h2><p>${tr('prod.onlineDetail')}</p></div><span>${tr('prod.onlineStatus')}</span></aside>${noticeHTML()}</main>`;
  }
  function noticeHTML() { return `<p class="prod-notice ${notice ? 'visible' : ''}" role="status" aria-live="polite">${e(notice ? tr(notice) : '')}</p>`; }
  function claimsHTML(robot, target = 3) {
    return `<span class="prod-claims" role="img" aria-label="${e(tr('prod.claimsCount', { count: robot.claims, target }))}">${Array.from({ length: target }, (_, index) => `<i class="${index < robot.claims ? 'claimed' : ''}"></i>`).join('')}</span>`;
  }
  function scoreStrip(state) {
    return `<div class="prod-score-strip" aria-label="${tr('prod.ranking')}">${state.robots.map(robot => `<div class="prod-score-card ${robot.id === 'r0' ? 'is-you' : ''}" style="--robot-color:${e(robot.color || '#F2652B')}"><span class="prod-score-name"><i class="prod-robot-mark">${state.robots.indexOf(robot) + 1}</i>${label(robot.id)}${robot.id === 'r0' ? `<small>${tr('prod.local')}</small>` : ''}</span><div>${claimsHTML(robot)}<span class="prod-current-op ${currentOps[robot.id] ? 'is-observed' : ''}" aria-label="${e(currentOps[robot.id] ? tr('prod.currentInstruction', { name: label(robot.id), op: currentOps[robot.id] }) : tr('prod.hiddenInstruction'))}">${e(currentOps[robot.id] || '—')}</span></div></div>`).join('')}</div>`;
  }
  function orderHTML(state) {
    const count = state.robots.length;
    const order = Array.from({ length: count }, (_, index) => state.robots[(state.cycle + index) % count]);
    return `<div class="prod-priority"><span>${tr('prod.priorityLabel')}</span><ol>${order.map(robot => `<li class="${robot.id === 'r0' ? 'is-you' : ''}" title="${e(label(robot.id))}"><i style="background:${e(robot.color || '#F2652B')}"></i>${robot.id === 'r0' ? tr('prod.you') : state.robots.indexOf(robot) + 1}</li>`).join('')}</ol></div>`;
  }
  function trafficHTML() {
    return `<section class="prod-traffic"><div><p class="eyebrow">${tr('prod.traffic')}</p><h2>${tr('prod.instructionsHidden')}</h2><p>${tr('prod.trafficDetail')}</p></div><div class="prod-observations">${world.robots.filter(robot => robot.id !== 'r0').map(robot => {
      const seen = observed[robot.id] ?? Array(6).fill(null);
      const program = seen.map(shortOp).join(' ');
      return `<div class="prod-observation" aria-label="${e(tr('prod.observedProgram', { name: label(robot.id), program }))}"><span><i style="background:${e(robot.color || '#3B8EA5')}"></i>${label(robot.id)}<small>${tr(`prod.level.${robot.bot || config.level}`)}</small></span><div class="prod-seen-program">${seen.map((op, index) => `<code class="${op ? 'known' : ''} ${activeTick === index ? 'active' : ''}" title="${op || tr('prod.unknownProgram')}">${shortOp(op)}</code>`).join('')}</div></div>`;
    }).join('')}</div></section>`;
  }
  function playHTML() {
    const state = displayWorld ?? world, robot = state.robots.find(item => item.id === 'r0');
    return `<main class="prod-page prod-match"><div class="prod-mode-line"><button data-prod-action="home" ${busy ? 'disabled' : ''}>${icon('back', 15)}${tr('prod.back')}</button><span class="prod-local-badge"><i></i>${tr('prod.match', { count: state.robots.length })}</span><code>${e(config.seed)}</code></div>
      <section class="prod-match-heading"><div><p class="eyebrow">${tr('prod.eyebrow')}</p><h1>${tr('prod.matchTitle')}</h1><p>${tr('prod.matchSubtitle')}</p></div><div class="prod-cycle-metric"><span>${tr('cycle')}</span><strong>${Math.min(state.cycle + 1, state.maxCycles)}<small> / ${state.maxCycles}</small></strong><span class="prod-priority-label">${priority(state)}</span></div></section>${scoreStrip(state)}
      <div class="game-layout prod-game-layout"><section class="arena-panel"><div class="panel-topline"><div><span class="eyebrow">${tr('board')}</span><h2>${tr('warehouse')}</h2></div><span class="arena-dimensions">12 × 9</span></div><div class="arena-frame"><canvas data-prod-canvas="game" tabindex="0" aria-label="${e(arenaDescription(state))}" role="img"></canvas></div>${orderHTML(state)}<div class="arena-footer"><div class="trace-legend"><span><i></i>${tr('currentPath')}</span><span><i class="orange"></i>${tr('patchedPath')}</span></div><button class="speed-button" data-prod-action="speed" aria-label="${tr('speed')}">×${speed()}</button></div><div class="forecast-note"><span class="status-square"></span>${busy ? tr('prod.runningTick', { cycle: state.cycle + 1, tick: activeTick + 1 }) : tr('prod.ready')}<span class="forecast-ticks">${busy ? `${activeTick + 1} / 6` : '01—06'}</span></div></section><div data-prod-program>${programHTML(world.robots.find(item => item.id === 'r0'), { selected, pending, tick: activeTick, busy, lastSlot })}</div></div>
      <div class="prod-forecast-warning">${icon('info', 17)}<p>${tr('prod.forecast')}<small>${tr('prod.forecastDetail')}</small></p></div><div class="below-board"><p>${tr('keyboard')}<br>${tr('prod.noClock')}</p><button data-prod-action="close" ${busy ? 'disabled' : ''}>${tr('prod.abandon')}</button></div>${trafficHTML()}${logHTML(log)}<p class="sr-only" aria-live="polite">${e(announced ? tr('prod.cycleAnnouncement', { ...announced, priority: priority(world) }) : '')}</p>${noticeHTML()}</main>`;
  }
  function pushCount(robotId, received) { return pushes.filter(event => received ? event.robotId === robotId : event.by === robotId).length; }
  function endHTML() {
    const ranking = rankRobots(world), winner = ranking[0], won = winner.id === 'r0' && !closedEarly, robot = world.robots.find(item => item.id === 'r0');
    return `<main class="prod-page prod-postmortem"><div class="prod-mode-line"><button data-prod-action="home">${icon('back', 15)}${tr('prod.back')}</button><span class="prod-local-badge"><i></i>${tr('prod.eyebrow')}</span></div><section class="result-sheet"><div class="result-topline"><span class="eyebrow">${tr('prod.match', { count: world.robots.length })}</span><span class="result-stamp ${won ? 'success' : 'failure'}">${tr(won ? 'prod.finishBadgeWin' : 'prod.finishBadgeLoss')}</span></div><div class="result-heading"><div><p class="eyebrow">${tr('prod.ranking')}</p><h1>${tr(closedEarly ? 'prod.finishClosed' : won ? 'prod.finishWin' : 'prod.finishLoss')}</h1><p>${closedEarly ? tr('prod.closed') : tr('prod.finishDetail', { name: label(winner.id), cycles: world.cycle })}</p></div><div class="prod-final-score"><strong>${robot.claims}<small> / 3</small></strong><span>${tr('prod.beacons')}</span></div></div><div class="result-stats"><div><span>${tr('cycle')}</span><strong>${world.cycle}<small> / 12</small></strong></div><div><span>${tr('falls')}</span><strong>${robot.falls}</strong></div><div><span>${tr('prod.pushesGiven')}</span><strong>${pushCount('r0', false)}</strong></div><div><span>${tr('prod.pushesReceived')}</span><strong>${pushCount('r0', true)}</strong></div></div><div class="result-actions"><button class="button primary" data-prod-action="replay-seed">${tr('prod.replaySeed')}${icon('loop', 19)}</button><button class="button outline" data-prod-action="configure">${tr('prod.configureAgain')}</button><button class="text-button" data-prod-action="copy-journal">${icon('copy', 17)}${tr('prod.copyJournal')}</button></div></section>
      <section class="prod-postmortem-grid"><div class="prod-ranking"><div class="prod-panel-caption"><p class="eyebrow">${tr('prod.ranking')}</p><p>${tr('prod.rankingRule')}</p></div><div class="prod-rank-head"><span>${tr('prod.rank')}</span><span>${tr('prod.robotHeading')}</span><span>${tr('prod.beacons')}</span><span>${tr('falls')}</span></div>${ranking.map(row => `<div class="prod-rank-row ${row.id === 'r0' ? 'is-you' : ''}"><strong>${String(row.rank).padStart(2, '0')}</strong><div><span><i style="background:${e(row.color || '#F2652B')}"></i>${label(row.id)}</span><small>${firstClaims[row.id] ? tr('prod.firstClaim', firstClaims[row.id]) : tr('prod.noClaim')}</small></div><b>${row.claims}</b><b>${row.falls}</b></div>`).join('')}</div><section class="arena-panel prod-final-path"><div class="panel-topline"><div><span class="eyebrow">${label(selectedTrace)}</span><h2>${tr(lastClaimTraces[selectedTrace] ? 'prod.lastBeacon' : 'prod.lastCycle')}</h2></div></div><div class="prod-path-tabs">${world.robots.map((item, index) => `<button data-prod-trace="${e(item.id)}" class="${selectedTrace === item.id ? 'selected' : ''}" aria-label="${e(tr('prod.showPath', { name: label(item.id) }))}" aria-pressed="${selectedTrace === item.id}" style="--robot-color:${e(item.color || '#F2652B')}">${item.id === 'r0' ? tr('prod.you') : index + 1}</button>`).join('')}</div><div class="arena-frame"><canvas data-prod-canvas="result" role="img" aria-label="${e(tr('prod.showPath', { name: label(selectedTrace) }))}"></canvas></div><p class="prod-path-seed">${tr('seed')} <code>${e(config.seed)}</code><span>${Math.round((finishedAt - startedAt) / 1000)} s</span></p></section></section>${logHTML(log)}${trafficHTML()}${noticeHTML()}</main>`;
  }
  function forecasts() {
    const key = `${world.cycle}|${JSON.stringify(hoverPatch || pending)}`;
    if (key === previewKey) return;
    previewKey = key;
    try { baseForecast = preview(world, 'r0'); patchedForecast = hoverPatch || pending ? preview(world, 'r0', hoverPatch || pending) : null; }
    catch { baseForecast = patchedForecast = null; notice = 'prod.forecastUnavailable'; }
  }
  function draw(options = {}) {
    if (!container || disposed) return;
    if (phase === 'configure') { drawBoard(container.querySelector('[data-prod-canvas="demo"]'), demo(), { compact: true }); return; }
    if (phase === 'result') {
      const path = lastClaimTraces[selectedTrace] || lastCycle;
      const state = path.at(-1)?.world || world;
      drawBoard(container.querySelector('[data-prod-canvas="result"]'), state, { patchTrace: path, robotId: selectedTrace });
      return;
    }
    const canvas = container.querySelector('[data-prod-canvas="game"]');
    if (!canvas) return;
    if (!busy) forecasts();
    const state = displayWorld ?? world;
    drawBoard(canvas, state, busy ? options : { baseTrace: baseForecast?.trace, patchTrace: patchedForecast?.trace, robotId: 'r0' });
  }
  function drawBoard(canvas, state, drawOptions = {}) {
    if (!canvas) return;
    const presentation = busy ? { ...drawOptions, opByRobot: currentOps } : drawOptions;
    drawArena(canvas, state, presentation);
    {
      const box = canvas.getBoundingClientRect(); const width = box.width || 720; const height = box.height || 540;
      const margin = drawOptions.compact ? 12 : 27;
      const cell = Math.min((width - 2 * margin) / state.w, (height - 2 * margin) / state.h);
      const ox = (width - state.w * cell) / 2, oy = (height - state.h * cell) / 2;
      const ctx = canvas.getContext('2d');
      for (let robotIndex = 0; robotIndex < state.robots.length; robotIndex++) {
        const item = state.robots[robotIndex];
        const pose = getRobotPose(item, presentation);
        if (pose.alpha <= 0 || pose.scale <= 0) continue;
        // Badges follow the arena's exact presentation pose, including jump
        // height, a fall into a hole and the separate respawn position.
        const bx = ox + (pose.x + .5) * cell + cell * .3 * pose.scale;
        const by = oy + (pose.y + .5) * cell - pose.lift * cell + cell * .28 * pose.scale;
        ctx.save(); ctx.globalAlpha *= pose.alpha; ctx.fillStyle = '#F7F6F2'; ctx.strokeStyle = '#23272E'; ctx.lineWidth = Math.max(.25, pose.scale);
        ctx.beginPath(); ctx.arc(bx, by, Math.max(4, cell * .105) * pose.scale, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#23272E'; ctx.font = `700 ${Math.max(6, cell * .13) * pose.scale}px "JetBrains Mono",monospace`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(String(robotIndex + 1), bx, by + .2); ctx.restore();
      }
    }
  }
  function render() {
    if (!container || disposed) return '';
    const html = phase === 'configure' ? configureHTML() : phase === 'result' ? endHTML() : playHTML();
    container.innerHTML = html;
    draw();
    return html;
  }
  function refreshProgram() {
    const target = container?.querySelector('[data-prod-program]');
    if (target) target.innerHTML = programHTML(world.robots.find(item => item.id === 'r0'), { selected, pending, tick: activeTick, busy, lastSlot });
    previewKey = ''; draw();
    container?.querySelector('[data-prod-canvas="game"]')?.focus({ preventScroll: true });
  }
  function readConfiguration() {
    const form = container?.querySelector('[data-prod-form]');
    if (!form) return;
    config.seed = form.querySelector('[name="seed"]')?.value.trim() ?? config.seed;
    config.bots = Number(form.querySelector('[name="bots"]')?.value ?? config.bots);
    config.level = form.querySelector('[name="level"]:checked')?.value ?? config.level;
  }
  function start() {
    if (busy || disposed) return;
    readConfiguration();
    if (!config.seed.trim()) { notice = 'prod.seedRequired'; render(); return; }
    game?.dispose();
    world = setupProd(config.seed, { count: config.bots + 1, level: config.level });
    game = createLocalGame(world);
    phase = 'play'; busy = false; selected = 0; pending = hoverPatch = null; activeTick = -1; lastSlot = -1;
    observed = Object.fromEntries(world.robots.map(robot => [robot.id, Array(6).fill(null)]));
    log = []; observationLog = []; frames = []; pushes = []; firstClaims = {}; lastClaimTraces = {}; lastCycle = [];
    currentOps = {}; displayWorld = null; previewKey = ''; notice = ''; announced = ''; reported = false; closedEarly = false; selectedTrace = 'r0';
    startedAt = Date.now(); finishedAt = 0;
    unlock(); playSound('gameplay'); render(); globalThis.scrollTo?.({top:0,behavior:'auto'}); container?.querySelector('[data-prod-canvas="game"]')?.focus({ preventScroll: true });
  }
  function animate(duration, painter) {
    if (disposed || duration <= 0 || typeof requestAnimationFrame !== 'function') { painter(1); return Promise.resolve(); }
    return new Promise(resolve => {
      let startTime = null; animationResolve = resolve;
      const frame = now => {
        if (disposed) { animationId = null; animationResolve = null; resolve(); return; }
        startTime ??= now;
        const progress = Math.min(1, (now - startTime) / duration); painter(progress);
        if (progress < 1) animationId = requestAnimationFrame(frame);
        else { animationId = null; animationResolve = null; resolve(); }
      };
      animationId = requestAnimationFrame(frame);
    });
  }
  function finish(early = false) {
    closedEarly = early; phase = 'result'; busy = false; displayWorld = null; currentOps = {}; activeTick = -1; finishedAt = Date.now();
    const ranking = rankRobots(world), won = ranking[0].id === 'r0' && !early;
    playSound(won ? 'victory' : 'failure');
    if (!reported) { reported = true; notify({ type: 'prod-result', seed: config.seed, level: config.level, won, cycles: world.cycle, ranking, closedEarly: early }); }
    render();
    globalThis.scrollTo?.({top:0,behavior:'auto'});
  }
  async function deploy(ship = false) {
    if (phase !== 'play' || busy || disposed) return;
    unlock(); playSound('deploy'); busy = true; notice = ''; hoverPatch = null;
    const patch = ship ? null : pending ? { ...pending } : null;
    const before = world;
    displayWorld = before; currentOps = {}; activeTick = -1; render();
    // Give the browser a paint before evaluating the bots on the main thread.
    if (!reduced() && typeof requestAnimationFrame === 'function') await new Promise(resolve => requestAnimationFrame(resolve));
    if (disposed) return;
    let result;
    try { result = game.send({ patch }); }
    catch { busy = false; displayWorld = null; notice = 'prod.error'; render(); return; }
    world = result.world; lastCycle = result.trace; frames.push(...result.trace);
    if (patch) log.push({ kind: 'patch', version: world.robots[0].version, slot: patch.slot, from: before.robots[0].program[patch.slot], to: patch.op });
    lastSlot = patch?.slot ?? -1; pending = null;
    for (let index = 0; index < result.trace.length; index++) {
      if (disposed) return;
      const frame = result.trace[index];
      activeTick = frame.tick; displayWorld = frame.world; currentOps = {};
      for (const event of frame.events) {
        if (event.type === 'instruction') { currentOps[event.robotId] = event.op; observed[event.robotId][event.slot] = event.op; }
        if (event.type === 'pushed' && event.kind === 'robot') pushes.push({ ...event });
        if (event.type === 'claimed') {
          lastClaimTraces[event.robotId] = result.trace.slice(0, index + 1);
          if (!firstClaims[event.robotId]) firstClaims[event.robotId] = { cycle: before.cycle + 1, falls: frame.world.robots.find(item => item.id === event.robotId).falls };
        }
        playSound(event.type);
      }
      render();
      if (!reduced()) {
        draw({ from: frame.before, progress: 0, events: frame.events });
        await animate(450 / speed(), progress => draw({ from: frame.before, progress, events: frame.events }));
      }
    }
    if (disposed) return;
    displayWorld = null; currentOps = {}; activeTick = -1; busy = false; previewKey = '';
    log.push({ kind: 'cycle', n: world.cycle, ...summarizeTrace(result.trace, 'r0') });
    for (const robot of world.robots) {
      robot.observed = [...observed[robot.id]];
      observationLog.push({ cycle: world.cycle, robotId: robot.id, program: [...observed[robot.id]] });
    }
    const own = player();
    announced = { n: world.cycle, claims: own.claims, falls: own.falls };
    playSound('cycleEnd');
    if (world.status !== 'playing') finish();
    else { render(); container?.querySelector('[data-prod-canvas="game"]')?.focus({ preventScroll: true }); }
  }
  function choose(op) {
    if (phase !== 'play' || busy) return;
    pending = world.robots[0].program[selected] === op ? null : { slot: selected, op };
    hoverPatch = null; unlock(); playSound('patch'); refreshProgram();
  }
  function journal() {
    const lines = [tr('prod.journalTitle'), `${tr('seed')}: ${config.seed}`, `${tr('prod.levelLabel')}: ${tr(`prod.level.${config.level}`)}`, logText(log)];
    for (const observation of observationLog) lines.push(tr('prod.journalObservation', { cycle: observation.cycle, name: label(observation.robotId), program: observation.program.map(shortOp).join(' ') }));
    const groups = new Map();
    for (const event of pushes) { const key = `${event.by}|${event.robotId}`; groups.set(key, (groups.get(key) || 0) + 1); }
    for (const [key, count] of groups) { const [from, to] = key.split('|'); lines.push(tr('prod.journalPush', { from: label(from), to: label(to), count })); }
    return lines.join('\n');
  }
  async function copyJournal() {
    try { await navigator.clipboard.writeText(journal()); notice = 'prod.copied'; }
    catch { notice = 'prod.copyUnavailable'; }
    render();
  }
  function action(name) {
    if (name === 'home') { if (!busy) options.onHome?.(); return; }
    if (name === 'daily') { readConfiguration(); config.seed = todaySeed(); render(); return; }
    if (name === 'start' || name === 'replay-seed') return start();
    if (name === 'deploy') return deploy();
    if (name === 'ship') return deploy(true);
    if (name === 'cancel') { pending = hoverPatch = null; refreshProgram(); return; }
    if (name === 'close' && !busy) return finish(true);
    if (name === 'configure' && !busy) { phase = 'configure'; notice = ''; render(); globalThis.scrollTo?.({top:0,behavior:'auto'}); return; }
    if (name === 'copy-journal') return copyJournal();
    if (name === 'settings') return options.onSettings?.();
    if (name === 'speed') { settings.speed = speed() === 4 ? 1 : speed() * 2; notify({ type: 'settings', settings: { ...settings } }); render(); }
  }
  function click(event) {
    const button = event.target.closest('button');
    if (!button || button.disabled) return;
    event.stopPropagation();
    if (button.dataset.prodTrace) { selectedTrace = button.dataset.prodTrace; render(); return; }
    const name = button.dataset.prodAction ?? button.dataset.action;
    if (name) return action(name);
    if (phase === 'play' && !busy && button.dataset.slot !== undefined) { selected = Number(button.dataset.slot); hoverPatch = null; refreshProgram(); container?.querySelector(`[data-slot="${selected}"]`)?.focus({ preventScroll: true }); }
    if (button.dataset.op) choose(button.dataset.op);
  }
  function submit(event) {
    if (!event.target.matches('[data-prod-form]')) return;
    event.preventDefault(); event.stopPropagation(); return start();
  }
  function change(event) {
    if (phase !== 'configure' || !['bots', 'level'].includes(event.target.name)) return;
    readConfiguration(); render();
    container?.querySelector(event.target.name === 'bots' ? '[name="bots"]' : `[name="level"][value="${config.level}"]`)?.focus({ preventScroll: true });
  }
  function input(event) { if (phase === 'configure' && event.target.name === 'seed') { config.seed = event.target.value; demoKey = ''; draw(); container?.querySelector('[data-prod-canvas="demo"]')?.setAttribute('aria-label', arenaDescription(demo())); } }
  function over(event) {
    const button = event.target.closest('[data-op]');
    if (!button || button.disabled || phase !== 'play' || busy) return;
    hoverPatch = { slot: selected, op: button.dataset.op }; previewKey = ''; draw();
  }
  function out(event) {
    const button = event.target.closest('[data-op]');
    if (button && !button.contains(event.relatedTarget) && hoverPatch) { hoverPatch = null; previewKey = ''; draw(); }
  }
  function keydown(event) {
    if (phase !== 'play' || busy || event.ctrlKey || event.metaKey || event.altKey || /INPUT|TEXTAREA|SELECT/.test(event.target.tagName) || globalThis.document?.querySelector('dialog[open]')) return;
    // Buttons keep their native Enter/Space behavior, including Ship as is.
    if (event.target.tagName === 'BUTTON' && (event.key === 'Enter' || event.code === 'Space')) return;
    let handled = true;
    if (/^[1-6]$/.test(event.key)) { selected = Number(event.key) - 1; hoverPatch = null; refreshProgram(); }
    else if (KEY_TO_OP[event.key.toLowerCase()]) choose(KEY_TO_OP[event.key.toLowerCase()]);
    else if (event.key === 'Enter' || event.code === 'Space') { if (!event.repeat) void deploy(); }
    else if (event.key === 'Escape') { pending = hoverPatch = null; refreshProgram(); }
    else if (['ArrowLeft', 'ArrowUp', 'ArrowRight', 'ArrowDown'].includes(event.key)) { selected = (selected + (['ArrowRight', 'ArrowDown'].includes(event.key) ? 1 : 5)) % 6; hoverPatch = null; refreshProgram(); container?.querySelector(`[data-slot="${selected}"]`)?.focus({ preventScroll: true }); }
    else if (['+', '=', '-'].includes(event.key)) { settings.speed = event.key === '-' ? Math.max(1, speed() / 2) : Math.min(4, speed() * 2); notify({ type: 'settings', settings: { ...settings } }); render(); }
    else handled = false;
    if (handled) { event.preventDefault(); event.stopPropagation(); }
  }
  const handlers = { click, submit, change, input, pointerover: over, pointerout: out, keydown };
  function mount(nextContainer) {
    if (disposed) throw new Error('Prod UI is disposed');
    if (container) for (const [name, handler] of Object.entries(handlers)) container.removeEventListener(name, handler);
    resizeObserver?.disconnect();
    container = nextContainer;
    if (!container) throw new TypeError('A Prod container is required');
    for (const [name, handler] of Object.entries(handlers)) container.addEventListener(name, handler);
    if (typeof ResizeObserver !== 'undefined') { resizeObserver ??= new ResizeObserver(() => draw()); resizeObserver.observe(container); }
    render();
    if (phase === 'play' && !busy) container.querySelector('[data-prod-canvas="game"]')?.focus({ preventScroll: true });
    return api;
  }
  function dispose() {
    if (disposed) return;
    disposed = true; game?.dispose(); resizeObserver?.disconnect();
    if (container) for (const [name, handler] of Object.entries(handlers)) container.removeEventListener(name, handler);
    if (animationId !== null && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(animationId);
    animationResolve?.(); animationResolve = null; animationId = null; container = null;
  }
  const api = { mount, render, dispose, isBusy: () => busy, getPhase: () => phase };
  mount(initialContainer);
  return api;
}
