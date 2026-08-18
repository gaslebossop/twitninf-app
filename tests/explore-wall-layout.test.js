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
const meta = (id, format, height = 200) => ({
  tweet: { id: String(id) },
  format,
  fill: 'surface',
  height,
});

const manyBlocs = (n) => {
  const out = [];
  for (let i = 0; i < n; i += 1) out.push(meta(i, 'bloc'));
  return out;
};

test('le mur se découpe en blocs de 7', () => {
  const blocks = buildWall(manyBlocs(21));
  assert.equal(blocks.length, 3);
  for (const block of blocks) {
    const total = 1 + block.columns[0].length + block.columns[1].length;
    assert.equal(total, BLOCK_SIZE);
  }
});

test('la rupture est la première déclaration du bloc', () => {
  const metas = [
    meta(0, 'bloc'), meta(1, 'citation'), meta(2, 'declaration'),
    meta(3, 'declaration'), meta(4, 'bloc'), meta(5, 'bloc'), meta(6, 'bloc'),
  ];
  const [block] = buildWall(metas);
  assert.equal(block.feature.tweet.id, '2');
});

test('à défaut de déclaration, une photo fait la rupture', () => {
  const metas = [
    meta(0, 'bloc'), meta(1, 'citation'), meta(2, 'photo'),
    meta(3, 'bloc'), meta(4, 'bloc'), meta(5, 'bloc'), meta(6, 'bloc'),
  ];
  const [block] = buildWall(metas);
  assert.equal(block.feature.tweet.id, '2');
});

test('sans déclaration ni photo, la rupture est le premier du bloc', () => {
  // Le flux arrive déjà classé par `trending` : le premier est le plus fort.
  const [block] = buildWall(manyBlocs(7));
  assert.equal(block.feature.tweet.id, '0');
});

test('la rupture n’apparaît jamais aussi dans les colonnes', () => {
  const blocks = buildWall(manyBlocs(14));
  for (const block of blocks) {
    const inColumns = [...block.columns[0], ...block.columns[1]].map((m) => m.tweet.id);
    assert.ok(!inColumns.includes(block.feature.tweet.id));
  }
});

test('les colonnes s’équilibrent sur la hauteur, pas en alternant', () => {
  // Une simple alternance gauche/droite laisserait une colonne prendre tout le
  // retard si elle hérite de plusieurs grandes cartes d'affilée.
  const metas = [
    meta(0, 'bloc', 100),   // rupture
    meta(1, 'bloc', 400),
    meta(2, 'bloc', 100),
    meta(3, 'bloc', 100),
    meta(4, 'bloc', 100),
    meta(5, 'bloc', 100),
    meta(6, 'bloc', 100),
  ];
  const [block] = buildWall(metas);
  const h = (col) => col.reduce((sum, m) => sum + m.height, 0);
  const ecart = Math.abs(h(block.columns[0]) - h(block.columns[1]));
  assert.ok(ecart <= 200, `écart trop grand : ${ecart}`);
});

test('un reste plus court qu’un bloc forme quand même un bloc', () => {
  const blocks = buildWall(manyBlocs(9));
  assert.equal(blocks.length, 2);
  const second = blocks[1];
  assert.equal(1 + second.columns[0].length + second.columns[1].length, 2);
});

test('une liste vide ne produit aucun bloc', () => {
  assert.deepEqual(buildWall([]), []);
});

test('un seul tweet devient une rupture sans colonnes', () => {
  const blocks = buildWall([meta(0, 'declaration')]);
  assert.equal(blocks.length, 1);
  assert.equal(blocks[0].columns[0].length, 0);
  assert.equal(blocks[0].columns[1].length, 0);
});
