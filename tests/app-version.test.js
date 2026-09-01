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

const { PATCH_NOTES } = loadTypeScriptModule('src/data/patchNotes.ts');
const appConfig = require('../app.config.js')({ config: {} });
const pkg = require('../package.json');

const SEMVER = /^\d+\.\d+\.\d+$/;

/** `1.2.0` -> 1002000, pour comparer sans se tromper sur `1.10.0` vs `1.9.0`. */
function rank(version) {
  const [maj, min, pat] = version.split('.').map(Number);
  return maj * 1e6 + min * 1e3 + pat;
}

/*
 * ── Ce que ce fichier empeche ────────────────────────────────────────────
 *
 * La version de l'app est restee a `1.0.0` pendant un an. Ce n'etait pas
 * cosmetique : `PatchNotesModal` compare `last_seen_version` a `APP_VERSION`
 * (lu depuis `app.config.js`) pour decider s'il montre les nouveautes. Une
 * valeur qui ne bouge jamais = une popup qui se declenche UNE SEULE FOIS dans
 * la vie de l'app. Toutes les notes publiees depuis n'ont ete vues par
 * personne l'ayant fermee une fois.
 *
 * Rien ne signalait la panne : pas d'erreur, pas de log, la popup avait
 * simplement l'air de ne plus avoir de raison de s'ouvrir.
 *
 * D'ou ces regles, qui ne portent pas sur du code mais sur une DISCIPLINE :
 * une version qu'on ne peut pas expliquer aux gens n'a pas de raison
 * d'exister, et trois fichiers qui declarent la meme chose doivent la
 * declarer pareil.
 */

test('la version de l\'app est un semver', () => {
  assert.match(appConfig.version, SEMVER, `app.config.js : « ${appConfig.version} »`);
  assert.match(pkg.version, SEMVER, `package.json : « ${pkg.version} »`);
});

test('app.config.js et package.json declarent la MEME version', () => {
  // `app.config.js` fait autorite (c'est lui que lit `Constants.expoConfig`).
  // package.json ne sert qu'a npm, mais un ecart entre les deux est le genre
  // de detail qui fait perdre une heure a chercher pourquoi l'app affiche
  // autre chose que ce qu'on croit avoir publie — c'etait deja le cas : 1.0.0
  // d'un cote, 1.1.0 de l'autre.
  assert.equal(
    pkg.version,
    appConfig.version,
    'package.json et app.config.js ont diverge',
  );
});

test('la version courante a ses notes de version', () => {
  // La regle qui compte. Sortir une version sans dire ce qu'elle apporte,
  // c'est ce qui a produit un an de silence.
  assert.equal(
    PATCH_NOTES[0].version,
    appConfig.version,
    `app.config.js est en ${appConfig.version}, la derniere note en ${PATCH_NOTES[0].version} — ajoute une entree dans src/data/patchNotes.ts`,
  );
});

test('chaque note porte une version, une date, un titre et du contenu', () => {
  for (const note of PATCH_NOTES) {
    assert.match(note.version, SEMVER, `version invalide : « ${note.version} »`);
    assert.ok(note.date?.trim(), `${note.version} : date manquante`);
    assert.ok(note.title?.trim(), `${note.version} : titre manquant`);
    assert.ok(
      Array.isArray(note.items) && note.items.length > 0,
      `${note.version} : aucune ligne de contenu`,
    );
    for (const item of note.items) {
      assert.ok(item.trim().length > 0, `${note.version} : une ligne vide`);
    }
  }
});

test('les notes descendent strictement, sans doublon', () => {
  // L'ordre porte du sens : `PatchNotesModal` ne montre que `PATCH_NOTES[0]`.
  // Une entree mal placee ferait afficher d'anciennes nouveautes comme si
  // elles etaient neuves.
  for (let i = 1; i < PATCH_NOTES.length; i += 1) {
    const avant = PATCH_NOTES[i - 1].version;
    const apres = PATCH_NOTES[i].version;
    assert.ok(
      rank(avant) > rank(apres),
      `${avant} devrait etre au-dessus de ${apres} — le plus recent en premier, sans doublon`,
    );
  }
});

test('runtimeVersion ne suit PAS la version affichee', () => {
  // `runtimeVersion` dit avec quel binaire natif une mise a jour OTA est
  // compatible. Le monter a chaque sortie couperait les installations
  // existantes de toutes les mises a jour : elles chercheraient un runtime
  // qu'aucun build livre ne porte. Ce test existe pour que personne ne les
  // « resynchronise » en croyant bien faire.
  assert.match(appConfig.runtimeVersion, SEMVER);
  assert.notEqual(
    appConfig.runtimeVersion,
    appConfig.version,
    'runtimeVersion doit rester decouple de la version affichee — il ne bouge que quand le natif bouge',
  );
});
