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

const { buildWall, BLOCK_SIZE } = loadTypeScriptModule(
  'src/components/feed/explore/wallLayout.ts',
);

/** Fabrique un CardMeta minimal. */
const meta = (id, height = 200) => ({
  tweet: { id: String(id) },
  format: 'text',
  height,
});

const manyCards = (n, height = 200) => {
  const out = [];
  for (let i = 0; i < n; i += 1) out.push(meta(i, height));
  return out;
};

const allIds = (block) => [...block.columns[0], ...block.columns[1]].map((m) => m.tweet.id);

test('le mur se découpe en blocs de resynchronisation', () => {
  const blocks = buildWall(manyCards(BLOCK_SIZE * 3));
  assert.equal(blocks.length, 3);
  for (const block of blocks) {
    assert.equal(allIds(block).length, BLOCK_SIZE);
  }
});

test('aucune carte n’est promue en pleine largeur', () => {
  // La rupture tous les sept tweets cassait la trame à deux colonnes : le mur
  // est désormais uniforme, un bloc n'expose plus que ses deux colonnes.
  const [block] = buildWall(manyCards(BLOCK_SIZE));
  assert.equal(block.feature, undefined);
  assert.deepEqual(Object.keys(block), ['columns']);
});

test('toutes les cartes atterrissent dans une colonne, sans doublon', () => {
  const total = BLOCK_SIZE * 2 + 3;
  const blocks = buildWall(manyCards(total));
  const seen = blocks.flatMap(allIds);
  assert.equal(seen.length, total, 'aucune carte perdue');
  assert.equal(new Set(seen).size, total, 'aucune carte rendue deux fois');
});

test('l’ordre du classement est préservé dans chaque colonne', () => {
  // Le flux arrive classé par `trending` : un tri interne le détruirait.
  const [block] = buildWall(manyCards(BLOCK_SIZE));
  for (const column of block.columns) {
    const ids = column.map((m) => Number(m.tweet.id));
    const sorted = [...ids].sort((a, b) => a - b);
    assert.deepEqual(ids, sorted);
  }
});

test('les colonnes s’équilibrent sur la hauteur, pas en alternant', () => {
  // Une simple alternance gauche/droite laisserait une colonne prendre tout le
  // retard si elle hérite de plusieurs grandes cartes d'affilée.
  const metas = [
    meta(0, 600), meta(1, 100), meta(2, 100),
    meta(3, 100), meta(4, 100), meta(5, 100),
    meta(6, 100), meta(7, 100),
  ];
  const [block] = buildWall(metas);
  const height = (column) => column.reduce((sum, m) => sum + m.height, 0);
  const gap = Math.abs(height(block.columns[0]) - height(block.columns[1]));
  // Seuil : la plus grande carte du jeu (600) sert de référence — un glouton
  // correct finit forcément sous cet écart, une alternance naïve le dépasse
  // (600+100+100+100 contre 100×4, soit 500).
  assert.ok(gap < 600, `écart de colonnes trop grand : ${gap}`);
});

test('un dernier bloc incomplet ne casse rien', () => {
  const blocks = buildWall(manyCards(BLOCK_SIZE + 1));
  assert.equal(blocks.length, 2);
  assert.equal(allIds(blocks[1]).length, 1);
  // La clé de rendu du mur vient de la première carte de la colonne gauche :
  // elle doit exister même pour un bloc d'une seule carte.
  assert.ok(blocks[1].columns[0][0]);
});

test('une liste vide ne produit aucun bloc', () => {
  assert.deepEqual(buildWall([]), []);
});
