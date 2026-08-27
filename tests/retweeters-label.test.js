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

const { retweetersLabel, retweetersOf, sameRetweeters } = loadTypeScriptModule(
  'src/utils/retweeters.ts',
);

const person = (username) => ({ id: `id-${username}`, username });

// ── Accord et ponctuation ────────────────────────────────────────────────────
//
// L'ancienne ligne écrivait toujours « @untel a retweeté ». Dès que l'API en
// empile plusieurs, le verbe s'accorde et la liste doit se fermer par « et » —
// une énumération qui finit par une virgule se lit comme tronquée.

test('une seule personne : verbe au singulier', () => {
  assert.equal(retweetersLabel([person('gas')], 'retweeté'), '@gas a retweeté');
});

test('deux personnes : « et », verbe au pluriel', () => {
  assert.equal(
    retweetersLabel([person('gas'), person('komille')], 'retweeté'),
    '@gas et @komille ont retweeté',
  );
});

test('trois personnes : virgule puis « et », toutes nommées', () => {
  assert.equal(
    retweetersLabel([person('a'), person('b'), person('c')], 'retweeté'),
    '@a, @b et @c ont retweeté',
  );
});

test('au-delà de trois : on cesse de nommer et on compte', () => {
  // Nommer vaut mieux que compter, mais une quatrième mention fait déborder la
  // ligne — qui est tronquée à une seule — et fait perdre les noms eux-mêmes.
  assert.equal(
    retweetersLabel([person('a'), person('b'), person('c'), person('d')], 'retweeté'),
    '@a, @b et 2 autres ont retweeté',
  );
  assert.equal(
    retweetersLabel(
      [person('a'), person('b'), person('c'), person('d'), person('e')],
      'retweeté',
    ),
    '@a, @b et 3 autres ont retweeté',
  );
});

test('le verbe est fourni par l’appelant — les deux fils n’emploient pas le même', () => {
  // Le fil « 2B » dit « reposté » là où le fil normal dit « retweeté ».
  assert.equal(retweetersLabel([person('gas')], 'reposté'), '@gas a reposté');
});

test('liste vide : aucune mention plutôt qu’une phrase creuse', () => {
  assert.equal(retweetersLabel([], 'retweeté'), null);
});

test('les entrées sans pseudo sont ignorées, pas comptées', () => {
  // Un compte supprimé entre l'envoi et l'affichage ne doit pas produire
  // « @gas et 1 autre » où le « 1 autre » n'existe plus.
  assert.equal(
    retweetersLabel([person('gas'), { id: 'x' }, { id: 'y', username: '' }], 'retweeté'),
    '@gas a retweeté',
  );
});

// ── Repli quand l'API ne renvoie pas encore la liste ─────────────────────────

test('sans `retweeters`, l’auteur de la ligne EST le retweeteur', () => {
  const tweet = { id: 't1', author: { id: 'u1', username: 'gas' } };
  assert.deepEqual(retweetersOf(tweet), [{ id: 'u1', username: 'gas' }]);
});

test('`retweeters` vide retombe aussi sur l’auteur', () => {
  const tweet = { id: 't1', retweeters: [], author: { id: 'u1', username: 'gas' } };
  assert.equal(retweetersOf(tweet).length, 1);
});

test('`retweeters` renseigné prime sur l’auteur', () => {
  const tweet = {
    id: 't1',
    retweeters: [person('a'), person('b')],
    author: { id: 'u1', username: 'gas' },
  };
  assert.deepEqual(
    retweetersOf(tweet).map((p) => p.username),
    ['a', 'b'],
  );
});

// ── Comparateur de `React.memo` ──────────────────────────────────────────────

test('deux listes identiques se valent', () => {
  assert.equal(sameRetweeters([person('a'), person('b')], [person('a'), person('b')]), true);
});

test('un retweeteur de plus invalide la ligne', () => {
  // Sans ça, la mention resterait figée après un rafraîchissement : le tweet
  // n'a pas changé d'identité, donc rien d'autre ne ferait rejouer le rendu.
  assert.equal(sameRetweeters([person('a')], [person('a'), person('b')]), false);
});

test('un ordre différent invalide aussi — le premier nommé change', () => {
  assert.equal(sameRetweeters([person('a'), person('b')], [person('b'), person('a')]), false);
});

test('absent et vide se valent', () => {
  assert.equal(sameRetweeters(undefined, []), true);
  assert.equal(sameRetweeters(null, undefined), true);
});
