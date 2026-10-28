import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readdir, readFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { getImage, localAssetUrl } from '../src/ui/assets.js';

const root = fileURLToPath(new URL('../', import.meta.url));
async function filesIn(directory) {
  const result = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.name.startsWith('.') || ['node_modules', 'artifacts'].includes(entry.name)) continue;
    const filename = path.join(directory, entry.name);
    if (entry.isDirectory()) result.push(...await filesIn(filename));
    else if (!entry.name.startsWith('SPEC-')) result.push(filename);
  }
  return result;
}

export default async function run() {
  const filenames = await filesIn(root);
  assert(filenames.length <= 500, `LOB7 file limit exceeded: ${filenames.length}`);
  assert(!filenames.some(filename => path.basename(filename) === 'package.json'), 'Published tree must have no package.json');

  const codeFiles = filenames.filter(filename => !/[/\\]assets[/\\](?:img|audio)[/\\]/.test(filename));
  let bytes = 0;
  for (const filename of codeFiles) bytes += (await stat(filename)).size;
  assert(bytes < 3 * 1024 * 1024, `Code/fonts must fit within 3 MiB: ${bytes}`);
  let totalBytes = 0;
  for (const filename of filenames) totalBytes += (await stat(filename)).size;
  assert(totalBytes < 25 * 1024 * 1024, `Complete game including optional media must fit within 25 MiB: ${totalBytes}`);

  const required = ['LICENSE', 'ASSETS-LICENSE.md', 'THIRD_PARTY_NOTICES.md', 'ASSETS-BRIEF.md',
    'LOB7-GAME.json', 'LOB7-ATTRIBUTION.json', 'index.html', 'lob7-rooms.js', 'favicon.svg'];
  for (const name of required) assert((await stat(path.join(root, name))).size > 0, `${name} is required`);
  const game = JSON.parse(await readFile(path.join(root, 'LOB7-GAME.json'), 'utf8'));
  assert.equal(game.title, 'Hotfix');
  assert.equal(game.entrypoint, 'index.html');
  assert.equal(game.license, 'MIT');
  const attribution = JSON.parse(await readFile(path.join(root, 'LOB7-ATTRIBUTION.json'), 'utf8'));
  assert.equal(attribution.schemaVersion, 1);
  assert(Array.isArray(attribution.contributions));
  assert(Array.isArray(attribution.basedOnReleaseIds));

  const sdk = JSON.parse(await readFile(path.join(root, 'assets/sdk-provenance.json'), 'utf8'));
  const sdkBytes = await readFile(path.join(root, sdk.path));
  assert.equal(createHash('sha256').update(sdkBytes).digest('hex'), sdk.sha256, 'LOB7 SDK must remain unmodified');
  assert.equal(sdkBytes.length, sdk.bytes);

  const fonts = JSON.parse(await readFile(path.join(root, 'assets/fonts/provenance.json'), 'utf8'));
  for (const file of fonts.files) {
    const data = await readFile(path.join(root, file.path));
    assert.equal(createHash('sha256').update(data).digest('hex'), file.sha256, `Font provenance mismatch: ${file.path}`);
    if (file.path.endsWith('.woff2')) assert.equal(data.subarray(0, 4).toString(), 'wOF2');
  }
  for (const name of ['OFL-barlow.txt', 'OFL-jetbrainsmono.txt']) {
    assert.match(await readFile(path.join(root, 'assets/fonts', name), 'utf8'), /SIL OPEN FONT LICENSE Version 1\.1/i);
  }

  const manifest = JSON.parse(await readFile(path.join(root, 'assets/manifest.json'), 'utf8'));
  assert.equal(manifest.schemaVersion, 1);
  const assetPaths = [
    ...Object.values(manifest.images).map(entry => typeof entry === 'string' ? entry : entry.src),
    ...Object.values(manifest.audio.music).flat(), ...Object.values(manifest.audio.sfx).flat(),
  ];
  for (const assetPath of assetPaths) {
    assert(localAssetUrl(assetPath), `Non-local asset path: ${assetPath}`);
    assert((await stat(path.join(root, 'assets', assetPath))).isFile(), `Manifest must only list received files: ${assetPath}`);
  }
  const audioPaths = [...Object.values(manifest.audio.music).flat(), ...Object.values(manifest.audio.sfx).flat()];
  if (audioPaths.length) {
    const provenance = JSON.parse(await readFile(path.join(root, 'assets/audio/provenance.json'), 'utf8'));
    assert.equal(provenance.schemaVersion, 1);
    const declared = new Set();
    for (const entry of provenance.entries) {
      assert(entry.service && entry.modelObserved && entry.planObserved && entry.generatedOn && entry.prompt && entry.sourcePage);
      assert.match(entry.originalSHA256, /^[0-9a-f]{64}$/);
      assert(entry.rights?.classification && entry.rights.terms?.length, `Missing media terms: ${entry.key}`);
      assert(!Object.keys(entry).some(key => /credits|balance|billing|account/i.test(key)), 'Private account/usage observations belong in ignored .qa');
      const auditPath = path.join(root, 'assets/audio', entry.conversionAudit);
      const audit = JSON.parse(await readFile(auditPath, 'utf8'));
      assert.equal(audit.source.sha256, entry.originalSHA256);
      for (const file of entry.derivedFiles) {
        const assetPath = `audio/${file}`;
        declared.add(assetPath);
        assert(audioPaths.includes(assetPath), `Declared recording missing from manifest: ${assetPath}`);
        const measurement = audit.outputs.find(output => output.file === path.basename(file));
        assert(measurement, `Missing conversion measurement: ${file}`);
        const data = await readFile(path.join(root, 'assets', assetPath));
        assert.equal(createHash('sha256').update(data).digest('hex'), measurement.sha256, `Media SHA mismatch: ${file}`);
        assert.equal(measurement.sampleRate, 44100);
        assert([1, 2].includes(measurement.channels));
        assert(measurement.durationSeconds > 0 && measurement.truePeakDbTP <= -2);
      }
    }
    for (const assetPath of audioPaths) assert(declared.has(assetPath), `Undeclared recording: ${assetPath}`);
  }
  assert.equal(localAssetUrl('https://example.com/asset.png'), null);
  assert.equal(localAssetUrl('../index.html'), null);
  assert.equal(localAssetUrl('/absolute.png'), null);
  assert.equal(localAssetUrl('javascript:alert(1)'), null);
  assert.equal(getImage('missing-image'), null);

  for (const filename of filenames.filter(filename => filename.startsWith(path.join(root, 'src')) && filename.endsWith('.js'))) {
    const source = await readFile(filename, 'utf8');
    assert.doesNotMatch(source, /\bnew\s+(?:Worker|SharedWorker|WebSocket|RTCPeerConnection)\s*\(/, filename);
    assert.doesNotMatch(source, /\bWebAssembly\s*\./, filename);
    assert.doesNotMatch(source, /\bimport\s*\(/, filename);
    assert.doesNotMatch(source, /\bfetch\s*\(\s*['"`]https?:\/\//, filename);
    for (const match of source.matchAll(/(?:import|export)\s[^;]*?\bfrom\s*['"]([^'"]+)['"]/g)) {
      assert(match[1].startsWith('.'), `Only relative modules are allowed: ${filename}: ${match[1]}`);
      assert((await stat(path.resolve(path.dirname(filename), match[1]))).isFile(), `Missing module ${match[1]}`);
    }
  }
  const html = await readFile(path.join(root, 'index.html'), 'utf8');
  assert.doesNotMatch(html, /<(?:script|link)\b[^>]*(?:src|href)\s*=\s*['"]https?:\/\//i);
}
