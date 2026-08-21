/**
 * Le relevé d'écoute repose sur deux modules purs : la mise en forme des
 * durées et la reconstruction des semaines d'attention. Les deux décident de
 * ce que le créateur LIT comme étant son temps de lecture et sa rémunération,
 * donc les deux sont vérifiés ici plutôt que constatés à l'œil sur un écran.
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

const { duration, durationInline, compact, signedPercent, rank, trim } = loadTypeScriptModule(
  'src/components/stats/format.ts',
);
const { buildAttentionWeeks, summarizeAttention, weeksForTimeframe } = loadTypeScriptModule(
  'src/components/stats/attention.ts',
);
const { mergeDays, bucketDays, rpmOf, summarizeDailyDwell, EMPTY_DAY } = loadTypeScriptModule(
  'src/components/stats/daily.ts',
);

/**
 * Toutes les espaces insécables valent une espace ordinaire dans les
 * comparaisons : `toLocaleString('fr-FR')` sépare les milliers par U+202F sur
 * un ICU récent et par U+00A0 sur un plus ancien, et `format.ts` colle ses
 * unités avec U+00A0. Épingler l'un des trois ferait échouer le test sur une
 * version de Node, pas sur une régression.
 */
const sp = (value) => String(value).replace(/[   ]/g, ' ');
const eq = (actual, expected) => assert.equal(sp(actual), expected);
const MINUS = '−';

/* ------------------------------------------------------------------ */
/* Durées                                                              */
/* ------------------------------------------------------------------ */

test('duration change d’unite avec l’ordre de grandeur', () => {
  assert.deepEqual(duration(400), { value: '0', unit: 's' });
  assert.deepEqual(duration(12_400), { value: '12,4', unit: 's' });
  // Sous dix minutes, l'entier mentirait d'un tiers sur 90 s.
  assert.deepEqual(duration(90_000), { value: '1,5', unit: 'min' });
  assert.deepEqual(duration(1_800_000), { value: '30', unit: 'min' });
  eq(duration(3_600_000).value, '1 h 00');
  assert.equal(duration(3_600_000).unit, '');
});

test('duration ne fabrique jamais 4 h 60', () => {
  // 3 h 59 min 42 s : les minutes arrondissent a 60, l'heure doit avancer.
  eq(duration(3 * 3_600_000 + 59 * 60_000 + 42_000).value, '4 h 00');
});

test('duration remplit les minutes sur deux chiffres', () => {
  eq(duration(4 * 3_600_000 + 7 * 60_000).value, '4 h 07');
  eq(duration(4 * 3_600_000 + 12 * 60_000).value, '4 h 12');
});

test('duration neutralise le negatif et le non-fini', () => {
  assert.deepEqual(duration(-5000), { value: '0', unit: 's' });
  assert.deepEqual(duration(NaN), { value: '0', unit: 's' });
  assert.deepEqual(duration(Infinity), { value: '0', unit: 's' });
});

test('durationInline recolle la valeur et son unite', () => {
  eq(durationInline(12_400), '12,4 s');
  // Au-dela de l'heure, la valeur porte deja son unite : pas de suffixe colle.
  eq(durationInline(3_600_000), '1 h 00');
});

/* ------------------------------------------------------------------ */
/* Chiffres                                                            */
/* ------------------------------------------------------------------ */

test('compact n’abrege qu’a partir de dix mille', () => {
  eq(compact(999), '999');
  eq(compact(9_999), '9 999');
  eq(compact(12_400), '12,4 k');
  eq(compact(1_500_000), '1,5 M');
});

test('signedPercent avoue l’absence de comparaison au lieu de l’inventer', () => {
  assert.equal(signedPercent(null), null);
  assert.equal(signedPercent(NaN), null);
  eq(signedPercent(0.184), '+18,4 %');
  eq(signedPercent(-0.05), MINUS + '5 %');
  // Sous un demi-point, « +0,1 % » n'est pas une information.
  assert.equal(signedPercent(0.001), 'stable');
});

test('rank ecrit le rang, borne a l’intervalle', () => {
  eq(rank(0.82), '82e /100');
  eq(rank(0.01), '1er /100');
  eq(rank(1.4), '100e /100');
  assert.equal(rank(null), null);
});

test('trim coupe a une decimale sans zero inutile', () => {
  assert.equal(trim(12), '12');
  assert.equal(trim(12.44), '12,4');
});

/* ------------------------------------------------------------------ */
/* Semaines d'attention                                                */
/* ------------------------------------------------------------------ */

