const { readFileSync } = require('node:fs');
const test = require('node:test');
const assert = require('node:assert/strict');
const ts = require('typescript');
const Module = require('node:module');

const appConfig = require('../app.config.js')({ config: {} });
const releaseManifest = readFileSync(
  'android/app/src/main/AndroidManifest.xml',
  'utf8',
);

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

const { resolveServerUrl } = loadTypeScriptModule('src/config/serverUrl.ts');

test('release Android configuration blocks cleartext and backups', () => {
  assert.equal(appConfig.android.allowBackup, false);
  const buildProperties = appConfig.plugins.find(
    (plugin) => Array.isArray(plugin) && plugin[0] === 'expo-build-properties',
  );
  assert.equal(buildProperties[1].android.usesCleartextTraffic, false);
  assert.match(releaseManifest, /android:allowBackup="false"/);
  assert.match(releaseManifest, /android:usesCleartextTraffic="false"/);
});

test('release Android configuration applies least privilege', () => {
  for (const permission of [
    'ACCESS_COARSE_LOCATION',
    'ACCESS_FINE_LOCATION',
    'READ_EXTERNAL_STORAGE',
    'WRITE_EXTERNAL_STORAGE',
    'SYSTEM_ALERT_WINDOW',
  ]) {
    assert.doesNotMatch(releaseManifest, new RegExp(`android.permission.${permission}`));
    assert.ok(!appConfig.android.permissions.includes(permission));
  }
});

test('missing server configuration falls back without crashing startup', () => {
  const warnings = [];
  assert.deepEqual(
    resolveServerUrl(undefined, 'EXPO_PUBLIC_API_URL', 'https://api.invalid', (message) =>
      warnings.push(message),
    ),
    { url: 'https://api.invalid', configured: false },
  );
  assert.equal(warnings.length, 1);
});

test('configured servers remain HTTPS-only and normalized', () => {
  assert.deepEqual(
    resolveServerUrl(' https://api.example.test/// ', 'API_URL', 'https://api.invalid'),
    { url: 'https://api.example.test', configured: true },
  );
  assert.throws(
    () => resolveServerUrl('http://example.test', 'API_URL', 'https://api.invalid'),
    /HTTPS/,
  );
  assert.throws(
    () => resolveServerUrl('https://user:secret@example.test', 'API_URL', 'https://api.invalid'),
    /identifiants/,
  );
});
