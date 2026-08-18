const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const Module = require('node:module');
const path = require('node:path');
const ts = require('typescript');

/**
 * Charge un module TypeScript en transpilant à la volée, ainsi que ses imports
 * relatifs (même mécanisme que `tests/map-markers.test.js`) : `cardFormat.ts`
 * importe réellement `splitTweetMedia`/`displayContentOf` depuis
 * `../../../utils/tweetMedia` (pas seulement des types), et `require` nu ne
 * résout pas une extension `.ts`.
 */
function loadTypeScriptModule(filename, cache = new Map()) {
  const withExt = filename.endsWith('.ts') ? filename : `${filename}.ts`;
  const resolved = path.isAbsolute(withExt) ? withExt : path.resolve(process.cwd(), withExt);
  if (cache.has(resolved)) return cache.get(resolved).exports;

  const output = ts.transpileModule(readFileSync(resolved, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;

  const loaded = new Module(resolved, module);
  loaded.filename = resolved;
  loaded.paths = module.paths;
  cache.set(resolved, loaded);

  loaded.require = (request) => {
    if (!request.startsWith('.')) return require(request);
    return loadTypeScriptModule(path.resolve(path.dirname(resolved), request), cache);
  };

  loaded._compile(output, resolved);
  return loaded.exports;
}

const {
  formatOf,
  describeCards,
  shouldShowCount,
  estimatedHeightOf,
  DECLARATION_MAX,
  CITATION_MAX,
  COUNTER_FLOOR,
} = loadTypeScriptModule('src/components/feed/explore/cardFormat.ts');

const CARD_WIDTH = 180;

/** Tweet texte nu — pas de média, pas de retweet. */
const textTweet = (id, length) => ({
  id: String(id),
  content: 'a'.repeat(length),
  media_urls: [],
  stats: { likes: 0, views: 0 },
});

/** Tweet portant une image. */
const photoTweet = (id, length = 10) => ({
  id: String(id),
  content: 'a'.repeat(length),
  media_urls: ['https://example.test/p.jpg'],
  stats: { likes: 0, views: 0 },
});

test('la longueur décide du format, aux bornes exactes', () => {
  assert.equal(formatOf(textTweet(1, 1)), 'declaration');
  assert.equal(formatOf(textTweet(2, DECLARATION_MAX)), 'declaration');
  assert.equal(formatOf(textTweet(3, DECLARATION_MAX + 1)), 'citation');
  assert.equal(formatOf(textTweet(4, CITATION_MAX)), 'citation');
  assert.equal(formatOf(textTweet(5, CITATION_MAX + 1)), 'bloc');
});

test('un média l’emporte sur la longueur du texte', () => {
  // Sans cette priorité, un tweet illustré de 3 mots partirait en Déclaration
  // et son image ne serait jamais rendue.
  assert.equal(formatOf(photoTweet(6, 5)), 'photo');
  assert.equal(formatOf(photoTweet(7, 500)), 'photo');
});

test('la cadence de couleur ne s’applique qu’aux déclarations', () => {
  const tweets = [];
  for (let i = 0; i < 10; i += 1) tweets.push(textTweet(i, 10));
  const metas = describeCards(tweets, CARD_WIDTH);
  const fills = metas.map((m) => m.fill);
  assert.deepEqual(fills, [
    'surface', 'surface', 'accent', 'surface', 'contrast',
    'surface', 'surface', 'accent', 'surface', 'contrast',
  ]);
});

test('les formats non-déclaration restent sur les surfaces neutres', () => {
  const metas = describeCards(
    [textTweet(1, 60), textTweet(2, 200), photoTweet(3)],
    CARD_WIDTH,
  );
  for (const meta of metas) {
    assert.ok(meta.fill === 'surface' || meta.fill === 'surfaceAlt');
  }
});

test('le rang de cadence compte les déclarations, pas les positions', () => {
  // Deux déclarations séparées par des cartes d'un autre format doivent se
  // suivre dans la cadence : sinon le magenta dépend du hasard du mélange.
  const metas = describeCards(
    [
      textTweet(1, 10),   // déclaration rang 0 -> surface
      textTweet(2, 200),  // bloc
      textTweet(3, 10),   // déclaration rang 1 -> surface
      textTweet(4, 200),  // bloc
      textTweet(5, 10),   // déclaration rang 2 -> accent
    ],
    CARD_WIDTH,
  );
  assert.equal(metas[4].fill, 'accent');
});

test('aucun compteur en dessous du plancher', () => {
  assert.equal(shouldShowCount(0), false);
  assert.equal(shouldShowCount(COUNTER_FLOOR - 1), false);
  assert.equal(shouldShowCount(COUNTER_FLOOR), true);
  assert.equal(shouldShowCount(999), true);
});

test('la hauteur estimée croît avec la longueur du texte', () => {
  const court = estimatedHeightOf(textTweet(1, 10), CARD_WIDTH);
  const moyen = estimatedHeightOf(textTweet(2, 80), CARD_WIDTH);
  const long = estimatedHeightOf(textTweet(3, 300), CARD_WIDTH);
  assert.ok(court < moyen, 'court < moyen');
  assert.ok(moyen < long, 'moyen < long');
});

test('la hauteur d’une photo suit la largeur de carte', () => {
  // Une vignette est dimensionnée par un RATIO : deux fois plus large, deux
  // fois plus haute. C'est ce qui permet à la grille de rester juste après une
  // rotation — la largeur est un paramètre, pas une constante figée au
  // chargement du module.
  const etroit = estimatedHeightOf(photoTweet(1), 150);
  const large = estimatedHeightOf(photoTweet(1), 300);
  assert.ok(large > etroit);
});

test('une carte de texte RÉTRÉCIT quand la carte s’élargit', () => {
  // Contre-intuitif mais juste, et c'est le sens qui compte pour l'équilibrage
  // des colonnes : le même texte tient en MOINS de lignes sur une carte plus
  // large, donc la boîte est plus courte. Une estimation qui grandirait avec la
  // largeur décalerait les colonnes à chaque rotation.
  const etroit = estimatedHeightOf(textTweet(1, 40), 150);
  const large = estimatedHeightOf(textTweet(1, 40), 300);
  assert.ok(large < etroit);
});
