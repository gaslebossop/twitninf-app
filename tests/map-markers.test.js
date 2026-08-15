/**
 * Liste de marqueurs de la Carte NF.
 *
 * Ce fichier ne teste pas une apparence : il teste la FORME de la liste, parce
 * que c'est elle qui faisait tomber l'app. `AIRMap insertReactSubview:atIndex:`
 * insère dans son tableau sans borner l'index, et une liste qui change de
 * taille ou d'ordre finit en `NSRangeException: index 10 beyond bounds`.
 *
 * La carte pose donc un nombre FIXE d'emplacements (`MARKER_POOL_SIZE`) et ne
 * fait plus que changer leurs props. Ce que ce fichier verrouille est ce dont
 * ce pool a besoin pour tenir :
 *
 *   1. une liste TRIÉE, dont l'ordre ne dépend ni du zoom, ni de la composition
 *      des groupes, ni de l'ordre d'arrivée des réponses ;
 *   2. une liste BORNÉE à ce que la fenêtre montre — sans quoi les
 *      emplacements partent à des gens hors champ et la vue reste vide ;
 *   3. aucune épingle fantôme : un membre de groupe ne produit rien.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const Module = require('node:module');
const path = require('node:path');
const ts = require('typescript');

/**
 * Charge un module TypeScript en transpilant à la volée, ainsi que ses imports
 * relatifs. Les imports de composants React (`../components/map/NfMapCanvas`)
 * ne sont pris que pour leurs TYPES : ils disparaissent à la transpilation, il
 * n'y a donc aucun rendu ici.
 */