const week = (key, start, attentionMs, measurableViews, rpm, extra = {}) => ({
  periodKey: key,
  periodStart: start,
  periodEnd: start,
  amount: 0,
  qualifiedViews: 0,
  quality: 0,
  rpm,
  bonusMultiplier: 1,
  status: 'claimed',
  claimedAt: null,
  breakdown: {
    rates: { attention: attentionMs },
    percentiles: { attention: 0.7 },
    measurableViews,
    hasRealDwell: true,
    ...extra,
  },
});

const dashboard = (history, projection = null) => ({
  currency: { id: 'c', symbol: 'NF', name: 'NF' },
  now: '2026-08-21T00:00:00.000Z',
  currentPeriod: {
    key: '2026-W34',
    start: '2026-08-17T00:00:00.000Z',
    end: '2026-08-23T00:00:00.000Z',
    pool: {},
    cohortSize: 10,
    projection,
  },
  claimable: { count: 0, total: 0, periods: [] },
  history,
  weights: {},
  bonusCatalog: [],
});

test('buildAttentionWeeks rend une liste vide sans relevé', () => {
  assert.deepEqual(buildAttentionWeeks(null, 4), []);
  assert.deepEqual(buildAttentionWeeks(dashboard([]), 4), []);
});

test('buildAttentionWeeks remet les semaines dans l’ordre chronologique', () => {
  const built = buildAttentionWeeks(
    dashboard([
      week('W32', '2026-08-03T00:00:00.000Z', 10_000, 100, 1),
      week('W30', '2026-07-20T00:00:00.000Z', 8_000, 50, 0.5),
      week('W31', '2026-07-27T00:00:00.000Z', 9_000, 80, 0.8),
    ]),
    10,
  );
  assert.deepEqual(
    built.map((w) => w.key),
    ['W30', 'W31', 'W32'],
  );
});

test('le temps total d’une semaine est la durée par vue fois les vues mesurables', () => {
  const [only] = buildAttentionWeeks(
    dashboard([week('W32', '2026-08-03T00:00:00.000Z', 12_000, 250, 1.4)]),
    4,
  );
  assert.equal(only.msPerView, 12_000);
  assert.equal(only.measurableViews, 250);
  assert.equal(only.totalMs, 3_000_000);
  assert.equal(only.measured, true);
  assert.equal(only.inProgress, false);
});

test('la semaine en cours arrive en dernier et se signale comme non close', () => {
  const built = buildAttentionWeeks(
    dashboard([week('W33', '2026-08-10T00:00:00.000Z', 10_000, 100, 1)], {
      rpm: 1.6,
      rates: { attention: 14_000 },
      percentiles: { attention: 0.9 },
      measurableViews: 60,
      hasRealDwell: false,
    }),
    10,
  );
  assert.equal(built.length, 2);
  const current = built[built.length - 1];
  assert.equal(current.key, '2026-W34');
  assert.equal(current.inProgress, true);
  assert.equal(current.measured, false);
  assert.equal(current.totalMs, 14_000 * 60);
});

test('la limite garde les semaines les plus RÉCENTES, pas les premières', () => {
  const history = [
    week('W30', '2026-07-20T00:00:00.000Z', 1_000, 10, 0.1),
    week('W31', '2026-07-27T00:00:00.000Z', 2_000, 10, 0.2),
    week('W32', '2026-08-03T00:00:00.000Z', 3_000, 10, 0.3),
    week('W33', '2026-08-10T00:00:00.000Z', 4_000, 10, 0.4),
  ];
  assert.deepEqual(
    buildAttentionWeeks(dashboard(history), 2).map((w) => w.key),
    ['W32', 'W33'],
  );
});

test('une donnée manquante vaut zéro, jamais NaN', () => {
  const [only] = buildAttentionWeeks(
    dashboard([
      {
        periodKey: 'W32',
        periodStart: '2026-08-03T00:00:00.000Z',
        periodEnd: '2026-08-09T00:00:00.000Z',
        rpm: 'pas un nombre',
        breakdown: null,
      },
    ]),
    4,
  );
  assert.equal(only.msPerView, 0);
  assert.equal(only.totalMs, 0);
  assert.equal(only.rpm, 0);
  assert.equal(only.attentionRank, null);
  assert.equal(only.measured, false);
});

test('weeksForTimeframe traduit la période en semaines de relevé', () => {
  assert.equal(weeksForTimeframe('7d'), 1);
  assert.equal(weeksForTimeframe('30d'), 4);
  assert.equal(weeksForTimeframe('90d'), 13);
  assert.equal(weeksForTimeframe('1y'), 52);
});

