import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import fr from '../src/i18n/prod-fr.js';
import en from '../src/i18n/prod-en.js';
import baseFr from '../src/i18n/fr.js';
import baseEn from '../src/i18n/en.js';
import { setLanguage, getLanguage } from '../src/ui/i18n.js';
import { createProdUI, prodT } from '../src/ui/prod.js';

function fakeContainer() {
  return {
    innerHTML: '', handlers: new Map(),
    addEventListener(name, handler) { assert.ok(!this.handlers.has(name), `no duplicate ${name} listener`); this.handlers.set(name, handler); },
    removeEventListener(name, handler) { assert.equal(this.handlers.get(name), handler); this.handlers.delete(name); },
    querySelector() { return null; },
    async click(action) {
      const button = { disabled: false, dataset: { prodAction: action } };
      let stopped = false;
      await this.handlers.get('click')({ target: { closest: () => button }, stopPropagation() { stopped = true; } });
      assert.equal(stopped, true, 'Prod controls do not bubble into the Tickets controller');
    },
  };
}

export default async function run() {
  const originalLanguage = getLanguage();
  let ui;
  try {
    assert.deepEqual(Object.keys(fr).sort(), Object.keys(en).sort());
    const parameters = value => [...value.matchAll(/\{(\w+)\}/g)].map(match => match[1]).sort();
    for (const key of Object.keys(fr)) {
      assert.ok(fr[key].trim() && en[key].trim());
      assert.deepEqual(parameters(fr[key]), parameters(en[key]), key);
    }
    const source = await readFile(new URL('../src/ui/prod.js', import.meta.url), 'utf8');
    const references = new Set([...source.matchAll(/\btr\(\s*(['"])([^'"\n]+)\1\s*[,)]/g)].map(match => match[2]));
    for (const match of source.matchAll(/(['"])(prod\.[A-Za-z][A-Za-z0-9.]+)\1/g)) references.add(match[2]);
    for (const level of ['intern', 'ops', 'senior']) { references.add(`prod.level.${level}`); references.add(`prod.levelDesc.${level}`); }
    for (const key of ['north', 'east', 'south', 'west', 'prod.finishClosed', 'prod.finishWin', 'prod.finishLoss', 'prod.finishBadgeWin', 'prod.finishBadgeLoss', 'prod.lastBeacon', 'prod.lastCycle']) references.add(key);
    for (const key of references) {
      assert.ok(Object.hasOwn(fr, key) || Object.hasOwn(baseFr, key), `French UI key ${key}`);
      assert.ok(Object.hasOwn(en, key) || Object.hasOwn(baseEn, key), `English UI key ${key}`);
    }
    const notifications = [];
    const settings = { speed: 1, reduceMotion: true };
    let homeCalls = 0;
    setLanguage('fr');
    const first = fakeContainer();
    ui = createProdUI(first, { settings, onProgress: value => notifications.push(value), onHome() { homeCalls++; } });
    assert.equal(first.handlers.size, 7);
    assert.ok(first.innerHTML.includes(fr['prod.title']));
    assert.ok(first.innerHTML.includes(fr['prod.onlineStatus']));
    assert.ok(!/data-prod-action="(?:connect|online|room)"/.test(first.innerHTML), 'network status never pretends a room is connected');
    await first.click('start');
    assert.equal(ui.getPhase(), 'play');
    assert.equal((first.innerHTML.match(/<code class="[^"]*" title="[^"]*">\?<\/code>/g) ?? []).length, 18, 'all six opponent slots start hidden');
    let prevented = false;
    first.handlers.get('keydown')({ target: { tagName: 'BUTTON' }, key: 'Enter', code: 'Enter', preventDefault() { prevented = true; }, stopPropagation() {} });
    assert.equal(prevented, false, 'focused buttons retain native Enter behavior');
    await first.click('ship');
    assert.equal(ui.isBusy(), false);
    assert.ok(first.innerHTML.includes('prod-observations'), 'completed tick instructions become observations');
    const second = fakeContainer();
    setLanguage('en');
    ui.mount(second);
    assert.equal(first.handlers.size, 0); assert.equal(second.handlers.size, 7);
    assert.equal(ui.getPhase(), 'play', 'remount preserves current match');
    assert.ok(second.innerHTML.includes(en['prod.matchTitle']));
    assert.ok(!second.innerHTML.includes(en['prod.title']), 'remount does not reset to setup');
    ui.mount(second); assert.equal(second.handlers.size, 7, 'repeated mount never doubles event handlers');
    await second.click('speed'); assert.equal(settings.speed, 2);
    await second.click('close'); assert.equal(ui.getPhase(), 'result');
    const results = notifications.filter(item => item.type === 'prod-result');
    assert.equal(results.length, 1); assert.equal(results[0].closedEarly, true); assert.equal(results[0].won, false);
    ui.render(); assert.equal(notifications.filter(item => item.type === 'prod-result').length, 1, 'render never records duplicate result');
    assert.ok(second.innerHTML.includes(en['prod.finishClosed']));
    await second.click('replay-seed');
    for (let cycle = 0; cycle < 12 && ui.getPhase() === 'play'; cycle++) await second.click('ship');
    assert.equal(ui.getPhase(), 'result', 'a complete local match reaches its ranking');
    const fullResult = notifications.filter(item => item.type === 'prod-result').at(-1);
    assert.equal(fullResult.closedEarly, false); assert.equal(fullResult.ranking.length, 4);
    assert.ok(fullResult.cycles >= 1 && fullResult.cycles <= 12);
    assert.ok(second.innerHTML.includes('data-prod-trace="r0"'), 'postmortem provides per-robot trajectory controls');
    await second.click('home'); assert.equal(homeCalls, 1);
    ui.dispose(); assert.equal(second.handlers.size, 0); assert.equal(ui.render(), '');
    assert.throws(() => ui.mount(fakeContainer()), /disposed/);
    for (const language of ['fr', 'en']) { setLanguage(language); assert.equal(prodT('deploy'), language === 'fr' ? baseFr.deploy : baseEn.deploy); assert.equal(prodT('prod.claimsCount', { count: 2, target: 3 }).includes('{'), false); }
    return { prodLocaleKeys: Object.keys(fr).length, referencedKeys: references.size, remounts: 2, hiddenSlots: 18, lifecycle: 'passed' };
  } finally { ui?.dispose(); setLanguage(originalLanguage); }
}
