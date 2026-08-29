const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const Module = require('node:module');
const ts = require('typescript');

const appConfig = require('../app.config.js')({ config: {} });

/**
 * `deepLinks.ts` importe `react-native`, le conteneur de navigation et un
 * module TypeScript voisin — rien de tout cela ne se charge hors application
 * (le dernier parce que `require` relatif ne connaît pas l'extension `.ts`).
 * On les remplace par des objets posés directement dans le cache de `require`
 * — pas par des fichiers dans `tests/stubs/`, que le `.gitignore` du dépôt
 * avale (`*.js`).
 */
const STUBS = {
  'react-native': { Linking: { getInitialURL: async () => null, addEventListener: () => ({ remove() {} }) } },
  '../navigation/NavigationService': { navigationRef: { isReady: () => false, navigate: () => {} } },
  '../config/webUrl': { WEB_BASE_URL: 'https://twitninf.fr' },
};

for (const [id, exports] of Object.entries(STUBS)) {
  const stub = new Module(id, module);
  stub.filename = id;
  stub.loaded = true;
  stub.exports = exports;
  require.cache[id] = stub;
}

const originalResolve = Module._resolveFilename;
Module._resolveFilename = function patched(request, ...rest) {
  if (Object.prototype.hasOwnProperty.call(STUBS, request)) return request;
  return originalResolve.call(this, request, ...rest);
};

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

const { parseDeepLink } = loadTypeScriptModule('src/services/deepLinks.ts');

Module._resolveFilename = originalResolve;

// ── La règle ─────────────────────────────────────────────────────────────────
//
// Une notification de message doit atterrir DANS LA CONVERSATION, pas sur le
// site. Le serveur pousse `/messages/<id>` (Notification.createNotification),
// le site le traduit en `twitninf://conversation/<id>` (OpenInApp), et Android
// route directement l'adresse https quand les App Links sont vérifiés. Les
// trois orthographes doivent donc mener au même écran.

test('le schéma privé ouvre le fil de discussion', () => {
  assert.deepEqual(parseDeepLink('twitninf://conversation/abc-123'), {
    screen: 'ConversationThread',
    params: { conversationId: 'abc-123' },
  });
});

test("l'adresse du site ouvre le même fil — c'est elle que route Android", () => {
  assert.deepEqual(parseDeepLink('https://twitninf.fr/messages/abc-123'), {
    screen: 'ConversationThread',
    params: { conversationId: 'abc-123' },
  });
  assert.deepEqual(parseDeepLink('https://www.twitninf.fr/messages/abc-123?push=1'), {
    screen: 'ConversationThread',
    params: { conversationId: 'abc-123' },
  });
});

test('la liste des messages ne mène nulle part — il n’y a pas de fil à ouvrir', () => {
  assert.equal(parseDeepLink('https://twitninf.fr/messages'), null);
});

test('les liens déjà en place restent intacts', () => {
  assert.deepEqual(parseDeepLink('twitninf://tweet/42'), {
    screen: 'TweetDetail',
    params: { tweetId: '42' },
  });
  assert.deepEqual(parseDeepLink('https://twitninf.fr/profile/gas'), {
    screen: 'UserProfile',
    params: { username: 'gas' },
  });
});

test('un autre domaine ne peut pas ouvrir une conversation', () => {
  assert.equal(parseDeepLink('https://evil.example/messages/abc-123'), null);
});

test('Android route /messages/<id> vers l’app, mais laisse /messages au site', () => {
  const data = appConfig.android.intentFilters[0].data;
  for (const host of ['twitninf.fr', 'www.twitninf.fr']) {
    const rule = data.find((d) => d.host === host && d.pathPrefix?.startsWith('/messages'));
    assert.ok(rule, `aucune règle App Link /messages pour ${host}`);
    // La barre finale est ce qui distingue un fil précis de la liste : sans
    // elle, `/messages` ouvrirait l'app pour ne rien afficher.
    assert.equal(rule.pathPrefix, '/messages/');
  }
});
