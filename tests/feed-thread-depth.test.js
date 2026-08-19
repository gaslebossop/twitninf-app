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

const { threadDepthAt, MAX_THREAD_DEPTH } = loadTypeScriptModule('src/utils/feed.ts');

const tweet = (id, extra = {}) => ({ id, content: `contenu ${id}`, ...extra });
const reply = (id, parentId, extra = {}) =>
  tweet(id, { parent_tweet_id: parentId, ...extra });

/** Rangs de toute la liste, dans l'ordre — c'est ce que voit l'écran. */
const depths = (list) => list.map((_, i) => threadDepthAt(list, i));

test('un tweet racine est au rang 0', () => {
  const feed = [tweet('a'), tweet('b')];
  assert.deepEqual(depths(feed), [0, 0]);
});

test('une réponse posée juste sous son parent est au rang 1', () => {
  const feed = [tweet('a'), reply('r', 'a')];
  assert.deepEqual(depths(feed), [0, 1]);
});

test('une chaîne complète se lit rang par rang', () => {
  const feed = [tweet('a'), reply('b', 'a'), reply('c', 'b'), reply('d', 'c')];
  assert.deepEqual(depths(feed), [0, 1, 2, 3]);
});

test('le rang est borné à la profondeur servie par le recommandeur', () => {
  const feed = [
    tweet('a'),
    reply('b', 'a'),
    reply('c', 'b'),
    reply('d', 'c'),
    reply('e', 'd'),
    reply('f', 'e'),
  ];
  const last = depths(feed).at(-1);
  assert.equal(last, MAX_THREAD_DEPTH - 1);
});

test('une réponse dont le parent n’est PAS juste au-dessus repart à 0', () => {
  // Cas réel : `withoutOrphanReplies` a laissé passer une réponse qui porte son
  // propre contexte (citation, retweet). Rien ne la relie à la ligne du dessus,
  // donc elle ne doit pas hériter du retrait d'un fil auquel elle n'appartient pas.
  const feed = [tweet('a'), reply('b', 'a'), reply('z', 'ailleurs')];
  assert.deepEqual(depths(feed), [0, 1, 0]);
});

test('la chaîne se rompt dès qu’un tweet sans lien s’intercale', () => {
  const feed = [tweet('a'), reply('b', 'a'), tweet('intrus'), reply('c', 'b')];
  assert.deepEqual(depths(feed), [0, 1, 0, 0]);
});

test('le premier élément de la liste ne peut jamais avoir de parent au-dessus', () => {
  // Une réponse en tête de fil : son parent existe peut-être, mais pas à
  // l'écran. Sans cette borne, la boucle lirait `list[-1]`.
  const feed = [reply('r', 'a'), tweet('b')];
  assert.deepEqual(depths(feed), [0, 0]);
});
