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

const {
  num,
  money,
  compact,
  percent,
  timeUntil,
  periodLabel,
  shortDate,
  fullDate,
  deltaRatio,
  signedPercent,
} = loadTypeScriptModule('src/components/monetization/format.ts');

const NBSP = ' ';

/** Construit un ISO qui retombe sur le jour civil voulu quel que soit le fuseau. */
const localIso = (y, monthIndex, day) => new Date(y, monthIndex, day).toISOString();

test('num neutralise tout ce qui n’est pas un nombre fini', () => {
  assert.equal(num(12), 12);
  assert.equal(num('12.5'), 12.5);
  assert.equal(num(undefined), 0);
  assert.equal(num(null), 0);
  assert.equal(num('abc'), 0);
  assert.equal(num(NaN), 0);
  assert.equal(num(Infinity), 0);
  assert.equal(num(undefined, 3), 3);
});

test('money groupe les milliers avec une espace insécable et une virgule décimale', () => {
  assert.equal(money(1240.5), `1${NBSP}240,50`);
  assert.equal(money(0), '0,00');
  assert.equal(money(1234567.891), `1${NBSP}234${NBSP}567,89`);
  assert.equal(money(42, 0), '42');
});

test('money ne dépend pas d’Intl : le séparateur est toujours le même', () => {
  // Hermes et Node n'ont pas la même table ICU ; un montant ne doit pas
  // changer d'apparence entre le simulateur et le téléphone. La seule virgule
  // admise est la décimale — jamais un séparateur de milliers à l'anglaise.
  assert.equal(money(1000, 0), `1${NBSP}000`);
  assert.ok(!money(1000, 0).includes(','), 'pas de virgule de milliers');
  assert.ok(money(1000).includes(NBSP), 'espace insécable attendue');
  assert.equal(money(1000).split(',').length, 2, 'une seule virgule, la décimale');
});

test('money arrondit au lieu de tronquer', () => {
  assert.equal(money(1.005), '1,01');
  assert.equal(money(0.994), '0,99');
  assert.equal(money(9.999), '10,00');
});

test('money gère le négatif', () => {
  assert.equal(money(-1240.5), `−1${NBSP}240,50`);
});

test('compact abrège au-dessus du millier', () => {
  assert.equal(compact(999), '999');
  assert.equal(compact(1000), `1${NBSP}k`);
  assert.equal(compact(1234), `1,2${NBSP}k`);
  assert.equal(compact(999999), `1${NBSP}M`);
  assert.equal(compact(3400000), `3,4${NBSP}M`);
  assert.equal(compact(undefined), '0');
});

test('percent arrondit et colle une espace insécable au signe', () => {
  assert.equal(percent(0.7234), `72${NBSP}%`);
  assert.equal(percent(1), `100${NBSP}%`);
  assert.equal(percent(undefined), `0${NBSP}%`);
  assert.equal(percent(0.004, 1), `0,4${NBSP}%`);
});

test('timeUntil rend une durée lisible, jamais un compte à rebours faux', () => {
  const inThreeDays = new Date(Date.now() + 3 * 86400000 + 4 * 3600000).toISOString();
  assert.match(timeUntil(inThreeDays), /^3 j 0[34] h$/);

  const inTwoHours = new Date(Date.now() + 2 * 3600000 + 5 * 60000).toISOString();
  assert.match(timeUntil(inTwoHours), /^2 h 0[45] min$/);

  const inTenMinutes = new Date(Date.now() + 10 * 60000).toISOString();
  assert.match(timeUntil(inTenMinutes), /^(9|10) min$/);
});

test('timeUntil : une échéance passée ou absente ne ment pas', () => {
  assert.equal(timeUntil(new Date(Date.now() - 1000).toISOString()), 'imminente');
  assert.equal(timeUntil(undefined), '—');
  assert.equal(timeUntil('pas une date'), '—');
});

test('periodLabel fusionne le mois quand les deux bornes le partagent', () => {
  // La borne de fin est exclusive côté serveur : le 18 affiche « 17 ».
  assert.equal(periodLabel(localIso(2026, 7, 11), localIso(2026, 7, 18)), '11 – 17 août');
});

test('periodLabel garde les deux mois quand la semaine est à cheval', () => {
  assert.equal(periodLabel(localIso(2026, 6, 28), localIso(2026, 7, 4)), '28 juil. – 3 août');
});

test('periodLabel se contente de la date de début si la fin manque', () => {
  assert.equal(periodLabel(localIso(2026, 7, 11)), '11 août');
  assert.equal(periodLabel(undefined), '');
});

test('deltaRatio compare deux semaines sans jamais diviser par zéro', () => {
  assert.equal(deltaRatio(120, 100), 0.2);
  assert.equal(deltaRatio(80, 100), -0.2);
  assert.equal(deltaRatio(100, 0), null, 'aucune base de comparaison');
  assert.equal(deltaRatio(100, undefined), null);
  assert.equal(deltaRatio(undefined, 100), -1);
});

test('signedPercent porte toujours son signe', () => {
  assert.equal(signedPercent(0.18), `+18${NBSP}%`);
  assert.equal(signedPercent(-0.12), `−12${NBSP}%`);
  assert.equal(signedPercent(0), `+0${NBSP}%`);
  assert.equal(signedPercent(null), '');
});

test('shortDate rend un repère de deux nombres, toujours sur deux chiffres', () => {
  assert.equal(shortDate(localIso(2026, 7, 3)), '03/08');
  assert.equal(shortDate(localIso(2026, 10, 25)), '25/11');
  assert.equal(shortDate(undefined), '');
  assert.equal(shortDate('pas une date'), '');
});

test('fullDate écrit le mois en toutes lettres', () => {
  assert.equal(fullDate(localIso(2026, 7, 17)), '17 août 2026');
  assert.equal(fullDate(undefined), '');
  assert.equal(fullDate('pas une date'), '');
});