/* ------------------------------------------------------------------ */
/* Résumé                                                              */
/* ------------------------------------------------------------------ */

const built = (msPerView, views, rpm, key) => ({
  key,
  start: '2026-08-03T00:00:00.000Z',
  end: '2026-08-09T00:00:00.000Z',
  msPerView,
  measurableViews: views,
  totalMs: msPerView * views,
  rpm,
  attentionRank: 0.6,
  measured: true,
  inProgress: false,
});

test('la durée moyenne est pondérée par les vues, pas la moyenne des moyennes', () => {
  // 10 s sur 100 vues et 20 s sur 900 vues font 19 s en moyenne, pas 15.
  const summary = summarizeAttention([built(10_000, 100, 1, 'a'), built(20_000, 900, 1, 'b')]);
  assert.equal(summary.totalMs, 10_000 * 100 + 20_000 * 900);
  assert.equal(summary.msPerView, summary.totalMs / 1000);
  assert.equal(summary.measurableViews, 1000);
});

test('la variation reste nulle tant qu’il n’y a pas autant de semaines à comparer', () => {
  const current = [built(10_000, 100, 1, 'a'), built(10_000, 100, 1, 'b')];
  // Une seule semaine précédente pour deux semaines courantes : comparer
  // reviendrait à annoncer une chute qui n'est qu'une période plus courte.
  assert.equal(summarizeAttention(current, [built(10_000, 100, 1, 'z')]).deltaRatio, null);
  assert.equal(summarizeAttention(current, []).deltaRatio, null);
});

test('la variation se calcule sur des blocs de même longueur', () => {
  const current = [built(10_000, 100, 1, 'a'), built(10_000, 100, 1, 'b')]; // 2 000 000 ms
  const previous = [built(10_000, 50, 1, 'y'), built(10_000, 50, 1, 'z')]; // 1 000 000 ms
  assert.equal(summarizeAttention(current, previous).deltaRatio, 1);
});

test('le RPM affiché est celui de la dernière semaine, et sa variation la précédente', () => {
  const summary = summarizeAttention([built(10_000, 100, 0.8, 'a'), built(10_000, 100, 1.2, 'b')]);
  assert.equal(summary.latestRpm, 1.2);
  assert.equal(Math.round(summary.rpmDeltaRatio * 100) / 100, 0.5);
});

test('un RPM précédent nul ne produit pas une division par zéro', () => {
  const summary = summarizeAttention([built(10_000, 100, 0, 'a'), built(10_000, 100, 1.2, 'b')]);
  assert.equal(summary.rpmDeltaRatio, null);
});

test('measured est vrai dès qu’une seule semaine a été chronométrée', () => {
  const estimated = { ...built(10_000, 100, 1, 'a'), measured: false };
  assert.equal(summarizeAttention([estimated]).measured, false);
  assert.equal(summarizeAttention([estimated, built(10_000, 100, 1, 'b')]).measured, true);
});

/* ------------------------------------------------------------------ */
/* Journees                                                            */
/* ------------------------------------------------------------------ */

const day = (date, over = {}) => ({ ...EMPTY_DAY, date, ...over });

test('mergeDays somme les composantes brutes et garde la premiere date', () => {
  const merged = mergeDays([
    day('2026-08-01', { views: 100, dwellMs: 10_000, dwellEvents: 4, earnings: 1.5 }),
    day('2026-08-02', { views: 300, dwellMs: 50_000, dwellEvents: 9, earnings: 2.5 }),
  ]);
  assert.equal(merged.date, '2026-08-01');
  assert.equal(merged.views, 400);
  assert.equal(merged.dwellMs, 60_000);
  assert.equal(merged.dwellEvents, 13);
  assert.equal(merged.earnings, 4);
});

test('mergeDays sur une liste vide rend une journee neutre', () => {
  assert.deepEqual(mergeDays([]), EMPTY_DAY);
});

test('le RPM est un rapport : il se recalcule sur les totaux, il ne se moyenne pas', () => {
  // Jour A : 1 NF pour 100 vues -> RPM 10. Jour B : 1 NF pour 900 vues -> RPM 1,11.
  // La moyenne des deux RPM ferait 5,56 ; le vrai RPM de la periode est 2.
  const a = day('2026-08-01', { views: 100, earnings: 1 });
  const b = day('2026-08-02', { views: 900, earnings: 1 });
  assert.equal(Math.round(rpmOf(a) * 100) / 100, 10);
  assert.equal(Math.round(rpmOf(b) * 100) / 100, 1.11);
  assert.equal(rpmOf(mergeDays([a, b])), 2);
});

