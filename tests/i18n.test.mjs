import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import fr from '../src/i18n/fr.js';
import en from '../src/i18n/en.js';
import { t, getLanguage, setLanguage, ticketTitle } from '../src/ui/i18n.js';
import { OPS } from '../src/core/opcodes.js';

async function sources(directory) {
  const children = await readdir(directory, { withFileTypes: true });
  return (await Promise.all(children.map(child => child.isDirectory() ? sources(new URL(`${child.name}/`, directory)) : child.name.endsWith('.js') ? readFile(new URL(child.name, directory), 'utf8') : []))).flat();
}

export default async function run() {
  const previous = getLanguage();
  try {
    assert.deepEqual(Object.keys(fr).sort(), Object.keys(en).sort(), 'FR and EN have exactly the same keys');
    const placeholders = text => [...text.matchAll(/\{(\w+)\}/g)].map(match => match[1]).sort();
    for (const key of Object.keys(fr)) {
      assert.equal(typeof fr[key], 'string'); assert.equal(typeof en[key], 'string');
      assert.ok(fr[key].trim()); assert.ok(en[key].trim());
      assert.deepEqual(placeholders(fr[key]), placeholders(en[key]), `same interpolation parameters for ${key}`);
    }
    const keys = new Set();
    for (const code of await sources(new URL('../src/', import.meta.url))) {
      for (const match of code.matchAll(/\bt\(\s*(['"])([^'"\n]+)\1\s*[,)]/g)) keys.add(match[2]);
    }
    // Dynamic families are explicit: adding a tier/op/mode without its labels
    // must fail instead of silently displaying a translation key.
    for (const key of [...[1, 2, 3, 4].map(tier => `tier${tier}`), ...OPS.map(op => `op${op}`), 'backlog', 'sprint', 'daily', 'resolved', 'escalated', 'requirementDone', 'requirement', 'resultWin', 'resultLoss', 'resultWinSub', 'resultLossSub', 'dailyResult', 'sprintResult', 'north', 'east', 'south', 'west']) keys.add(key);
    for (const key of keys) assert.ok(Object.hasOwn(fr, key) && Object.hasOwn(en, key), `translated source key: ${key}`);
    for (const language of ['fr', 'en']) {
      setLanguage(language);
      const dictionary = language === 'fr' ? fr : en;
      for (const key of keys) assert.equal(t(key), dictionary[key], `${language}: ${key} resolves in its own dictionary`);
      assert.equal(t('series', { n: 2, total: 8 }).includes('{'), false);
      for (const titleKey of ['fall', 'wall', 'loop', 'miss', 'onboarding', 'ticket.beacon']) {
        const title = ticketTitle({ titleKey, titleParams: { tick: 3 } });
        assert.ok(title.length > 5); assert.equal(title.includes('{'), false); assert.notEqual(title, titleKey);
      }
    }
    return { localeKeys: Object.keys(fr).length, referencedKeys: keys.size, languages: 2 };
  } finally { setLanguage(previous); }
}
