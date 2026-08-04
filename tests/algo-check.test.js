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
  initialAlgoCheckState,
  shouldAskAt,
  afterAsk,
  afterInteraction,
  afterSilentView,
  SILENT_STREAK_BEFORE_ASK,
  MIN_GAP_BETWEEN_ASKS,
  MAX_ASKS_PER_SESSION,
  MIN_TWEETS_BEFORE_FIRST_ASK,
} = loadTypeScriptModule('src/utils/algoCheck.ts');

/** État d'un utilisateur qui fait défiler sans jamais rien toucher. */
const silentFor = (n) => {
  let state = initialAlgoCheckState();
  for (let i = 0; i < n; i += 1) state = afterSilentView(state);
  return state;
};

test('on ne demande rien à quelqu’un qui vient d’arriver', () => {
  const state = silentFor(SILENT_STREAK_BEFORE_ASK + 5);
  assert.equal(
    shouldAskAt({ index: MIN_TWEETS_BEFORE_FIRST_ASK - 1, tweetId: 't', state }),
    false,
  );
});

test('après une longue série sans interaction, la question se pose', () => {
  const state = silentFor(SILENT_STREAK_BEFORE_ASK);
  assert.equal(shouldAskAt({ index: 20, tweetId: 't', state }), true);
});

test('un utilisateur qui interagit n’est jamais interrompu', () => {
  // Il parle déjà à l'algorithme : la question n'apporterait rien.
  const state = afterInteraction(silentFor(SILENT_STREAK_BEFORE_ASK + 20));
  assert.equal(shouldAskAt({ index: 40, tweetId: 't', state }), false);
});

test('deux questions ne peuvent pas se suivre de près', () => {
  let state = silentFor(SILENT_STREAK_BEFORE_ASK);
  state = afterAsk(state, 20, 'premier');
  // Il redevient silencieux — en PARTANT de l'état d'après la question, sinon
  // on efface `lastAskIndex` et la règle qu'on cherche à vérifier ne
  // s'applique plus.
  for (let i = 0; i < SILENT_STREAK_BEFORE_ASK; i += 1) state = afterSilentView(state);

  assert.equal(
    shouldAskAt({ index: 20 + MIN_GAP_BETWEEN_ASKS - 1, tweetId: 'second', state }),
    false,
  );
  assert.equal(
    shouldAskAt({ index: 20 + MIN_GAP_BETWEEN_ASKS, tweetId: 'second', state }),
    true,
  );
});

test('le plafond de session est respecté', () => {
  let state = initialAlgoCheckState();
  let index = 20;
  for (let i = 0; i < MAX_ASKS_PER_SESSION; i += 1) {
    state = afterAsk(state, index, `t${i}`);
    index += MIN_GAP_BETWEEN_ASKS;
  }
  state = { ...state, silentStreak: SILENT_STREAK_BEFORE_ASK * 3 };
  assert.equal(shouldAskAt({ index, tweetId: 'un-de-trop', state }), false);
});

test('un tweet déjà soumis à la question ne revient pas', () => {
  let state = silentFor(SILENT_STREAK_BEFORE_ASK);
  state = afterAsk(state, 20, 'deja-vu');
  state = { ...state, silentStreak: SILENT_STREAK_BEFORE_ASK };
  assert.equal(
    shouldAskAt({ index: 20 + MIN_GAP_BETWEEN_ASKS, tweetId: 'deja-vu', state }),
    false,
  );
});

test('répondre remet le compteur de silence à zéro', () => {
  const state = afterAsk(silentFor(SILENT_STREAK_BEFORE_ASK), 20, 't');
  assert.equal(state.silentStreak, 0);
});

test('une hésitation avérée du recommandeur court-circuite la règle du silence', () => {
  // Le jour où la confiance descend jusqu'au client : même sans série
  // silencieuse, une confiance basse suffit à justifier la question.
  const state = initialAlgoCheckState();
  assert.equal(shouldAskAt({ index: 20, tweetId: 't', state, confidence: 0.2 }), true);
});

test('un recommandeur sûr de lui ne déclenche jamais la question', () => {
  const state = initialAlgoCheckState();
  assert.equal(shouldAskAt({ index: 20, tweetId: 't', state, confidence: 0.9 }), false);
});

test('une confiance absente (0) ne passe pas pour une hésitation', () => {
  // `_recommendation_confidence` vaut 0 tant que le signal ne traverse pas
  // l'API : sans cette garde, TOUS les tweets déclencheraient la question.
  const state = initialAlgoCheckState();
  assert.equal(shouldAskAt({ index: 20, tweetId: 't', state, confidence: 0 }), false);
});
