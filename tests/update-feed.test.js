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

const { findNewerVersion, readPublishedVersion, extractManifest, manifestRawUrl } =
  loadTypeScriptModule('src/services/updateFeed.ts');

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

test("une reponse tronquee par l'API expose l'adresse de repli", () => {
  // Ce n'est PAS un cas theorique : c'est ce que renvoie le gist de production.
  // L'API tronque le contenu des fichiers parce que le gist heberge aussi
  // l'IPA (~27 Mo), donc `content` arrive vide alors qu'apps.json fait 1,3 Ko.
  // Sans le repli sur raw_url, la detection ne marcherait jamais en vrai — et
  // en silence, un flux illisible etant traite comme « rien de neuf ».
  const truncated = {
    files: {
      'apps.json': {
        truncated: true,
        content: '',
        raw_url: 'https://gist.githubusercontent.com/u/id/raw/sha/apps.json',
      },
    },
  };

  assert.equal(extractManifest(truncated), null);
  assert.equal(findNewerVersion(truncated, '1'), null);
  assert.equal(
    manifestRawUrl(truncated),
    'https://gist.githubusercontent.com/u/id/raw/sha/apps.json',
  );

  // Et le contenu recupere a cette adresse se lit comme un apps.json ordinaire.
  assert.equal(findNewerVersion(manifest(6), '5')?.buildVersion, 6);
});

test("pas d'adresse de repli quand il n'y en a pas a suivre", () => {
  assert.equal(manifestRawUrl(null), null);
  assert.equal(manifestRawUrl({}), null);
  assert.equal(manifestRawUrl({ files: {} }), null);
  assert.equal(manifestRawUrl(manifest(3)), null);
});

test('les champs decoratifs absents ne bloquent pas la detection', () => {
  // Seul buildVersion fait autorite : un libelle ou une date manquants ne
  // doivent pas faire taire une mise a jour reellement disponible.
  const published = readPublishedVersion({ apps: [{ versions: [{ buildVersion: '7' }] }] });
  assert.equal(published?.buildVersion, 7);
  assert.equal(published?.label, null);
  assert.equal(published?.date, null);
});