function loadTypeScriptModule(filename, cache = new Map()) {
  // `require.resolve` ne connaît pas l'extension `.ts` : un import relatif écrit
  // sans extension, comme le veut TypeScript, ne se résout pas tout seul.
  const resolved = require.resolve(filename.endsWith('.ts') ? filename : `${filename}.ts`);
  if (cache.has(resolved)) return cache.get(resolved).exports;

  const output = ts.transpileModule(readFileSync(resolved, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;

  const loaded = new Module(resolved, module);
  loaded.filename = resolved;
  loaded.paths = module.paths;
  cache.set(resolved, loaded);

  loaded.require = (request) => {
    if (!request.startsWith('.')) return require(request);
    return loadTypeScriptModule(path.resolve(path.dirname(resolved), request), cache);
  };

  loaded._compile(output, resolved);
  return loaded.exports;
}

const { buildMapMarkers, coordinatesOf, SELF_MARKER_ID } = loadTypeScriptModule(
  require.resolve('../src/utils/mapMarkers.ts')
);
const { PIN_ANCHOR_Y, CLUSTER_ANCHOR_Y } = loadTypeScriptModule(
  require.resolve('../src/utils/mapPinUrl.ts')
);
const { quantizedDegreesPerPixel, quantizedLatitudeCosine } = loadTypeScriptModule(
  require.resolve('../src/utils/mapCluster.ts')
);

const SCREEN = 390;
const PARIS_COSINE = quantizedLatitudeCosine(48.85);

/** Une fenêtre de largeur donnée, à la latitude de Paris. */
function echelle(largeurEnDegres) {
  return quantizedDegreesPerPixel(largeurEnDegres, SCREEN);
}

/** 18 comptes éparpillés autour de Paris, avec des identifiants mélangés. */
function foule(count = 18) {
  const people = [];
  for (let i = 0; i < count; i += 1) {
    // Identifiants volontairement NON triés par position : si l'ordre de sortie
    // suivait la géographie, le test ne prouverait rien.
    people.push({
      id: `u${String((i * 7) % count).padStart(2, '0')}`,
      username: `ami${i}`,
      full_name: null,
      avatar: null,
      verified: false,
      premium: false,
      latitude: 48.8566 + ((i % 5) - 2) * 0.02,
      longitude: 2.3522 + (Math.floor(i / 5) - 2) * 0.03,
      place_label: null,
      sharing_mode: 'precise',
      shared_at: '2026-08-15T10:00:00.000Z',
    });
  }
  return people;
}

const PIN = { origin: 'https://api.test', density: 3 };

function construire(people, largeur, extra = {}) {
  return buildMapMarkers({
    people,
    myPosition: null,
    me: { id: 'moi', avatar: null },
    isGhost: true,
    selectedId: null,
    pin: PIN,
    clusterScale: echelle(largeur),
    clusterLatitudeCosine: PARIS_COSINE,
    ...extra,
  });
}

// ── Ce que la carte peut réellement porter ─────────────────────────────────
//
// La carte n'expose qu'un nombre FIXE d'emplacements (MARKER_POOL_SIZE). Ce
// que ce fichier vérifie, c'est que la liste reste bornée, ordonnée, et
// limitée à ce qu'on regarde.

test('un groupe ne produit qu’UN marqueur, sa tête', () => {
  const gens = foule();
  const large = construire(gens, 1.2);
  const tetes = large.filter((m) => m.data.kind === 'head');

  // Les membres n'ont plus d'épingle fantôme sous la tête : le nombre de
  // marqueurs suit le nombre de groupes, pas le nombre de personnes.
  assert.ok(large.length < gens.length, `${large.length} marqueurs pour ${gens.length} personnes`);
  assert.equal(large.length, tetes.length + large.filter((m) => m.data.kind === 'solo').length);

  const rassembles = tetes.reduce((sum, m) => sum + m.data.faces.length, 0);
  const isoles = large.filter((m) => m.data.kind === 'solo').length;
  assert.equal(rassembles + isoles, gens.length, 'personne n’est perdu en route');
});

test('zoomé, chacun retrouve son épingle ; dézoomé, il y en a moins', () => {
  const gens = foule();
  const serre = construire(gens, 0.004);
  const large = construire(gens, 1.2);

  assert.equal(serre.length, gens.length);
  assert.ok(serre.every((m) => m.data.kind === 'solo'));
  assert.ok(large.length < serre.length);
});

test('aucun identifiant de marqueur n’est celui d’un groupe', () => {
  const connus = new Set(foule().map((person) => person.id));
  for (const marker of construire(foule(), 1.2)) {
    assert.ok(connus.has(marker.id), `« ${marker.id} » n’est pas l’identité d’une personne`);
  }
});

// ── L'ordre, qui ne doit dépendre de rien ──────────────────────────────────

test('la liste est TOUJOURS triée par identifiant', () => {
  for (const largeur of [0.004, 0.05, 0.2, 0.6, 1.2, 4]) {
    const ids = construire(foule(), largeur).map((m) => m.id);
    assert.deepEqual(ids, [...ids].sort(), `zoom ${largeur}° : ordre non trié`);
  }
});

test('l’ordre ne dépend pas de l’ordre d’arrivée des réponses', () => {
  const gens = foule();
  const direct = construire(gens, 0.6).map((marker) => marker.id);
  const inverse = construire([...gens].reverse(), 0.6).map((marker) => marker.id);
  assert.deepEqual(inverse, direct);
});

test('l’épingle « moi » n’insère personne au milieu de la liste', () => {
  const gens = foule();
  const sansMoi = construire(gens, 0.6).map((marker) => marker.id);
  const avecMoi = construire(gens, 0.6, {
    myPosition: { latitude: 48.86, longitude: 2.34 },
  }).map((marker) => marker.id);

  assert.equal(avecMoi.length, sansMoi.length + 1);
  assert.ok(avecMoi.includes(SELF_MARKER_ID));
  assert.deepEqual(avecMoi.filter((id) => id !== SELF_MARKER_ID), sansMoi);
});

test('sélectionner quelqu’un ne réordonne rien', () => {
  const gens = foule();
  const avant = construire(gens, 0.6).map((marker) => marker.id);
  const apres = construire(gens, 0.6, { selectedId: gens[5].id }).map((marker) => marker.id);
  assert.deepEqual(apres, avant);
});

// ── Le filtre de fenêtre, qui borne ce que la carte doit porter ────────────

test('hors de la fenêtre, personne ne produit de marqueur', () => {
  const gens = foule();
  // Une fenêtre sur Marseille, alors que tout le monde est à Paris.
  const marseille = { north: 43.4, south: 43.2, east: 5.5, west: 5.2 };
  assert.equal(construire(gens, 0.05, { visibleBounds: marseille }).length, 0);

  // La même foule, regardée depuis Paris : tout le monde est là.
  const paris = { north: 49.0, south: 48.7, east: 2.5, west: 2.2 };
  assert.ok(construire(gens, 0.05, { visibleBounds: paris }).length > 0);
});

test('l’épingle « moi » et la fiche ouverte survivent au filtre', () => {
  const gens = foule();
  const marseille = { north: 43.4, south: 43.2, east: 5.5, west: 5.2 };

  const markers = construire(gens, 0.004, {
    visibleBounds: marseille,
    myPosition: { latitude: 48.86, longitude: 2.34 },
    selectedId: gens[3].id,
  });

  const ids = markers.map((m) => m.id);
  // Les faire disparaître pendant qu'on les lit serait absurde.
  assert.ok(ids.includes(SELF_MARKER_ID), 'ma propre épingle ne se cache pas');
  assert.ok(ids.includes(gens[3].id), 'la personne dont la fiche est ouverte reste');
  assert.equal(ids.length, 2, 'et personne d’autre');
});

test('sans fenêtre connue, rien n’est filtré', () => {
  const gens = foule();
  assert.equal(construire(gens, 0.004, { visibleBounds: null }).length, gens.length);
});

test('l’image d’un marqueur change quand son rôle change', () => {
  const gens = foule();
  const serre = new Map(construire(gens, 0.004).map((m) => [m.id, m.image]));
  const large = construire(gens, 1.2);

  // Une épingle isolée devenue tête de groupe doit demander une AUTRE image :
  // c'est le seul signal qui reste maintenant que les marqueurs n'ont plus de
  // contenu React à re-photographier.
  const change = large.filter((marker) => serre.get(marker.id) !== marker.image);
  assert.ok(change.length > 0, 'sans changement d’URL, l’épingle garde son ancien dessin');
});

test('chaque marqueur demande une image et sait où il pointe', () => {
  const markers = construire(foule(), 1.2, {
    myPosition: { latitude: 48.86, longitude: 2.34 },
  });

  for (const marker of markers) {
    assert.ok(typeof marker.image === 'string' && marker.image.length > 0, marker.id);
    // Un marqueur sans image ET sans enfant retombe sur l'épingle rouge par
    // défaut de la carte : on verrait des piques sous chaque groupe.
    assert.ok(Number.isFinite(marker.anchorY) && marker.anchorY >= 0 && marker.anchorY <= 1);
  }

  const solo = markers.find((marker) => marker.data.kind === 'solo');
  const tete = markers.find((marker) => marker.data.kind === 'head');
  const moi = markers.find((marker) => marker.id === SELF_MARKER_ID);
  if (solo) assert.equal(solo.anchorY, PIN_ANCHOR_Y);
  if (tete) assert.equal(tete.anchorY, CLUSTER_ANCHOR_Y);
  assert.equal(moi.anchorY, PIN_ANCHOR_Y);
});

test('une épingle de groupe ne nomme que les visages montrés', () => {
  const large = construire(foule(30), 1.2);
  for (const tete of large.filter((marker) => marker.data.kind === 'head')) {
    const ids = new URL(tete.image).searchParams.get('ids').split(',');
    // Envoyer la composition entière allongerait l'URL sans rien changer à
    // l'image, et ferait rater le cache dès qu'un membre lointain bouge.
    assert.ok(ids.length <= 3, `${ids.length} visages dans l’URL`);
    assert.ok(Number(new URL(tete.image).searchParams.get('count')) >= ids.length);
  }
});

test('l’épingle « moi » dit si elle est vue par les autres', () => {
  const visible = construire([], 0.6, {
    myPosition: { latitude: 48.85, longitude: 2.35 },
    isGhost: false,
  })[0];
  const fantome = construire([], 0.6, {
    myPosition: { latitude: 48.85, longitude: 2.35 },
    isGhost: true,
  })[0];

  assert.equal(new URL(visible.image).searchParams.get('v'), 'self');
  assert.equal(new URL(fantome.image).searchParams.get('v'), 'ghost');
  assert.notEqual(visible.image, fantome.image, 'les deux états doivent se distinguer');
});

test('une position approximative se signale dans l’épingle', () => {
  const [ville] = construire(
    [
      {
        id: 'a',
        username: 'a',
        avatar: null,
        latitude: 48.85,
        longitude: 2.35,
        sharing_mode: 'city',
      },
    ],
    0.004
  );
  assert.equal(new URL(ville.image).searchParams.get('v'), 'city');
});

// ── Les coordonnées douteuses n'entrent jamais ──────────────────────────────

test('une personne sans coordonnées exploitables ne produit pas de marqueur', () => {
  const bancales = [
    { latitude: null, longitude: 2.35 },
    { latitude: undefined, longitude: 2.35 },
    { latitude: 'abc', longitude: 2.35 },
    { latitude: 91, longitude: 2.35 },
    { latitude: 48.85, longitude: -181 },
  ];

  for (const coords of bancales) {
    const person = { id: 'x', username: 'x', avatar: null, sharing_mode: 'precise', ...coords };
    assert.equal(coordinatesOf(person), null, JSON.stringify(coords));
    assert.equal(construire([person], 0.6).length, 0);
  }
});

test('une position en chaîne de caractères reste exploitable', () => {
  // L'API renvoie des DECIMAL, que le pilote sérialise en chaînes.
  const person = { id: 'x', username: 'x', avatar: null, latitude: '48.8566', longitude: '2.3522' };
  assert.deepEqual(coordinatesOf(person), { latitude: 48.8566, longitude: 2.3522 });
});

test('aucune personne, et seule l’épingle « moi » subsiste', () => {
  const markers = construire([], 0.6, { myPosition: { latitude: 48.85, longitude: 2.35 } });
  assert.equal(markers.length, 1);
  assert.equal(markers[0].id, SELF_MARKER_ID);
  assert.equal(markers[0].data.ghost, true);
});
