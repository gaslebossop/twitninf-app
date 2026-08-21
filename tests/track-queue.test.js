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

const { DeferredDispatcher } = loadTypeScriptModule('src/utils/trackQueue.ts');

/** Ordonnanceur manuel : rien ne part tant que le test ne l'a pas décidé. */
function manualScheduler() {
  const jobs = [];
  const schedule = (run) => { jobs.push(run); };
  const runAll = () => {
    while (jobs.length) jobs.shift()();
  };
  return { schedule, runAll, get size() { return jobs.length; } };
}

/** Un `send` dont chaque envoi se termine à la demande. */
function controllableSend() {
  const sent = [];
  const settlers = [];
  const send = (payload) => {
    sent.push(payload);
    return new Promise((resolve, reject) => settlers.push({ resolve, reject }));
  };
  return { send, sent, settlers };
}

const tick = () => new Promise((r) => setImmediate(r));

test('enqueue n’envoie RIEN de façon synchrone — le callback de défilement rend la main d’abord', () => {
  const clock = manualScheduler();
  const { send, sent } = controllableSend();
  const q = new DeferredDispatcher(send, { schedule: clock.schedule, maxInFlight: 2 });

  q.enqueue('a');
  q.enqueue('b');

  assert.deepEqual(sent, [], 'aucun envoi ne doit partir pendant enqueue');
  assert.equal(q.pending, 2);
});

test('le drainage respecte maxInFlight au lieu de tout lancer en parallèle', () => {
  const clock = manualScheduler();
  const { send, sent } = controllableSend();
  const q = new DeferredDispatcher(send, { schedule: clock.schedule, maxInFlight: 2 });

  for (const id of ['a', 'b', 'c', 'd', 'e']) q.enqueue(id);
  clock.runAll();

  assert.deepEqual(sent, ['a', 'b'], 'au plus deux envois simultanés');
  assert.equal(q.pending, 3);
  assert.equal(q.active, 2);
});

test('tout finit par partir, dans l’ordre d’arrivée', async () => {
  const clock = manualScheduler();
  const { send, sent, settlers } = controllableSend();
  const q = new DeferredDispatcher(send, { schedule: clock.schedule, maxInFlight: 2 });

  for (const id of ['a', 'b', 'c', 'd', 'e']) q.enqueue(id);

  for (let guard = 0; guard < 20 && (q.pending > 0 || q.active > 0); guard += 1) {
    clock.runAll();
    while (settlers.length) settlers.shift().resolve();
    await tick();
  }

  assert.deepEqual(sent, ['a', 'b', 'c', 'd', 'e']);
  assert.equal(q.pending, 0);
  assert.equal(q.active, 0);
});

test('un envoi qui échoue ne bloque pas la file derrière lui', async () => {
  const clock = manualScheduler();
  const sent = [];
  const q = new DeferredDispatcher(
    (payload) => {
      sent.push(payload);
      return payload === 'a' ? Promise.reject(new Error('réseau')) : Promise.resolve();
    },
    { schedule: clock.schedule, maxInFlight: 1 },
  );

  for (const id of ['a', 'b', 'c']) q.enqueue(id);

  for (let guard = 0; guard < 20 && (q.pending > 0 || q.active > 0); guard += 1) {
    clock.runAll();
    await tick();
  }

  assert.deepEqual(sent, ['a', 'b', 'c']);
  assert.equal(q.pending, 0);
});

test('un send qui jette de façon SYNCHRONE ne fige pas la file', async () => {
  const clock = manualScheduler();
  const sent = [];
  const q = new DeferredDispatcher(
    (payload) => {
      sent.push(payload);
      if (payload === 'a') throw new Error('boum');
      return Promise.resolve();
    },
    { schedule: clock.schedule, maxInFlight: 1 },
  );

  q.enqueue('a');
  q.enqueue('b');

  for (let guard = 0; guard < 20 && (q.pending > 0 || q.active > 0); guard += 1) {
    clock.runAll();
    await tick();
  }

  assert.deepEqual(sent, ['a', 'b']);
});

test('l’ordonnanceur par défaut sort bien du tour de boucle courant', async () => {
  const sent = [];
  const q = new DeferredDispatcher((p) => { sent.push(p); return Promise.resolve(); });

  q.enqueue('a');
  assert.deepEqual(sent, [], 'rien pendant le tour courant');

  await new Promise((r) => setTimeout(r, 5));
  assert.deepEqual(sent, ['a']);
});
