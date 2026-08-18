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
  estimatedLines,
  COUNTER_FLOOR,
  MEDIA_RATIO,
  TEXT_MAX_LINES,
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

test('la longueur du texte ne change plus le format', () => {
  // C'est tout l'objet de la refonte uniforme : un tweet de 3 signes et un
  // tweet de 300 reçoivent le MÊME traitement, seule leur hauteur diffère.
  assert.equal(formatOf(textTweet(1, 1)), 'text');
  assert.equal(formatOf(textTweet(2, 46)), 'text');
  assert.equal(formatOf(textTweet(3, 100)), 'text');
  assert.equal(formatOf(textTweet(4, 500)), 'text');
});

test('un média l’emporte sur le texte', () => {
  // Sans cette priorité, un tweet illustré n'afficherait jamais son image.
  assert.equal(formatOf(photoTweet(6, 5)), 'photo');
  assert.equal(formatOf(photoTweet(7, 500)), 'photo');
});

test('toutes les cartes reçoivent la même description, sans cadence de couleur', () => {
  const tweets = [];
  for (let i = 0; i < 10; i += 1) tweets.push(textTweet(i, 10 + i * 25));
  const metas = describeCards(tweets, CARD_WIDTH);

  assert.equal(metas.length, 10);
  for (const meta of metas) {
    // Plus aucun `fill` : le fond n'est plus une décision par carte.
    assert.equal(meta.fill, undefined);
    assert.equal(meta.format, 'text');
    assert.ok(meta.height > 0);
  }
});

test('la hauteur croît avec la longueur, puis plafonne', () => {
  // Fixtures choisies SOUS le plafond, sinon le test comparerait deux fois la
  // même hauteur plafonnée et ne mesurerait plus rien.
  assert.ok(
    estimatedLines(60, CARD_WIDTH) < TEXT_MAX_LINES,
    'fixture « medium » à revoir : elle sature le plafond de lignes',
  );

  const short = estimatedHeightOf(textTweet(1, 10), CARD_WIDTH);
  const medium = estimatedHeightOf(textTweet(2, 60), CARD_WIDTH);
  const long = estimatedHeightOf(textTweet(3, 5000), CARD_WIDTH);
  const longer = estimatedHeightOf(textTweet(4, 50000), CARD_WIDTH);

  assert.ok(medium > short, 'un texte plus long occupe plus de hauteur');
  assert.ok(long > medium);
  // Le plafond est la même borne que le `numberOfLines` du rendu : sans lui
  // l'estimation dépasserait la carte réelle et déséquilibrerait les colonnes.
  assert.equal(long, longer, 'au-delà du plafond, la hauteur ne bouge plus');
});

test('le nombre de lignes estimé ne dépasse jamais la borne du rendu', () => {
  assert.equal(estimatedLines(0, CARD_WIDTH), 1, 'au moins une ligne');
  assert.equal(estimatedLines(1, CARD_WIDTH), 1);
  assert.equal(estimatedLines(100000, CARD_WIDTH), TEXT_MAX_LINES);
});

test('une carte plus étroite occupe plus de lignes pour le même texte', () => {
  // Le garde-fou contre la régression qui figeait la largeur au chargement :
  // la largeur doit réellement traverser le calcul. Longueur choisie pour que
  // la carte LARGE reste sous le plafond — sinon les deux valeurs seraient
  // plafonnées à l'identique et le test passerait pour de mauvaises raisons.
  const wide = estimatedLines(100, 300);
  const narrow = estimatedLines(100, 120);

  assert.ok(wide < TEXT_MAX_LINES, 'fixture à revoir : la carte large sature');
  assert.ok(narrow > wide);
});

test('une carte photo se dimensionne sur le ratio unique', () => {
  const height = estimatedHeightOf(photoTweet(1), CARD_WIDTH);
  const image = Math.round(CARD_WIDTH * MEDIA_RATIO);
  // La hauteur vaut l'image plus la signature — donc strictement plus que
  // l'image seule, et le surplus est constant d'une photo à l'autre.
  assert.ok(height > image);
  assert.equal(height - image, estimatedHeightOf(photoTweet(2), CARD_WIDTH) - image);
});

test('deux photos ont exactement la même hauteur', () => {
  // L'ancien module tirait le ratio par hash de l'id : deux photos voisines
  // pouvaient avoir des hauteurs très différentes sans raison.
  assert.equal(
    estimatedHeightOf(photoTweet('abc'), CARD_WIDTH),
    estimatedHeightOf(photoTweet('zzz-très-différent'), CARD_WIDTH),
  );
});

test('aucun compteur en dessous du plancher', () => {
  assert.equal(shouldShowCount(0), false);
  assert.equal(shouldShowCount(COUNTER_FLOOR - 1), false);
  assert.equal(shouldShowCount(COUNTER_FLOOR), true);
  assert.equal(shouldShowCount(COUNTER_FLOOR + 100), true);
});
