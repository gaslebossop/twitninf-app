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

const { DwellSessionTracker, MIN_DWELL_MS, MAX_DWELL_MS } = loadTypeScriptModule(
  'src/services/dwellSessions.ts',
);

const T0 = 1_000_000;

test('une lecture continue produit un segment à la sortie', () => {
  const t = new DwellSessionTracker();
  t.sync(['a'], T0);
  assert.deepEqual(t.sync([], T0 + 4000), [{ id: 'a', dwellMs: 4000 }]);
});

test('rien n’est émis tant que le tweet reste visible', () => {
  const t = new DwellSessionTracker();
  t.sync(['a'], T0);
  assert.deepEqual(t.sync(['a'], T0 + 3000), [], 'toujours visible : pas de segment');
  assert.deepEqual(t.sync(['a', 'b'], T0 + 5000), [], 'un voisin entre : a continue');
});

test('une ré-entrée ne remet pas le chronomètre à zéro par surprise', () => {
  const t = new DwellSessionTracker();
  t.sync(['a'], T0);
  t.sync(['a'], T0 + 1000);
  t.sync(['a'], T0 + 2000);
  assert.deepEqual(t.sync([], T0 + 3000), [{ id: 'a', dwellMs: 3000 }]);
});

test('un passage sous le seuil n’est pas émis', () => {
  const t = new DwellSessionTracker();
  t.sync(['a'], T0);
  assert.deepEqual(t.sync([], T0 + 400), [], 'un scroll rapide n’est pas une lecture');
});

test('deux passages courts se cumulent au lieu de se perdre', () => {
  const t = new DwellSessionTracker();
  t.sync(['a'], T0);
  assert.deepEqual(t.sync([], T0 + 600), []);
  t.sync(['a'], T0 + 2000);
  // 600 + 600 = 1200 ms, au-dessus du seuil : le résidu n'a pas été jeté.
  assert.deepEqual(t.sync([], T0 + 2600), [{ id: 'a', dwellMs: 1200 }]);
});

test('un segment émis ne recompte pas le temps déjà envoyé', () => {
  const t = new DwellSessionTracker();
  t.sync(['a'], T0);
  assert.deepEqual(t.sync([], T0 + 3000), [{ id: 'a', dwellMs: 3000 }]);
  t.sync(['a'], T0 + 4000);
  assert.deepEqual(t.sync([], T0 + 6000), [{ id: 'a', dwellMs: 2000 }], 'seulement le nouveau temps');
});

test('plusieurs tweets sont suivis indépendamment', () => {
  const t = new DwellSessionTracker();
  t.sync(['a', 'b'], T0);
  t.sync(['b', 'c'], T0 + 2000);
  const out = t.sync([], T0 + 5000).sort((x, y) => x.id.localeCompare(y.id));
  assert.deepEqual(out, [
    { id: 'b', dwellMs: 5000 },
    { id: 'c', dwellMs: 3000 },
  ]);
});

test('pause : le temps en arrière-plan n’est jamais compté', () => {
  const t = new DwellSessionTracker();
  t.sync(['a'], T0);
  assert.deepEqual(t.pause(T0 + 3000), [{ id: 'a', dwellMs: 3000 }]);

  // Huit heures plus tard, l'app revient : rien de ce trou ne doit compter.
  t.sync(['a'], T0 + 3000 + 8 * 3600 * 1000);
  assert.deepEqual(t.sync([], T0 + 3000 + 8 * 3600 * 1000 + 2000), [{ id: 'a', dwellMs: 2000 }]);
});

test('pause sur une liste vide ne produit rien', () => {
  const t = new DwellSessionTracker();
  assert.deepEqual(t.pause(T0), []);
  assert.deepEqual(t.pause(T0 + 1000), []);
});

test('une durée aberrante est plafonnée', () => {
  const t = new DwellSessionTracker();
  t.sync(['a'], T0);
  assert.deepEqual(t.sync([], T0 + 3 * 3600 * 1000), [{ id: 'a', dwellMs: MAX_DWELL_MS }]);
});

test('le cumul par tweet et par session est plafonné lui aussi', () => {
  const t = new DwellSessionTracker();
  // Deux passages qui atteignent chacun le plafond : le second n'ajoute rien.
  t.sync(['a'], T0);
  const first = t.sync([], T0 + MAX_DWELL_MS);
  assert.deepEqual(first, [{ id: 'a', dwellMs: MAX_DWELL_MS }]);

  t.sync(['a'], T0 + MAX_DWELL_MS + 1000);
  assert.deepEqual(t.sync([], T0 + 2 * MAX_DWELL_MS + 1000), [], 'plafond de session atteint');
});

