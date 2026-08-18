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

const { buildColumns } = loadTypeScriptModule(
  'src/components/feed/explore/wallLayout.ts',
);

/** Fabrique un CardMeta minimal. */
const meta = (id, height = 200) => ({
  tweet: { id: String(id) },
  format: 'text',
  height,
});

const heightOf = (column) => column.reduce((sum, m) => sum + m.height, 0);

test('toutes les cartes atterrissent dans une colonne, sans doublon', () => {
  const metas = [];
  for (let i = 0; i < 25; i += 1) metas.push(meta(i, 120 + (i % 7) * 40));
  const [left, right] = buildColumns(metas);

  const ids = [...left, ...right].map((m) => m.tweet.id);
  assert.equal(ids.length, 25, 'aucune carte perdue');
  assert.equal(new Set(ids).size, 25, 'aucune carte rendue deux fois');
});

test('l’ordre du classement est préservé dans chaque colonne', () => {
  // Le flux arrive classé par `trending` : un tri interne le détruirait.
  const metas = [];
  for (let i = 0; i < 20; i += 1) metas.push(meta(i, 100 + (i % 5) * 60));
  const columns = buildColumns(metas);

  for (const column of columns) {
    const ids = column.map((m) => Number(m.tweet.id));
    assert.deepEqual(ids, [...ids].sort((a, b) => a - b));
  }
});

test('l’écart entre colonnes reste borné par la plus grande carte', () => {
  // C'est LA garantie qui remplace les blocs de resynchronisation : un glouton
  // « poser dans la colonne la plus courte » est autocorrecteur, donc l'écart
  // ne peut pas dériver, même sur une liste longue et très hétérogène.
  const metas = [];
  const heights = [90, 420, 130, 260, 700, 110, 180, 340];
  for (let i = 0; i < 400; i += 1) metas.push(meta(i, heights[i % heights.length]));

  const [left, right] = buildColumns(metas);
  const gap = Math.abs(heightOf(left) - heightOf(right));
  const tallest = Math.max(...heights);

  assert.ok(gap <= tallest, `écart ${gap} au-dessus de la plus grande carte (${tallest})`);
});

test('une carte géante isolée ne fait pas dériver la suite', () => {
  // L'autre colonne doit RATTRAPER : elle reçoit tout jusqu'à repasser devant.
  const metas = [meta('geante', 2000)];
  for (let i = 0; i < 30; i += 1) metas.push(meta(i, 100));

  const [left, right] = buildColumns(metas);
  const gap = Math.abs(heightOf(left) - heightOf(right));

  assert.equal(left[0].tweet.id, 'geante');
  assert.ok(left.length < right.length, 'la colonne chargée reçoit moins de cartes');
  assert.ok(gap <= 2000);
});

test('l’alternance naïve serait battue sur un jeu déséquilibré', () => {
  // Garde-fou explicite : si quelqu'un remplaçait le glouton par un simple
  // pair/impair, ce test tomberait — c'est exactement la régression visée.
  const metas = [
    meta(0, 600), meta(1, 100), meta(2, 100), meta(3, 100),
    meta(4, 100), meta(5, 100), meta(6, 100), meta(7, 100),
  ];
  const [left, right] = buildColumns(metas);
  const greedyGap = Math.abs(heightOf(left) - heightOf(right));

  const evens = metas.filter((_, i) => i % 2 === 0);
  const odds = metas.filter((_, i) => i % 2 === 1);
  const naiveGap = Math.abs(heightOf(evens) - heightOf(odds));

  assert.ok(greedyGap < naiveGap, `glouton ${greedyGap} vs alternance ${naiveGap}`);
});

test('une liste vide donne deux colonnes vides', () => {
  assert.deepEqual(buildColumns([]), [[], []]);
});

test('une seule carte va à gauche', () => {
  // La colonne gauche est le point de départ : à hauteurs égales (0 et 0), le
  // glouton doit choisir la gauche, sinon la première carte du classement se
  // retrouverait à droite.
  const [left, right] = buildColumns([meta('seule', 150)]);
  assert.equal(left.length, 1);
  assert.equal(right.length, 0);
});