test('un RPM sans vue vaut zero, jamais une division par zero', () => {
  assert.equal(rpmOf(day('2026-08-01', { views: 0, earnings: 5 })), 0);
});

test('bucketDays laisse un jour par colonne tant que ca tient', () => {
  const days = Array.from({ length: 30 }, (_, i) => day(`2026-08-${String(i + 1).padStart(2, '0')}`));
  const buckets = bucketDays(days, 62);
  assert.equal(buckets.length, 30);
  assert.equal(buckets[0].days, 1);
  assert.equal(buckets[0].from, buckets[0].to);
});

test('bucketDays regroupe au-dela du plafond sans jamais le depasser', () => {
  const days = Array.from({ length: 365 }, (_, i) =>
    day(`d${i}`, { views: 10, earnings: 1, dwellMs: 1000, dwellEvents: 1 }),
  );
  const buckets = bucketDays(days, 62);
  assert.ok(buckets.length <= 62, `${buckets.length} colonnes`);
  // Aucune journee perdue ni comptee deux fois.
  assert.equal(buckets.reduce((sum, b) => sum + b.days, 0), 365);
  assert.equal(buckets.reduce((sum, b) => sum + b.point.views, 0), 3650);
});

test('bucketDays garde l’ordre et borne correctement chaque paquet', () => {
  const days = Array.from({ length: 10 }, (_, i) => day(`j${i}`));
  const buckets = bucketDays(days, 3);
  assert.equal(buckets.length, 3);
  assert.equal(buckets[0].from, 'j0');
  assert.equal(buckets[0].to, 'j3');
  // Le dernier paquet est plus court : c'est la periode recente, elle n'est
  // pas diluee dans un paquet complete artificiellement.
  assert.equal(buckets[2].from, 'j8');
  assert.equal(buckets[2].to, 'j9');
  assert.equal(buckets[2].days, 2);
});

test('bucketDays rend une liste vide sans journee', () => {
  assert.deepEqual(bucketDays([], 62), []);
});

/* ------------------------------------------------------------------ */
/* Resume du temps de lecture                                          */
/* ------------------------------------------------------------------ */

test('summarizeDailyDwell rapporte le temps lu aux vues totales', () => {
  const summary = summarizeDailyDwell([
    day('2026-08-01', { views: 100, dwellMs: 600_000, dwellEvents: 40 }),
    day('2026-08-02', { views: 300, dwellMs: 600_000, dwellEvents: 50 }),
  ]);
  assert.equal(summary.totalMs, 1_200_000);
  assert.equal(summary.views, 400);
  assert.equal(summary.msPerView, 3000);
  assert.equal(summary.perDayMs, 600_000);
  assert.equal(summary.measured, true);
});

test('zero evenement de lecture n’est pas la meme chose que zero seconde lue', () => {
  const nothing = summarizeDailyDwell([day('2026-08-01', { views: 500 })]);
  assert.equal(nothing.measured, false);
  assert.equal(nothing.totalMs, 0);
  // Une mesure existe, elle vaut zero : l'ecran doit pouvoir le dire.
  const measuredZero = summarizeDailyDwell([day('2026-08-01', { views: 500, dwellEvents: 3 })]);
  assert.equal(measuredZero.measured, true);
});

test('la variation compare les deux moities de la periode', () => {
  const summary = summarizeDailyDwell([
    day('2026-08-01', { dwellMs: 1000, dwellEvents: 1 }),
    day('2026-08-02', { dwellMs: 1000, dwellEvents: 1 }),
    day('2026-08-03', { dwellMs: 3000, dwellEvents: 1 }),
    day('2026-08-04', { dwellMs: 3000, dwellEvents: 1 }),
  ]);
  assert.equal(summary.deltaRatio, 2);
});

test('pas de variation quand la premiere moitie est vide ou absente', () => {
  assert.equal(summarizeDailyDwell([]).deltaRatio, null);
  assert.equal(summarizeDailyDwell([day('2026-08-01', { dwellMs: 500 })]).deltaRatio, null);
  assert.equal(
    summarizeDailyDwell([day('a', { dwellMs: 0 }), day('b', { dwellMs: 900 })]).deltaRatio,
    null,
  );
});

test('summarizeDailyDwell ne divise pas par zero sans vue', () => {
  const summary = summarizeDailyDwell([day('2026-08-01', { dwellMs: 5000, dwellEvents: 2 })]);
  assert.equal(summary.msPerView, 0);
  assert.equal(summary.perDayMs, 5000);
});
