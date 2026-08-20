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

const { splitEarnings } = loadTypeScriptModule('src/services/contentEarningsSplit.ts');

const tweet = (id, views, extra = {}) => ({
  id,
  content: `contenu ${id}`,
  views,
  likes: 0,
  retweets: 0,
  comments: 0,
  created_at: '2026-08-18T10:00:00.000Z',
  ...extra,
});

test('répartit le montant au prorata des vues', () => {
  const { rows } = splitEarnings([tweet('a', 750), tweet('b', 250)], 100);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].id, 'a');
  assert.equal(rows[0].amount, 75);
  assert.equal(rows[0].share, 0.75);
  assert.equal(rows[1].amount, 25);
});

test('la somme des montants vaut exactement le total réparti', () => {
  const { rows } = splitEarnings([tweet('a', 1), tweet('b', 1), tweet('c', 1)], 10);
  const sum = rows.reduce((acc, r) => acc + r.amount, 0);
  assert.ok(Math.abs(sum - 10) < 1e-9, `somme ${sum} ≠ 10`);
});

test('trie par montant décroissant', () => {
  const { rows } = splitEarnings([tweet('petit', 10), tweet('gros', 900), tweet('moyen', 90)], 50);
  assert.deepEqual(rows.map((r) => r.id), ['gros', 'moyen', 'petit']);
});

test('aucune vue : montants à zéro, jamais NaN', () => {
  const { rows, totalViews, hasData } = splitEarnings([tweet('a', 0), tweet('b', 0)], 100);
  assert.equal(totalViews, 0);
  assert.equal(hasData, false);
  for (const row of rows) {
    assert.equal(row.amount, 0);
    assert.equal(row.share, 0);
    assert.ok(Number.isFinite(row.amount));
  }
});

test('normalise les vues absentes, nulles ou non numériques', () => {
  const { rows, totalViews } = splitEarnings(
    [tweet('a', undefined), tweet('b', null), tweet('c', 'abc'), tweet('d', 100)],
    100,
  );
  assert.equal(totalViews, 100);
  assert.equal(rows.find((r) => r.id === 'd').amount, 100);
  assert.equal(rows.find((r) => r.id === 'a').views, 0);
  assert.equal(rows.find((r) => r.id === 'c').views, 0);
});

test('ignore les entrées sans identifiant', () => {
  const { rows } = splitEarnings([tweet('a', 10), { views: 90 }, null], 100);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].id, 'a');
});

test('des vues négatives comptent pour zéro', () => {
  const { rows, totalViews } = splitEarnings([tweet('a', -500), tweet('b', 100)], 100);
  assert.equal(totalViews, 100);
  assert.equal(rows.find((r) => r.id === 'b').amount, 100);
  assert.equal(rows.find((r) => r.id === 'a').amount, 0);
});

test('un total absent ou non fini ne produit aucun montant', () => {
  for (const bad of [undefined, null, NaN, Infinity, -12]) {
    const { rows } = splitEarnings([tweet('a', 100)], bad);
    assert.equal(rows[0].amount, 0, `total ${bad}`);
    assert.equal(rows[0].share, 1, 'la part de vues reste calculée');
  }
});

test('liste vide : résultat vide et exploitable', () => {
  const result = splitEarnings([], 100);
  assert.deepEqual(result.rows, []);
  assert.equal(result.totalViews, 0);
  assert.equal(result.hasData, false);
});

test('accepte la forme camelCase renvoyée par certaines routes', () => {
  const { rows } = splitEarnings(
    [{ id: 'a', content: 'x', viewCount: 200, createdAt: '2026-08-18T10:00:00.000Z' }],
    50,
  );
  assert.equal(rows[0].views, 200);
  assert.equal(rows[0].amount, 50);
  assert.equal(rows[0].createdAt, '2026-08-18T10:00:00.000Z');
});

test('le contenu est nettoyé de ses sauts de ligne pour l’affichage', () => {
  const { rows } = splitEarnings([tweet('a', 10, { content: 'ligne 1\n\nligne 2   ' })], 10);
  assert.equal(rows[0].content, 'ligne 1 ligne 2');
});
