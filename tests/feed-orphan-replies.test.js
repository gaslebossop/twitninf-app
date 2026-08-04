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

const { withoutOrphanReplies } = loadTypeScriptModule('src/utils/feed.ts');

const tweet = (id, extra = {}) => ({ id, content: `contenu ${id}`, ...extra });
const reply = (id, parentId, extra = {}) =>
  tweet(id, { parent_tweet_id: parentId, ...extra });

const ids = (list) => list.map((t) => t.id);

test('une réponse sans son parent ne peut pas atteindre le fil', () => {
  const feed = [tweet('a'), reply('r', 'inconnu'), tweet('b')];
  assert.deepEqual(ids(withoutOrphanReplies(feed)), ['a', 'b']);
});

test('une réponse précédée de son parent est conservée', () => {
  const feed = [tweet('parent'), reply('r', 'parent'), tweet('b')];
  assert.deepEqual(ids(withoutOrphanReplies(feed)), ['parent', 'r', 'b']);
});

test('le parent présent AILLEURS dans la liste ne suffit pas', () => {
  // Trente tweets plus haut, le contexte est perdu exactement de la même
  // façon que s'il était absent : la règle porte sur la position, pas sur
  // la simple présence.
  const feed = [tweet('parent'), tweet('intrus'), reply('r', 'parent')];
  assert.deepEqual(ids(withoutOrphanReplies(feed)), ['parent', 'intrus']);
});

test('une chaîne de réponses consécutives reste entière', () => {
  const feed = [tweet('p'), reply('r1', 'p'), reply('r2', 'r1')];
  assert.deepEqual(ids(withoutOrphanReplies(feed)), ['p', 'r1', 'r2']);
});

test('une réponse écartée casse la chaîne pour celles qui la suivent', () => {
  // `r2` répond à `r1`, qui vient d'être retiré : `r2` devient orpheline à
  // son tour. Sans ce comportement, on garderait une réponse dont le parent
  // n'est justement pas affiché.
  const feed = [tweet('a'), reply('r1', 'absent'), reply('r2', 'r1')];
  assert.deepEqual(ids(withoutOrphanReplies(feed)), ['a']);
});

test('un retweet porte son contexte et n’est jamais écarté', () => {
  const feed = [tweet('a'), tweet('rt', { parent_tweet_id: 'x', is_retweet: true, originalTweet: { id: 'x' } })];
  assert.deepEqual(ids(withoutOrphanReplies(feed)), ['a', 'rt']);
});

test('une citation porte son contexte et n’est jamais écartée', () => {
  const feed = [tweet('q', { parent_tweet_id: 'x', is_quote: true })];
  assert.deepEqual(ids(withoutOrphanReplies(feed)), ['q']);
});

test('une réponse livrée avec son parent est gardée telle quelle', () => {
  // Le jour où le fil enverra `parentTweet`, la réponse cesse d'être
  // orpheline : le client a de quoi rendre le contexte au-dessus.
  const feed = [reply('r', 'p', { parentTweet: { id: 'p' } })];
  assert.deepEqual(ids(withoutOrphanReplies(feed)), ['r']);
});

test('les identifiants numériques et textuels se comparent correctement', () => {
  // L'API renvoie tantôt un nombre, tantôt une chaîne : une comparaison
  // stricte laisserait passer des orphelines ou en écarterait à tort.
  const feed = [tweet(12), reply('r', 12)];
  assert.deepEqual(ids(withoutOrphanReplies(feed)), [12, 'r']);
});

test('un fil sans aucune réponse traverse sans modification', () => {
  const feed = [tweet('a'), tweet('b'), tweet('c')];
  assert.deepEqual(ids(withoutOrphanReplies(feed)), ['a', 'b', 'c']);
});
