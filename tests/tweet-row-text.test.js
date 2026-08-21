/**
 * Fonctions de texte de la ligne du fil 2B (`src/components/feed/paper2b/tweetRowText.ts`).
 *
 * L'enjeu réel est `canSkipTruncationMeasure` : elle décide si la ligne se
 * dispense de rendre son texte une SECONDE fois hors écran pour savoir s'il
 * faut proposer « Voir plus ». Se tromper dans le sens permissif fait
 * DISPARAÎTRE le bouton d'un tweet réellement tronqué, sans qu'aucune
 * compilation ne le voie — d'où les cas limites ci-dessous.
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

const {
  formatCompactCount,
  formatRelativeDate,
  canSkipTruncationMeasure,
  TRUNCATION_LINES,
} = loadTypeScriptModule('src/components/feed/paper2b/tweetRowText.ts');

// ─── Compteurs de la gouttière ──────────────────────────────────────────────

test('zéro ne rend rien du tout, pas « 0 »', () => {
  assert.equal(formatCompactCount(0), '');
});

test('sous mille, le nombre est écrit tel quel', () => {
  assert.equal(formatCompactCount(1), '1');
  assert.equal(formatCompactCount(999), '999');
});

test('à partir de mille, on passe au millier abrégé', () => {
  assert.equal(formatCompactCount(1000), '1.0k');
  assert.equal(formatCompactCount(12_400), '12.4k');
});

test('à partir du million, on passe au million abrégé', () => {
  assert.equal(formatCompactCount(1_000_000), '1.0M');
  assert.equal(formatCompactCount(2_500_000), '2.5M');
});

// ─── Horodatage relatif ─────────────────────────────────────────────────────

const NOW = Date.parse('2026-08-21T12:00:00.000Z');
const agoMs = (ms) => new Date(NOW - ms).toISOString();

test('moins d’une minute se dit en secondes', () => {
  assert.equal(formatRelativeDate(agoMs(5_000), NOW), '5 s');
});

test('moins d’une heure se dit en minutes', () => {
  assert.equal(formatRelativeDate(agoMs(5 * 60_000), NOW), '5 min');
});

test('moins d’un jour se dit en heures', () => {
  assert.equal(formatRelativeDate(agoMs(5 * 3_600_000), NOW), '5 h');
});

test('au-delà d’un jour, on bascule sur une date — et plus sur un écart', () => {
  const label = formatRelativeDate(agoMs(3 * 86_400_000), NOW);
  assert.ok(!/\b(s|min|h)$/.test(label), `attendu une date, reçu « ${label} »`);
});

// ─── Raccourci de mesure de troncature ──────────────────────────────────────

test('le seuil de troncature reste celui des styles (4 lignes)', () => {
  assert.equal(TRUNCATION_LINES, 4);
});

test('un texte vide ou absent n’a rien à mesurer', () => {
  assert.equal(canSkipTruncationMeasure(''), true);
  assert.equal(canSkipTruncationMeasure(null), true);
  assert.equal(canSkipTruncationMeasure(undefined), true);
});

test('un tweet court se passe de la mesure', () => {
  assert.equal(canSkipTruncationMeasure('Bonjour tout le monde'), true);
});

test('un tweet long est TOUJOURS mesuré', () => {
  assert.equal(canSkipTruncationMeasure('a'.repeat(49)), false);
  assert.equal(canSkipTruncationMeasure('x'.repeat(400)), false);
});

test('un texte court mais criblé de sauts de ligne est mesuré', () => {
  // Cinq lignes de deux caractères : court, et pourtant tronqué.
  assert.equal(canSkipTruncationMeasure('un\ndeux\ntrois\nquatre\ncinq'), false);
});

test('un seul saut de ligne reste tolérable dans le raccourci', () => {
  assert.equal(canSkipTruncationMeasure('Salut\nça va ?'), true);
});

test('le raccourci est pessimiste : il ne se déclenche jamais au-delà du plafond', () => {
  // Le pire cas typographique réel — que des capitales larges.
  const worstCase = 'M'.repeat(48);
  assert.equal(worstCase.length, 48);
  assert.equal(canSkipTruncationMeasure(worstCase), true);
  assert.equal(canSkipTruncationMeasure(worstCase + 'M'), false);
});
