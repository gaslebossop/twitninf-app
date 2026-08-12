/**
 * Regroupement des marqueurs de la Carte NF.
 *
 * Le défaut qu'on cherche ici est celui qu'on a vu à l'écran : vingt personnes
 * de la même agglomération empilées en un tas illisible, et autant de vues
 * natives redessinées à chaque image — ce qui fait tomber la carte au dézoom.
 */

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

const { clusterize, degreesPerPixel, quantizedDegreesPerPixel } = loadTypeScriptModule(
  require.resolve('../src/utils/mapCluster.ts')
);

const SCREEN = 390;

/** 22 comptes éparpillés dans un rayon de ~9 km autour de Paris. */
function parisCrowd(count = 22) {
  const points = [];
  for (let i = 0; i < count; i += 1) {
    points.push({
      id: `u${i}`,
      latitude: 48.8566 + ((i % 5) - 2) * 0.02,
      longitude: 2.3522 + (Math.floor(i / 5) - 2) * 0.03,
    });
  }
  return points;
}

test('dézoomé, la foule devient une poignée de groupes', () => {
  const crowd = parisCrowd();
  // Vue large : toute l'Île-de-France tient à l'écran.
  const clusters = clusterize(crowd, degreesPerPixel(1.2, SCREEN));

  assert.ok(clusters.length < crowd.length / 3, `attendu peu de groupes, obtenu ${clusters.length}`);
  const total = clusters.reduce((sum, cluster) => sum + cluster.items.length, 0);
  assert.equal(total, crowd.length, 'personne n’est perdu en route');
});

test('zoomé, chacun retrouve sa propre épingle', () => {
  const crowd = parisCrowd();
  // Vue serrée : quelques rues.
  const clusters = clusterize(crowd, degreesPerPixel(0.004, SCREEN));

  assert.equal(clusters.length, crowd.length);
  assert.ok(clusters.every((cluster) => cluster.items.length === 1));
});

test('un groupe se pose au barycentre de ses membres', () => {
  const clusters = clusterize(
    [
      { id: 'a', latitude: 48.80, longitude: 2.30 },
      { id: 'b', latitude: 48.90, longitude: 2.40 },
    ],
    degreesPerPixel(1, SCREEN)
  );

  assert.equal(clusters.length, 1);
  assert.ok(Math.abs(clusters[0].latitude - 48.85) < 1e-9);
  assert.ok(Math.abs(clusters[0].longitude - 2.35) < 1e-9);
});

test('un point isolé garde son identifiant, pas un identifiant de groupe', () => {
  const clusters = clusterize(
    [{ id: 'seul', latitude: 10, longitude: 10 }],
    degreesPerPixel(0.01, SCREEN)
  );
  assert.equal(clusters[0].id, 'seul');
});

test('l’identifiant d’un groupe change avec sa composition', () => {
  const scale = degreesPerPixel(1, SCREEN);
  const deux = clusterize(
    [
      { id: 'a', latitude: 48.85, longitude: 2.35 },
      { id: 'b', latitude: 48.86, longitude: 2.36 },
    ],
    scale
  );
  const trois = clusterize(
    [
      { id: 'a', latitude: 48.85, longitude: 2.35 },
      { id: 'b', latitude: 48.86, longitude: 2.36 },
      { id: 'c', latitude: 48.87, longitude: 2.37 },
    ],
    scale
  );
  assert.notEqual(deux[0].id, trois[0].id, 'la vue du marqueur ne doit pas être réutilisée');
});

test('l’ordre des points ne change pas le résultat', () => {
  const scale = degreesPerPixel(0.6, SCREEN);
  const crowd = parisCrowd(12);
  const a = clusterize(crowd, scale).map((cluster) => cluster.id).sort();
  const b = clusterize([...crowd].reverse(), scale).map((cluster) => cluster.id).sort();
  assert.deepEqual(a, b);
});

test('une échelle inconnue laisse chacun seul plutôt que d’agréger au hasard', () => {
  const crowd = parisCrowd(6);
  assert.equal(clusterize(crowd, 0).length, crowd.length);
  assert.equal(clusterize(crowd, NaN).length, crowd.length);
});

test('aucun point, aucun groupe', () => {
  assert.deepEqual(clusterize([], degreesPerPixel(1, SCREEN)), []);
});

/**
 * Cinquante fenêtres du MÊME zoom, dont la largeur mesurée dérive de ±1 %.
 *
 * Cette dérive n'est pas une hypothèse : en projection Mercator, la largeur en
 * degrés d'une fenêtre dépend de la latitude, donc glisser du nord au sud à
 * zoom constant la fait varier au moins autant.
 */
function compositionsPendantUnDeplacement(fn) {
  const crowd = parisCrowd();
  const vues = new Set();
  for (let i = 0; i < 50; i += 1) {
    const largeur = 0.6 * (1 + (i / 50 - 0.5) * 0.02);
    vues.add(
      clusterize(crowd, fn(largeur, SCREEN))
        .map((cluster) => cluster.id)
        .sort()
        .join('|')
    );
  }
  return vues.size;
}

test('à zoom constant, un déplacement ne recompose aucun groupe', () => {
  assert.equal(
    compositionsPendantUnDeplacement(quantizedDegreesPerPixel),
    1,
    'un groupe qui se recompose fait changer d’apparence des épingles immobiles'
  );
});

test('sans l’arrondi, le même déplacement recompose des groupes', () => {
  // Le test précédent ne vaut que si l'échelle brute, elle, échoue vraiment :
  // sinon il passerait aussi bien sans le correctif.
  assert.ok(
    compositionsPendantUnDeplacement(degreesPerPixel) > 1,
    'sans cette différence, le test ci-dessus ne prouverait rien'
  );
});

test('un vrai changement de zoom, lui, regroupe autrement', () => {
  const crowd = parisCrowd();
  const large = clusterize(crowd, quantizedDegreesPerPixel(1.2, SCREEN));
  const serre = clusterize(crowd, quantizedDegreesPerPixel(0.004, SCREEN));

  assert.ok(large.length < serre.length, 'l’arrondi ne doit pas figer le regroupement');
  assert.equal(serre.length, crowd.length);
});

test('une largeur inutilisable ne fabrique pas d’échelle', () => {
  assert.equal(quantizedDegreesPerPixel(0, SCREEN), 0);
  assert.equal(quantizedDegreesPerPixel(-1, SCREEN), 0);
  assert.equal(quantizedDegreesPerPixel(NaN, SCREEN), 0);
  assert.equal(quantizedDegreesPerPixel(1, 0), 0);
});
