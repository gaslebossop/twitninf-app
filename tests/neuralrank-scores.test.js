/**
 * Recollage des scores du moteur sur les tweets servis.
 *
 * Le point qui compte : la fonction doit être INOFFENSIVE tant que l'API ne
 * relaie pas le champ. Elle est écrite avant son producteur, elle vivra donc
 * un temps sans jamais rien recevoir.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const Module = require('node:module');
const ts = require('typescript');

/**
 * `neuralRankService.ts` importe `./api`, que ce chargeur ne sait pas
 * résoudre. On ne charge donc que la fonction pure, extraite du fichier : le
 * test reste sur le vrai source, sans monter la moitié de l'app.
 */
function loadPureExport(path, exportName) {
  const source = readFileSync(path, 'utf8');
  const start = source.indexOf(`export function ${exportName}`);
  if (start === -1) throw new Error(`${exportName} introuvable dans ${path}`);
  const end = source.indexOf('\n}\n', start) + 3;
  const output = ts.transpileModule(source.slice(start, end), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const loaded = new Module(path, module);
  loaded.filename = path;
  loaded.paths = module.paths;
  loaded._compile(output, path);
  return loaded.exports[exportName];
}

const withRecommendationScores = loadPureExport(
  'src/services/neuralRankService.ts',
  'withRecommendationScores',
);

const tweets = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];

test('sans scores, la liste ressort telle quelle', () => {
  assert.equal(withRecommendationScores(tweets), tweets);
  assert.equal(withRecommendationScores(tweets, null), tweets);
  assert.equal(withRecommendationScores(tweets, []), tweets);
});

test('un champ mal forme ne casse rien', () => {
  assert.equal(withRecommendationScores(tweets, 'pas-un-tableau'), tweets);
  assert.equal(withRecommendationScores(tweets, [{ score: 1 }]), tweets);
});

test('le score et la confiance se posent sur le bon tweet', () => {
  const out = withRecommendationScores(tweets, [
    { tweet_id: 'b', score: 0.42, confidence: 0.31 },
  ]);
  assert.equal(out[0]._recommendation_confidence, undefined);
  assert.equal(out[1]._recommendation_score, 0.42);
  assert.equal(out[1]._recommendation_confidence, 0.31);
  assert.equal(out[2]._recommendation_confidence, undefined);
});

test('un identifiant numerique se recolle quand meme', () => {
  const out = withRecommendationScores([{ id: 7 }], [
    { tweet_id: '7', score: 0.9, confidence: 0.8 },
  ]);
  assert.equal(out[0]._recommendation_confidence, 0.8);
});

test('une confiance a zero reste zero, elle ne devient pas absente', () => {
  const out = withRecommendationScores([{ id: 'a' }], [
    { tweet_id: 'a', score: 0.5, confidence: 0 },
  ]);
  assert.equal(out[0]._recommendation_confidence, 0);
});

test('les tweets d’origine ne sont pas mutes', () => {
  const source = [{ id: 'a' }];
  const out = withRecommendationScores(source, [
    { tweet_id: 'a', score: 0.5, confidence: 0.2 },
  ]);
  assert.equal(source[0]._recommendation_confidence, undefined);
  assert.notEqual(out[0], source[0]);
});
