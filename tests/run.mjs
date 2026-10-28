import { readdir } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';

// No package manifest or test framework is needed. Each test module owns a
// focused assertion suite and may export an async default function.
const directory = new URL('./', import.meta.url);
const files = (await readdir(directory)).filter(name => name.endsWith('.test.mjs')).sort();
const started = performance.now();
let failed = 0;
for (const filename of files) {
  const before = performance.now();
  try {
    const suite = await import(new URL(filename, directory));
    if (typeof suite.default !== 'function') throw new TypeError(`${filename} must export its assertion suite`);
    await suite.default();
    console.log(`PASS ${filename} (${Math.round(performance.now() - before)} ms)`);
  } catch (error) {
    failed++;
    console.error(`FAIL ${filename}`);
    console.error(error?.stack || error);
  }
}
console.log(`${files.length - failed}/${files.length} suites passed in ${((performance.now() - started) / 1000).toFixed(2)} s`);
if (failed) process.exitCode = 1;
