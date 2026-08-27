const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const Module = require('node:module');
const ts = require('typescript');

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

// `navbarPreferences` importe AsyncStorage et les drapeaux ; on ne charge que
// les fonctions pures, en neutralisant les deux dépendances natives.
// Le chemin est résolu AVANT de poser le patch : appeler `require.resolve`
// depuis l'intérieur du patch le fait se rappeler lui-même sans fin.
const STORAGE_STUB = require.resolve('./stubs/async-storage.js');
const FLAGS_STUB = require.resolve('./stubs/feature-flag-keys.js');
const originalResolve = Module._resolveFilename;
Module._resolveFilename = function patched(request, ...rest) {
  if (request.includes('async-storage')) return STORAGE_STUB;
  if (request.endsWith('config/featureFlagKeys')) return FLAGS_STUB;
  return originalResolve.call(this, request, ...rest);
};

const { FEED_2B_SLOTS, isValidFor2B, normalizeFor2B } = loadTypeScriptModule(
  'src/services/navbarPreferences.ts',
);

Module._resolveFilename = originalResolve;

// ── La règle ─────────────────────────────────────────────────────────────────
//
// La barre du fil 2B a DEUX emplacements libres, ou aucun. Un seul déséquilibre
// la rangée : le bouton « Publier » occupe une colonne au milieu, et le socle
// en compte quatre — il faut donc un nombre PAIR de raccourcis.

test('la barre 2B a deux emplacements', () => {
  assert.equal(FEED_2B_SLOTS, 2);
});

test('zéro et deux sont les seules formes valides', () => {
  assert.equal(isValidFor2B([]), true);
  assert.equal(isValidFor2B(['casino', 'video']), true);
});

test('un seul raccourci est refusé — il décentre le bouton Publier', () => {
  assert.equal(isValidFor2B(['casino']), false);
});

test('trois ou plus sont refusés — la barre devient illisible', () => {
  assert.equal(isValidFor2B(['casino', 'video', 'trading']), false);
  assert.equal(isValidFor2B(['casino', 'video', 'trading', 'wallet', 'swipe']), false);
});

// ── Le filet de sécurité ─────────────────────────────────────────────────────

test('trop de raccourcis : on garde les premiers choisis', () => {
  assert.deepEqual(normalizeFor2B(['casino', 'video', 'trading', 'wallet']), ['casino', 'video']);
});

test('un seul raccourci retombe à zéro, pas à deux', () => {
  // On ne complète JAMAIS : mettre dans la barre de quelqu'un un raccourci
  // qu'il n'a pas demandé est pire que de lui en retirer un.
  assert.deepEqual(normalizeFor2B(['casino']), []);
});

test('une sélection déjà valide n’est pas touchée', () => {
  assert.deepEqual(normalizeFor2B([]), []);
  assert.deepEqual(normalizeFor2B(['casino', 'video']), ['casino', 'video']);
});

test('la sortie est TOUJOURS valide, quelle que soit l’entrée', () => {
  const entrees = [
    [],
    ['casino'],
    ['casino', 'video'],
    ['casino', 'video', 'trading'],
    ['casino', 'video', 'trading', 'wallet', 'swipe'],
  ];
  for (const entree of entrees) {
    assert.equal(
      isValidFor2B(normalizeFor2B(entree)),
      true,
      `normalisation invalide pour [${entree.join(', ')}]`,
    );
  }
});

test('les entrées bancales ne font pas tomber la normalisation', () => {
  assert.deepEqual(normalizeFor2B(null), []);
  assert.deepEqual(normalizeFor2B(undefined), []);
  assert.equal(isValidFor2B(null), true);
});
