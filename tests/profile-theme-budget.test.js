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
  BUDGET,
  REACH,
  LAYER,
  MAX_INTENSITY,
  SOURCE_GAINS,
  SOURCE_RADII,
  composite,
  falloffAt,
  peakOf,
  reachOf,
} = loadTypeScriptModule('src/components/profile/themeBudget.ts');

const KINDS = Object.keys(SOURCE_GAINS);
const THEMES = ['dark', 'light'];

/*
 * ── Ce que ce fichier protège, et ce qu'il a fallu deux essais pour trouver ──
 *
 * Essai 1 : les opacités du fond de profil composaient à 0,93 d'accent plein.
 * Profil entièrement rose, contenu compris. Correction : tout diviser par
 * cinq.
 *
 * Essai 2, testé à l'écran : « on la voit plus en sombre, et en light 0 sur
 * 20 ». Un film rose PÂLE sur toute la page au lieu d'un film rose vif —
 * le même défaut, en délavé.
 *
 * La leçon est donc que l'intensité n'était pas la variable :
 *
 *   Ce qui fait « page coloriée », c'est l'EMPRISE.
 *   Une lumière est vive et petite. Une peinture est uniforme, à n'importe
 *   quelle force. Diluer une peinture donne une peinture délavée.
 *
 * Le test vérifie donc DEUX choses opposées, et c'est le couple qui compte :
 * le foyer doit être assez FORT pour se voir, et assez ÉTEINT à mi-page pour
 * que le contenu reste neutre.
 */

test('la composition alpha n\'est pas une somme', () => {
  assert.equal(composite([0.5, 0.5]), 0.75);
  assert.ok(composite([0.2, 0.2, 0.2, 0.2, 0.2]) > 0.67);
  assert.equal(composite([]), 0);
  assert.equal(composite([1, 0.5]), 1);
});

test('les deux rendus refusés à l\'écran restent hors des clous', () => {
  // Essai 0 — le fond d'origine : criard.
  assert.ok(composite([0.3, 0.65, 0.45, 0.36, 0.162]) > 0.9);
  // Essai 1 — tout divisé par cinq : sous le seuil de visibilité.
  assert.ok(composite([0.119, 0.066, 0.04, 0.046, 0.053]) < 0.3);
});

test('AUCUNE couche ne couvre la page uniformément', () => {
  // L'assise est la seule couche qui ait jamais couvert toute la hauteur, et
  // c'est elle, seule, qui produisait le « fond colorié ». Une couche
  // uniforme ne peut pas se lire comme une lumière, quelle que soit sa
  // valeur : les deux rendus refusés ne différaient que par la sienne.
  assert.equal(LAYER.assise, 0, 'une couche uniforme est réapparue');
});

for (const theme of THEMES) {
  for (const kind of KINDS) {
    test(`« ${kind} » en ${theme} : le foyer se VOIT`, () => {
      // À intensité normale, pas « Intense » : le réglage par défaut doit
      // déjà valoir quelque chose. C'est ce seuil qu'a raté l'essai 1.
      const peak = peakOf(kind, theme, 1);
      assert.ok(peak >= 0.3, `crête à ${peak.toFixed(3)} : le thème est invisible`);
    });

    test(`« ${kind} » en ${theme} : le foyer ne DÉBORDE pas`, () => {
      const peak = peakOf(kind, theme, MAX_INTENSITY);
      assert.ok(peak <= BUDGET, `crête à ${peak.toFixed(3)}, budget ${BUDGET}`);

      // La mesure qui compte vraiment : ce qu'il reste à mi-page, là où vit
      // le contenu (pseudo, bio, compteurs, onglets, cartes).
      const reach = reachOf(kind, theme, MAX_INTENSITY);
      assert.ok(
        reach <= REACH,
        `il reste ${reach.toFixed(3)} de teinte à mi-page (max ${REACH}) : le contenu la prend`,
      );
    });
  }
}

test('la chute du foyer est raide', () => {
  assert.equal(falloffAt(0), 1);
  // Tolerance flottante : l'interpolation lineaire retombe sur 0.2000000000000001.
  assert.ok(falloffAt(0.4) <= 0.2 + 1e-9, 'la couleur tient trop loin');
  assert.equal(falloffAt(0.72), 0);
  assert.equal(falloffAt(2), 0, 'un foyer doit être éteint au-delà de son rayon');
});

test('les foyers restent serrés', () => {
  // Le vrai défaut d'origine n'était pas une opacité mais `rx: 72, ry: 40` :
  // un radial couvrant les trois quarts de la page n'est plus une source de
  // lumière, c'est un aplat aux bords adoucis. Aucune baisse d'opacité ne
  // rattrape ça — c'est ce qu'a montré l'essai 1.
  for (const kind of KINDS) {
    for (const [rx, ry] of SOURCE_RADII[kind]) {
      assert.ok(rx <= 60, `« ${kind} » : rayon horizontal ${rx} trop large`);
      assert.ok(ry <= 25, `« ${kind} » : rayon vertical ${ry} trop haut`);
    }
  }
});

test('l\'intensité choisie ordonne bien les rendus', () => {
  for (const kind of KINDS) {
    const soft = peakOf(kind, 'dark', 0.62);
    const normal = peakOf(kind, 'dark', 1);
    const vivid = peakOf(kind, 'dark', MAX_INTENSITY);
    assert.ok(soft < normal && normal < vivid, `« ${kind} » : les paliers ne s'ordonnent pas`);
  }
});

test('chaque thème a autant de rayons que de foyers', () => {
  for (const kind of KINDS) {
    assert.equal(
      SOURCE_RADII[kind].length,
      SOURCE_GAINS[kind].length,
      `« ${kind} » : un foyer lirait un rayon inexistant`,
    );
  }
});
