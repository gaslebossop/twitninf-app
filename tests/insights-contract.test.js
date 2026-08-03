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
  InsightsError,
  finiteNumber,
  unwrapInsightsResponse,
} = loadTypeScriptModule('src/services/insightsContract.ts');

test('an API failure cannot be displayed as an empty insights list', () => {
  assert.throws(
    () => unwrapInsightsResponse({ success: false, message: 'Radar indisponible.' }, 'Erreur', 'array'),
    (error) => error instanceof InsightsError
      && error.kind === 'unavailable'
      && error.message === 'Radar indisponible.',
  );
});

test('premium rejection is exposed as a distinct UI state', () => {
  assert.throws(
    () => unwrapInsightsResponse({
      success: false,
      message: 'Abonnement Plus ou Pro requis pour accéder à cette fonctionnalité',
    }, 'Erreur', 'array'),
    (error) => error instanceof InsightsError && error.kind === 'premium_required',
  );
});

test('a malformed list response is not mistaken for zero detections', () => {
  assert.throws(
    () => unwrapInsightsResponse({ success: true, data: { items: [] } }, 'Erreur', 'array'),
    (error) => error instanceof InsightsError && error.kind === 'invalid_response',
  );
  assert.deepEqual(
    unwrapInsightsResponse({ success: true, data: [] }, 'Erreur', 'array'),
    [],
  );
});

test('numeric database aggregates are normalized safely', () => {
  assert.equal(finiteNumber('12.5'), 12.5);
  assert.equal(finiteNumber('not-a-number', 24), 24);
});
