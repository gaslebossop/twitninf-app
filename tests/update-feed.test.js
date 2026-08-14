const { readFileSync } = require('node:fs');
const test = require('node:test');
const assert = require('node:assert/strict');
const ts = require('typescript');
const Module = require('node:module');

function loadTypeScriptModule(path) {
  const source = readFileSync(path, 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const loaded = new Module(path, module);
  loaded.filename = path;
  loaded.paths = module.paths;
  loaded._compile(output, path);
  return loaded.exports;
}

const { findNewerVersion, readPublishedVersion } = loadTypeScriptModule(
  'src/services/updateFeed.ts',
);

/** Manifeste AltStore tel que le gist le contient. */
const manifest = (buildVersion, version = '1.1.0') => ({
  apps: [
    {
      versions: [
        { buildVersion: String(buildVersion), version, date: '2026-08-14T10:00:00Z', size: 42 },
      ],
    },
  ],
});

/** Le meme, enveloppe comme le renvoie l'API GitHub sur un gist. */
const gistApiResponse = (buildVersion) => ({
  files: { 'apps.json': { content: JSON.stringify(manifest(buildVersion)) } },
});

test('une publication plus recente est signalee', () => {
  const found = findNewerVersion(manifest(42), '41');
  assert.equal(found?.buildVersion, 42);
  assert.equal(found?.label, '1.1.0');
});

test('un build a jour ou en avance ne declenche rien', () => {
  assert.equal(findNewerVersion(manifest(42), '42'), null);
  assert.equal(findNewerVersion(manifest(42), '43'), null);
});

test("la reponse de l'API GitHub est lue comme l'apps.json brut", () => {
  // C'est la forme que la CI configure : l'API du gist n'exige pas de connaitre
  // le compte proprietaire, contrairement a l'URL brute.
  assert.equal(findNewerVersion(gistApiResponse(9), '8')?.buildVersion, 9);
  assert.equal(findNewerVersion(gistApiResponse(9), '9'), null);
});

test('un build non estampille ne recoit jamais de proposition', () => {
  // Build local ou Expo Go : proposer de reinstaller son propre build n'aurait
  // aucun sens, et le comparer a une publication non plus.
  for (const installed of [null, undefined, '', 'abc']) {
    assert.equal(findNewerVersion(manifest(99), installed), null);
  }
});

test('un flux illisible ne fait pas planter et ne propose rien', () => {
  for (const payload of [
    null,
    undefined,
    'pas du json',
    {},
    { apps: [] },
    { apps: [{ versions: [] }] },
    { apps: [{ versions: [{ buildVersion: 'x' }] }] },
    { files: { 'apps.json': { content: '{ json casse' } } },
    { files: {} },
  ]) {
    assert.equal(findNewerVersion(payload, '1'), null);
  }
});

test('les champs decoratifs absents ne bloquent pas la detection', () => {
  // Seul buildVersion fait autorite : un libelle ou une date manquants ne
  // doivent pas faire taire une mise a jour reellement disponible.
  const published = readPublishedVersion({ apps: [{ versions: [{ buildVersion: '7' }] }] });
  assert.equal(published?.buildVersion, 7);
  assert.equal(published?.label, null);
  assert.equal(published?.date, null);
});
