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

const { getVisibleCardIds } = loadTypeScriptModule(
  'src/components/feed/explore/wallVisibility.ts',
);

const rect = (id, top, height) => ({ id, top, height });

test('une carte entièrement dans le viewport est visible', () => {
  const ids = getVisibleCardIds([rect('a', 100, 200)], 0, 800);
  assert.deepEqual(ids, ['a']);
});

test('une carte entièrement hors du viewport (au-dessus) est invisible', () => {
  const ids = getVisibleCardIds([rect('a', 0, 200)], 1000, 800);
  assert.deepEqual(ids, []);
});

test('une carte entièrement hors du viewport (en dessous) est invisible', () => {
  const ids = getVisibleCardIds([rect('a', 5000, 200)], 0, 800);
  assert.deepEqual(ids, []);
});

test('une carte visible à exactement 50% franchit le seuil', () => {
  // Viewport [0, 800[. Carte [700, 900[ -> 100px visibles sur 200 = 50%.
  const ids = getVisibleCardIds([rect('a', 700, 200)], 0, 800);
  assert.deepEqual(ids, ['a']);
});

test('une carte visible à 49% ne franchit pas le seuil', () => {
  // Carte [700, 902[ -> 100px visibles sur 202 ≈ 49.5%.
  const ids = getVisibleCardIds([rect('a', 700, 202)], 0, 800);
  assert.deepEqual(ids, []);
});

test('plusieurs cartes : seules celles au-dessus du seuil ressortent', () => {
  const cards = [
    rect('above-threshold', 100, 200),
    rect('barely-in', 750, 200), // 50px/200 = 25% -> sous le seuil
    rect('fully-below', 2000, 200),
  ];
  const ids = getVisibleCardIds(cards, 0, 800);
  assert.deepEqual(ids, ['above-threshold']);
});

test('une carte de hauteur nulle ne divise pas par zéro et reste invisible', () => {
  const ids = getVisibleCardIds([rect('empty', 100, 0)], 0, 800);
  assert.deepEqual(ids, []);
});

test('un seuil personnalisé est respecté', () => {
  // Carte [700, 900[, viewport [0, 800[ -> 50% visible.
  const cards = [rect('a', 700, 200)];
  assert.deepEqual(getVisibleCardIds(cards, 0, 800, 0.6), []);
  assert.deepEqual(getVisibleCardIds(cards, 0, 800, 0.5), ['a']);
});

test('une liste vide ne renvoie rien', () => {
  assert.deepEqual(getVisibleCardIds([], 0, 800), []);
});