test('une horloge qui recule ne produit pas de durée négative', () => {
  const t = new DwellSessionTracker();
  t.sync(['a'], T0);
  assert.deepEqual(t.sync([], T0 - 5000), [], 'jamais de segment négatif');
});

test('les identifiants vides sont ignorés', () => {
  const t = new DwellSessionTracker();
  t.sync(['', null, undefined, 'a'], T0);
  assert.deepEqual(t.sync([], T0 + 2000), [{ id: 'a', dwellMs: 2000 }]);
});

test('reset oublie tout, y compris les résidus', () => {
  const t = new DwellSessionTracker();
  t.sync(['a'], T0);
  t.sync([], T0 + 600); // résidu sous le seuil
  t.reset();
  t.sync(['a'], T0 + 2000);
  assert.deepEqual(t.sync([], T0 + 2600), [], 'le résidu d’avant le reset ne compte plus');
});

test('les seuils exposés sont ceux que le serveur applique', () => {
  // `dwellMirror.js` côté API refuse en dessous de 1 s et plafonne à 600 s.
  // Les deux bornes doivent coïncider, sinon l'app envoie pour rien.
  assert.equal(MIN_DWELL_MS, 1000);
  assert.equal(MAX_DWELL_MS, 600000);
});

test('activeCount reflète ce qui est en cours de mesure', () => {
  const t = new DwellSessionTracker();
  assert.equal(t.activeCount(), 0);
  t.sync(['a', 'b'], T0);
  assert.equal(t.activeCount(), 2);
  t.sync(['a'], T0 + 1000);
  assert.equal(t.activeCount(), 1);
  t.pause(T0 + 2000);
  assert.equal(t.activeCount(), 0);
});

/**
 * Le defaut qui a motive `flush` : `onViewableItemsChanged` ne parle que
 * lorsque la visibilite CHANGE. Un tweet regarde longuement sans que rien ne
 * bouge a l'ecran ne produisait donc aucune sortie, donc aucun segment — la
 * lecture la plus attentive etait exactement celle qui ne comptait pas.
 */
test('flush émet le temps en cours sans attendre la sortie', () => {
  const t = new DwellSessionTracker();
  t.sync(['a'], T0);
  assert.deepEqual(t.flush(T0 + 10000), [{ id: 'a', dwellMs: 10000 }]);
});

test('flush ne coupe pas la mesure : le chronomètre repart de l’instant du flush', () => {
  const t = new DwellSessionTracker();
  t.sync(['a'], T0);
  t.flush(T0 + 10000);
  // Le temps continue d'être compté, sans recompter les 10 s déjà envoyées.
  assert.deepEqual(t.sync([], T0 + 15000), [{ id: 'a', dwellMs: 5000 }]);
  assert.equal(t.activeCount(), 0);
});

test('flush répété n’envoie pas deux fois le même temps', () => {
  const t = new DwellSessionTracker();
  t.sync(['a'], T0);
  assert.deepEqual(t.flush(T0 + 5000), [{ id: 'a', dwellMs: 5000 }]);
  assert.deepEqual(t.flush(T0 + 5000), [], 'aucun temps neuf : rien à envoyer');
  assert.deepEqual(t.flush(T0 + 7000), [{ id: 'a', dwellMs: 2000 }]);
});

test('flush laisse tourner ce qui n’atteint pas encore le seuil', () => {
  const t = new DwellSessionTracker();
  t.sync(['a'], T0);
  assert.deepEqual(t.flush(T0 + 500), [], 'trop court pour être envoyé');
  assert.equal(t.activeCount(), 1, 'mais toujours en cours de mesure');
  assert.deepEqual(t.flush(T0 + 1600), [{ id: 'a', dwellMs: 1600 }], 'le résidu est conservé');
});

test('flush sur un tweet qui n’est plus visible ne le ressuscite pas', () => {
  const t = new DwellSessionTracker();
  t.sync(['a'], T0);
  t.sync([], T0 + 3000);
  assert.deepEqual(t.flush(T0 + 9000), [], 'plus rien ne tourne');
  assert.equal(t.activeCount(), 0);
});

test('flush respecte le plafond de session', () => {
  const t = new DwellSessionTracker();
  t.sync(['a'], T0);
  assert.deepEqual(t.flush(T0 + MAX_DWELL_MS), [{ id: 'a', dwellMs: MAX_DWELL_MS }]);
  assert.deepEqual(t.flush(T0 + 2 * MAX_DWELL_MS), [], 'plafond atteint');
});
