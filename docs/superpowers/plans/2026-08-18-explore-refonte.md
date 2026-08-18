# Refonte de l'onglet Explorer — plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remplacer le masonry image-first de l'onglet Explorer par un mur typographique rythmé, dont la forme des cartes découle de la longueur du tweet, avec une bande d'entrée qui joue seule et des actions sans navigation.

**Architecture:** Deux modules **purs** (`cardFormat.ts`, `wallLayout.ts`) portent toutes les décisions — format, couleur, hauteur estimée, découpage en blocs — et sont testés sans rendu. Quatre composants de présentation les consomment. `ExploreGrid.tsx` devient un simple assembleur et **conserve son contrat de props actuel**, plus deux champs, si bien que `TweetsScreen.tsx` n'est presque pas touché.

**Tech Stack:** React Native 0.81.5, Expo SDK 54, Reanimated 4.1.1, react-native-worklets 0.5.1, react-native-gesture-handler 2.28, expo-image 3, `@react-navigation/native` v7. Tests : `node --test tests` (node:test + transpilation TypeScript à la volée).

**Spec de référence :** `docs/superpowers/specs/2026-08-18-explore-refonte-design.md`

## Global Constraints

- **`scheduleOnRN` de `react-native-worklets`, jamais `runOnJS`** dans tout code nouveau. `runOnJS` fonctionne encore en Reanimated 4.1.1 mais est déprécié deux fois. Les 50 usages existants ailleurs dans l'app ne sont **pas** migrés (hors périmètre).
- **Une fonction JS ordinaire appelée dans un worklet tue l'app sans aucun log.** Toute fonction appelée depuis un worklet passe par `scheduleOnRN`.
- **Aucune animation d'apparition sur les cartes.** Décision utilisateur antérieure. Le mouvement répond à un geste ou suit le doigt.
- **Courbes et durées : celles de `src/theme/motion.ts` uniquement.** `easing.out = bezier(0.16, 1, 0.3, 1)`, ressort critique `damping: 28, stiffness: 190`. Ne jamais baisser `damping` sans recalculer `damping ≈ 2·√(stiffness · mass)`. Aucun rebond visible.
- **Durées 120–280 ms**, plafond absolu 340 ms.
- **`useWindowDimensions`, jamais `Dimensions.get()`.** La largeur de carte doit être un paramètre, pas une constante de module.
- **`maxFontSizeMultiplier={1.2}`** sur tout texte à hauteur contrainte.
- **`collapsable={false}`** sur toute vue mesurée par `measureInWindow`.
- **Pas de `Alert.alert`** (absent de l'app). Pas de `BlurView` décoratif. Pas de dégradé décoratif par carte.
- **Pas de `borderCurve`** : absent des types React Native 0.81.5 (constaté à la Task 3, `tsc` le rejette). Ne pas le réintroduire, ne pas le forcer par un cast. `fontVariant: 'tabular-nums'` reste obligatoire sur les compteurs.
- **Marge basse explicite** : la tab bar est absolue et recouvre le bas de l'écran.
- **`npm run typecheck` doit passer à la fin de chaque tâche.** Son absence avait livré le double-tap à moitié câblé en 5ᵉ passe.
- **Aucune modification serveur.** `trending`, `force_refresh`, `exclude_seen` et le tirage à deux températures sont déjà déployés.

---

## Structure des fichiers

| Fichier | Responsabilité | Testé |
|---|---|---|
| `src/theme/colors.ts` | + tokens `blockContrast` / `onBlockContrast` (sombre **et** clair) | — |
| `src/components/feed/explore/cardFormat.ts` | format, cadence de couleur, seuils, hauteur estimée | **unitaire** |
| `src/components/feed/explore/wallLayout.ts` | blocs de 7, choix de la rupture, équilibrage local | **unitaire** |
| `src/components/feed/explore/ExploreCard.tsx` | rendu des 4 formats + variante rupture | typecheck |
| `src/components/feed/explore/ExploreHero.tsx` | bande d'entrée auto-défilante | typecheck |
| `src/components/feed/explore/ExploreActionSheet.tsx` | panneau d'appui long | typecheck |
| `src/components/feed/explore/ExploreWall.tsx` | assemblage des blocs, pagination | typecheck |
| `src/components/feed/ExploreGrid.tsx` | assembleur + états (chargement/erreur/vide/fin) | typecheck |
| `src/screens/TweetsScreen.tsx` | `lastExploreVisitAt`, branchement `onInterest` | typecheck |
| `tests/explore-card-format.test.js` | tests de `cardFormat.ts` | — |
| `tests/explore-wall-layout.test.js` | tests de `wallLayout.ts` | — |

---

### Task 0 : Vérifier la lecture immersive existante sur un vrai appareil

`ExploreImmersive.tsx` (pager gestuel, 928 lignes) a été écrit en 6ᵉ passe et **n'a jamais tourné sur un téléphone** — vérifié uniquement par `tsc` et tests unitaires. La refonte se construit dessus. Si on saute cette étape, tout défaut du pager sera attribué au nouveau code.

**Files:** aucun (vérification seule)

**Interfaces:**
- Consumes: rien
- Produces: un constat écrit — le pager fonctionne, ou la liste des défauts à corriger avant de continuer

- [ ] **Step 1: Lancer l'app sur appareil**

```bash
npx expo start
```

Scanner le QR avec Expo Go. Aller sur l'onglet Accueil, puis glisser deux fois vers la gauche pour atteindre « Explorer ».

- [ ] **Step 2: Exercer le pager et noter ce qui casse**

À vérifier un par un :
1. Un tap sur une carte ouvre la lecture **en partant du rectangle de la carte** (pas en fondu depuis le centre).
2. Un glissé vertical passe **exactement un tweet**, jamais deux.
3. Sur la **première** page, tirer vers le bas referme la lecture vers la carte d'origine.
4. La vidéo démarre muette et ne joue que sur la page active.
5. Le glissé horizontal entre les trois onglets du fil ne saute pas d'onglet.

- [ ] **Step 3: Trancher**

Si tout fonctionne : noter « pager vérifié le <date> sur <appareil> » et passer à la Task 1.
Si quelque chose casse : **s'arrêter et corriger d'abord**, dans un commit séparé. Ne pas empiler la refonte sur un pager défaillant.

- [ ] **Step 4: Commit (seulement si des correctifs ont été nécessaires)**

```bash
git add src/components/feed/ExploreImmersive.tsx
git commit -m "fix(explore): corrections du pager gestuel révélées par le premier essai sur appareil"
```

---

### Task 1 : Tokens de couleur + module `cardFormat.ts`

**Files:**
- Modify: `src/theme/colors.ts` (objets `DARK` et `LIGHT`)
- Create: `src/components/feed/explore/cardFormat.ts`
- Test: `tests/explore-card-format.test.js`

**Interfaces:**
- Consumes: `Tweet` de `src/types/api`, `splitTweetMedia` / `displayContentOf` de `src/utils/tweetMedia`
- Produces:
  - `type CardFormat = 'declaration' | 'citation' | 'bloc' | 'photo'`
  - `type CardFill = 'surface' | 'surfaceAlt' | 'accent' | 'contrast'`
  - `interface CardMeta { tweet: Tweet; format: CardFormat; fill: CardFill; height: number }`
  - `formatOf(tweet): CardFormat`
  - `shouldShowCount(n: number): boolean`
  - `declarationType(length: number): { fontSize: number; lineHeight: number; lines: number }`
  - `quoteType(length: number): { fontSize: number; lineHeight: number; lines: number; boxHeight: (w: number) => number }`
  - `estimatedHeightOf(tweet, cardWidth): number`
  - `describeCards(tweets: Tweet[], cardWidth: number): CardMeta[]`
  - constantes `DECLARATION_MAX = 46`, `CITATION_MAX = 100`, `COUNTER_FLOOR = 5`, `NEW_SINCE_FLOOR = 5`, `FILL_CADENCE`

- [ ] **Step 1: Ajouter les deux tokens de couleur**

Dans `src/theme/colors.ts`, objet `DARK`, juste après la ligne `onAccent: '#FFFFFF',` :

```ts
  /**
   * Bloc de contraste du mur Explorer — la carte claire de la cadence.
   * Le rôle est « le bloc qui tranche avec le fond », donc en thème clair il
   * devient sombre : c'est la CADENCE qui doit rester lisible, pas la teinte.
   */
  blockContrast: '#F2EFE9',
  onBlockContrast: '#0A0A0A',
```

Dans l'objet `LIGHT`, au même endroit (après `onAccent: '#FFFFFF',`) :

```ts
  blockContrast: '#1A1A1A',
  onBlockContrast: '#FFFFFF',
```

- [ ] **Step 2: Écrire le test qui échoue**

Créer `tests/explore-card-format.test.js` :

```js
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
  formatOf,
  describeCards,
  shouldShowCount,
  estimatedHeightOf,
  DECLARATION_MAX,
  CITATION_MAX,
  COUNTER_FLOOR,
} = loadTypeScriptModule('src/components/feed/explore/cardFormat.ts');

const CARD_WIDTH = 180;

/** Tweet texte nu — pas de média, pas de retweet. */
const textTweet = (id, length) => ({
  id: String(id),
  content: 'a'.repeat(length),
  media_urls: [],
  stats: { likes: 0, views: 0 },
});

/** Tweet portant une image. */
const photoTweet = (id, length = 10) => ({
  id: String(id),
  content: 'a'.repeat(length),
  media_urls: ['https://example.test/p.jpg'],
  stats: { likes: 0, views: 0 },
});

test('la longueur décide du format, aux bornes exactes', () => {
  assert.equal(formatOf(textTweet(1, 1)), 'declaration');
  assert.equal(formatOf(textTweet(2, DECLARATION_MAX)), 'declaration');
  assert.equal(formatOf(textTweet(3, DECLARATION_MAX + 1)), 'citation');
  assert.equal(formatOf(textTweet(4, CITATION_MAX)), 'citation');
  assert.equal(formatOf(textTweet(5, CITATION_MAX + 1)), 'bloc');
});

test('un média l’emporte sur la longueur du texte', () => {
  // Sans cette priorité, un tweet illustré de 3 mots partirait en Déclaration
  // et son image ne serait jamais rendue.
  assert.equal(formatOf(photoTweet(6, 5)), 'photo');
  assert.equal(formatOf(photoTweet(7, 500)), 'photo');
});

test('la cadence de couleur ne s’applique qu’aux déclarations', () => {
  const tweets = [];
  for (let i = 0; i < 10; i += 1) tweets.push(textTweet(i, 10));
  const metas = describeCards(tweets, CARD_WIDTH);
  const fills = metas.map((m) => m.fill);
  assert.deepEqual(fills, [
    'surface', 'surface', 'accent', 'surface', 'contrast',
    'surface', 'surface', 'accent', 'surface', 'contrast',
  ]);
});

test('les formats non-déclaration restent sur les surfaces neutres', () => {
  const metas = describeCards(
    [textTweet(1, 60), textTweet(2, 200), photoTweet(3)],
    CARD_WIDTH,
  );
  for (const meta of metas) {
    assert.ok(meta.fill === 'surface' || meta.fill === 'surfaceAlt');
  }
});

test('le rang de cadence compte les déclarations, pas les positions', () => {
  // Deux déclarations séparées par des cartes d'un autre format doivent se
  // suivre dans la cadence : sinon le magenta dépend du hasard du mélange.
  const metas = describeCards(
    [
      textTweet(1, 10),   // déclaration rang 0 -> surface
      textTweet(2, 200),  // bloc
      textTweet(3, 10),   // déclaration rang 1 -> surface
      textTweet(4, 200),  // bloc
      textTweet(5, 10),   // déclaration rang 2 -> accent
    ],
    CARD_WIDTH,
  );
  assert.equal(metas[4].fill, 'accent');
});

test('aucun compteur en dessous du plancher', () => {
  assert.equal(shouldShowCount(0), false);
  assert.equal(shouldShowCount(COUNTER_FLOOR - 1), false);
  assert.equal(shouldShowCount(COUNTER_FLOOR), true);
  assert.equal(shouldShowCount(999), true);
});

test('la hauteur estimée croît avec la longueur du texte', () => {
  const court = estimatedHeightOf(textTweet(1, 10), CARD_WIDTH);
  const moyen = estimatedHeightOf(textTweet(2, 80), CARD_WIDTH);
  const long = estimatedHeightOf(textTweet(3, 300), CARD_WIDTH);
  assert.ok(court < moyen, 'court < moyen');
  assert.ok(moyen < long, 'moyen < long');
});

test('la hauteur d’une photo suit la largeur de carte', () => {
  // Une vignette est dimensionnée par un RATIO : deux fois plus large, deux
  // fois plus haute. C'est ce qui permet à la grille de rester juste après une
  // rotation — la largeur est un paramètre, pas une constante figée au
  // chargement du module.
  const etroit = estimatedHeightOf(photoTweet(1), 150);
  const large = estimatedHeightOf(photoTweet(1), 300);
  assert.ok(large > etroit);
});

test('une carte de texte RÉTRÉCIT quand la carte s’élargit', () => {
  // Contre-intuitif mais juste, et c'est le sens qui compte pour l'équilibrage
  // des colonnes : le même texte tient en MOINS de lignes sur une carte plus
  // large, donc la boîte est plus courte. Une estimation qui grandirait avec la
  // largeur décalerait les colonnes à chaque rotation.
  const etroit = estimatedHeightOf(textTweet(1, 40), 150);
  const large = estimatedHeightOf(textTweet(1, 40), 300);
  assert.ok(large < etroit);
});
```

- [ ] **Step 3: Lancer le test pour le voir échouer**

```bash
npm test
```

Attendu : échec, `Cannot find module 'src/components/feed/explore/cardFormat.ts'`.

- [ ] **Step 4: Écrire le module**

Créer `src/components/feed/explore/cardFormat.ts` :

```ts
import { splitTweetMedia, displayContentOf } from '../../../utils/tweetMedia';
import type { Tweet } from '../../../types/api';

/**
 * Toutes les décisions de forme du mur Explorer, en un seul module PUR.
 *
 * ── Pourquoi la forme n'est jamais tirée au sort ───────────────────────────
 * La version précédente choisissait le ratio d'une carte par hash de son id :
 * déterministe, mais arbitraire — la forme ne disait rien du tweet. Ici la
 * forme DÉCOULE de la longueur du texte, donc un tweet court REMPLIT une
 * grande typo et un tweet long reçoit une carte dense. C'est ce qui sépare une
 * mise en page dessinée d'une mise en page générée.
 *
 * ── Pourquoi la largeur est un paramètre ───────────────────────────────────
 * L'ancien module figeait `CARD_WIDTH` au chargement via `Dimensions.get()` :
 * après une rotation ou en écran partagé, toutes les hauteurs estimées étaient
 * fausses et les colonnes partaient en dents de scie. La largeur traverse
 * désormais chaque fonction.
 *
 * ⚠️ INVARIANT : `estimatedHeightOf` doit rester la SEULE source de vérité de
 * la hauteur, utilisée par le rendu ET par l'équilibrage des colonnes. Deux
 * estimations divergentes remettent le bas de page en dents de scie.
 */

export type CardFormat = 'declaration' | 'citation' | 'bloc' | 'photo';
export type CardFill = 'surface' | 'surfaceAlt' | 'accent' | 'contrast';

export interface CardMeta {
  tweet: Tweet;
  format: CardFormat;
  fill: CardFill;
  /** Hauteur estimée, pour l'équilibrage des colonnes. */
  height: number;
}

/** Bornes de longueur. 55 % du corpus réel tient sous `DECLARATION_MAX`. */
export const DECLARATION_MAX = 46;
export const CITATION_MAX = 100;

/**
 * En dessous de ce plancher, aucun compteur n'est affiché.
 * Mesuré en prod : 350 tweets sur 977 ont ≥ 1 like, 21 en ont ≥ 5, 3 en ont
 * ≥ 10. Afficher « 1 ♥ » partout est le signal le plus sûr d'un produit vide ;
 * au-dessus du plancher, le chiffre redevient une distinction rare.
 */
export const COUNTER_FLOOR = 5;

/** Même raisonnement pour « N nouveaux depuis ta dernière visite ». */
export const NEW_SINCE_FLOOR = 5;

/**
 * Cadence des fonds pleins, indexée sur le RANG DE LA DÉCLARATION (pas sur sa
 * position dans la liste) : deux déclarations séparées par des cartes d'un
 * autre format doivent se suivre dans la cadence, sinon la densité de magenta
 * dépend du hasard du mélange `trending`.
 *
 * Cinq crans, dont un accent et un contraste : le magenta touche 1 déclaration
 * sur 5, soit ~11 % de toutes les cartes. Il ponctue, il n'habille pas.
 */
export const FILL_CADENCE: CardFill[] = [
  'surface',
  'surface',
  'accent',
  'surface',
  'contrast',
];

export function formatOf(tweet: Tweet): CardFormat {
  // Le média l'emporte toujours : `hasVisual` gère le cas des vidéos, dont
  // `media_urls` vaut [url_vidéo, url_miniature] — mesurer l'index 0 traitait
  // toute vidéo comme une image et l'affichait comme une case vide.
  if (splitTweetMedia(tweet).hasVisual) return 'photo';
  const length = displayContentOf(tweet).length;
  if (length <= DECLARATION_MAX) return 'declaration';
  if (length <= CITATION_MAX) return 'citation';
  return 'bloc';
}

export function shouldShowCount(n: number): boolean {
  return n >= COUNTER_FLOOR;
}

/**
 * Corps de la Déclaration : plus le tweet est court, plus il est grand.
 * Interlignage serré (0,95 × la taille) — c'est ce qui donne le bloc compact
 * d'une affiche plutôt qu'un paragraphe aéré.
 */
export function declarationType(length: number): {
  fontSize: number;
  lineHeight: number;
  lines: number;
} {
  if (length <= 20) return { fontSize: 36, lineHeight: 34, lines: 4 };
  if (length <= 32) return { fontSize: 32, lineHeight: 30, lines: 5 };
  return { fontSize: 28, lineHeight: 27, lines: 5 };
}

/** Corps des formats Citation et Bloc. */
export function quoteType(length: number): {
  fontSize: number;
  lineHeight: number;
  lines: number;
  boxHeight: (cardWidth: number) => number;
} {
  if (length <= CITATION_MAX) {
    return {
      fontSize: 17,
      lineHeight: 23,
      lines: 6,
      boxHeight: (w) => Math.round(w * 1.02),
    };
  }
  return {
    fontSize: 14.5,
    lineHeight: 19,
    lines: 9,
    boxHeight: (w) => Math.round(w * 1.34),
  };
}

/** Ratio de la vignette photo, choisi par hash stable de l'id. */
const MEDIA_RATIOS = [0.78, 1.05, 1.32, 1.6];

function hashId(id: string | number): number {
  const s = String(id);
  let h = 0;
  for (let i = 0; i < s.length; i += 1) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/**
 * Signature textuelle sous une carte Photo ou Bloc — une seule ligne, sans
 * avatar. Les Déclarations et Citations n'en ont pas du tout : avec 3 comptes
 * pour 88 % du volume, une ligne d'auteur partout affiche les mêmes trois
 * visages en boucle, ce qui lit « désert ».
 */
const BYLINE_HEIGHT = 26;

export function estimatedHeightOf(tweet: Tweet, cardWidth: number): number {
  const format = formatOf(tweet);
  const content = displayContentOf(tweet);

  if (format === 'photo') {
    const ratio = MEDIA_RATIOS[hashId(tweet.id) % MEDIA_RATIOS.length];
    return Math.round(cardWidth * ratio) + BYLINE_HEIGHT;
  }
  if (format === 'declaration') {
    const type = declarationType(content.length);
    // Le bloc plein se dimensionne sur son texte, avec une marge fixe
    // généreuse — c'est une affiche, pas un paragraphe.
    const lines = Math.min(
      type.lines,
      Math.max(1, Math.ceil(content.length / Math.max(8, cardWidth / (type.fontSize * 0.52)))),
    );
    return Math.round(lines * type.lineHeight + 56);
  }
  const type = quoteType(content.length);
  return type.boxHeight(cardWidth) + (format === 'bloc' ? BYLINE_HEIGHT : 0);
}

/**
 * Décrit chaque tweet en un seul passage : format, place dans la cadence de
 * couleur, hauteur estimée. C'est l'entrée unique du mur — `wallLayout` ne
 * manipule que des `CardMeta`, jamais des `Tweet` bruts.
 */
export function describeCards(tweets: Tweet[], cardWidth: number): CardMeta[] {
  let declarationRank = 0;
  return tweets.map((tweet) => {
    const format = formatOf(tweet);
    let fill: CardFill = 'surface';
    if (format === 'declaration') {
      fill = FILL_CADENCE[declarationRank % FILL_CADENCE.length];
      declarationRank += 1;
    } else if (format === 'bloc') {
      // Léger contraste de fond pour distinguer un pavé de texte d'une
      // citation, sans introduire une couleur de plus.
      fill = 'surfaceAlt';
    }
    return { tweet, format, fill, height: estimatedHeightOf(tweet, cardWidth) };
  });
}
```

- [ ] **Step 5: Lancer les tests pour les voir passer**

```bash
npm test
```

Attendu : les 8 tests de `explore-card-format.test.js` passent, et les 78 tests préexistants restent verts.

- [ ] **Step 6: Vérifier les types**

```bash
npm run typecheck
```

Attendu : aucune erreur nouvelle.

- [ ] **Step 7: Commit**

```bash
git add src/theme/colors.ts src/components/feed/explore/cardFormat.ts tests/explore-card-format.test.js
git commit -m "feat(explore): la forme d'une carte découle du tweet, plus d'un hash"
```

---

### Task 2 : Module `wallLayout.ts` — blocs de 7 et rupture

**Files:**
- Create: `src/components/feed/explore/wallLayout.ts`
- Test: `tests/explore-wall-layout.test.js`

**Interfaces:**
- Consumes: `CardMeta` de `./cardFormat`
- Produces:
  - `interface WallBlock { feature: CardMeta; columns: [CardMeta[], CardMeta[]] }`
  - `buildWall(metas: CardMeta[]): WallBlock[]`
  - `BLOCK_SIZE = 7`

- [ ] **Step 1: Écrire le test qui échoue**

Créer `tests/explore-wall-layout.test.js` :

```js
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

const { buildWall, BLOCK_SIZE } = loadTypeScriptModule(
  'src/components/feed/explore/wallLayout.ts',
);

/** Fabrique un CardMeta minimal. */
const meta = (id, format, height = 200) => ({
  tweet: { id: String(id) },
  format,
  fill: 'surface',
  height,
});

const manyBlocs = (n) => {
  const out = [];
  for (let i = 0; i < n; i += 1) out.push(meta(i, 'bloc'));
  return out;
};

test('le mur se découpe en blocs de 7', () => {
  const blocks = buildWall(manyBlocs(21));
  assert.equal(blocks.length, 3);
  for (const block of blocks) {
    const total = 1 + block.columns[0].length + block.columns[1].length;
    assert.equal(total, BLOCK_SIZE);
  }
});

test('la rupture est la première déclaration du bloc', () => {
  const metas = [
    meta(0, 'bloc'), meta(1, 'citation'), meta(2, 'declaration'),
    meta(3, 'declaration'), meta(4, 'bloc'), meta(5, 'bloc'), meta(6, 'bloc'),
  ];
  const [block] = buildWall(metas);
  assert.equal(block.feature.tweet.id, '2');
});

test('à défaut de déclaration, une photo fait la rupture', () => {
  const metas = [
    meta(0, 'bloc'), meta(1, 'citation'), meta(2, 'photo'),
    meta(3, 'bloc'), meta(4, 'bloc'), meta(5, 'bloc'), meta(6, 'bloc'),
  ];
  const [block] = buildWall(metas);
  assert.equal(block.feature.tweet.id, '2');
});

test('sans déclaration ni photo, la rupture est le premier du bloc', () => {
  // Le flux arrive déjà classé par `trending` : le premier est le plus fort.
  const [block] = buildWall(manyBlocs(7));
  assert.equal(block.feature.tweet.id, '0');
});

test('la rupture n’apparaît jamais aussi dans les colonnes', () => {
  const blocks = buildWall(manyBlocs(14));
  for (const block of blocks) {
    const inColumns = [...block.columns[0], ...block.columns[1]].map((m) => m.tweet.id);
    assert.ok(!inColumns.includes(block.feature.tweet.id));
  }
});

test('les colonnes s’équilibrent sur la hauteur, pas en alternant', () => {
  // Une simple alternance gauche/droite laisserait une colonne prendre tout le
  // retard si elle hérite de plusieurs grandes cartes d'affilée.
  const metas = [
    meta(0, 'bloc', 100),   // rupture
    meta(1, 'bloc', 400),
    meta(2, 'bloc', 100),
    meta(3, 'bloc', 100),
    meta(4, 'bloc', 100),
    meta(5, 'bloc', 100),
    meta(6, 'bloc', 100),
  ];
  const [block] = buildWall(metas);
  const h = (col) => col.reduce((sum, m) => sum + m.height, 0);
  const ecart = Math.abs(h(block.columns[0]) - h(block.columns[1]));
  assert.ok(ecart <= 200, `écart trop grand : ${ecart}`);
});

test('un reste plus court qu’un bloc forme quand même un bloc', () => {
  const blocks = buildWall(manyBlocs(9));
  assert.equal(blocks.length, 2);
  const second = blocks[1];
  assert.equal(1 + second.columns[0].length + second.columns[1].length, 2);
});

test('une liste vide ne produit aucun bloc', () => {
  assert.deepEqual(buildWall([]), []);
});

test('un seul tweet devient une rupture sans colonnes', () => {
  const blocks = buildWall([meta(0, 'declaration')]);
  assert.equal(blocks.length, 1);
  assert.equal(blocks[0].columns[0].length, 0);
  assert.equal(blocks[0].columns[1].length, 0);
});
```

- [ ] **Step 2: Lancer le test pour le voir échouer**

```bash
npm test
```

Attendu : échec, `Cannot find module 'src/components/feed/explore/wallLayout.ts'`.

- [ ] **Step 3: Écrire le module**

Créer `src/components/feed/explore/wallLayout.ts` :

```ts
import type { CardMeta } from './cardFormat';

/**
 * Découpage du mur en blocs rythmés.
 *
 * ── Pourquoi des blocs plutôt qu'un masonry continu ────────────────────────
 * Un seul `splitColumns` global sur toute la liste laisse les deux colonnes
 * DÉRIVER : l'écart s'accumule sur des centaines de cartes et le bas de page
 * finit en dents de scie. Par blocs de 7, elles se resynchronisent toutes les
 * sept cartes — et le mur gagne au passage un pouls, puisque chaque bloc
 * s'ouvre sur une carte pleine largeur.
 *
 * Ordre de rendu d'un bloc : la RUPTURE d'abord, puis les deux colonnes. Le
 * flux arrive classé par `trending`, donc la carte promue est la plus forte du
 * bloc : elle doit être vue en premier, pas reléguée en bas.
 */

export const BLOCK_SIZE = 7;

export interface WallBlock {
  /** Carte pleine largeur qui ouvre le bloc. */
  feature: CardMeta;
  /** Le reste du bloc, réparti en deux colonnes équilibrées. */
  columns: [CardMeta[], CardMeta[]];
}

/**
 * La rupture doit avoir de l'impact : une Déclaration en pleine largeur est le
 * moment « tiens » recherché, une Photo à défaut. Sinon on prend le premier —
 * le classement `trending` en fait déjà le plus fort du groupe.
 */
function pickFeature(chunk: CardMeta[]): number {
  const declaration = chunk.findIndex((m) => m.format === 'declaration');
  if (declaration !== -1) return declaration;
  const photo = chunk.findIndex((m) => m.format === 'photo');
  if (photo !== -1) return photo;
  return 0;
}

/** Équilibrage glouton par hauteur cumulée, local à un bloc. */
function splitColumns(metas: CardMeta[]): [CardMeta[], CardMeta[]] {
  const left: CardMeta[] = [];
  const right: CardMeta[] = [];
  let leftHeight = 0;
  let rightHeight = 0;
  for (const meta of metas) {
    if (leftHeight <= rightHeight) {
      left.push(meta);
      leftHeight += meta.height;
    } else {
      right.push(meta);
      rightHeight += meta.height;
    }
  }
  return [left, right];
}

export function buildWall(metas: CardMeta[]): WallBlock[] {
  const blocks: WallBlock[] = [];
  for (let i = 0; i < metas.length; i += BLOCK_SIZE) {
    const chunk = metas.slice(i, i + BLOCK_SIZE);
    const featureIndex = pickFeature(chunk);
    const feature = chunk[featureIndex];
    const rest = chunk.filter((_, index) => index !== featureIndex);
    blocks.push({ feature, columns: splitColumns(rest) });
  }
  return blocks;
}
```

- [ ] **Step 4: Lancer les tests pour les voir passer**

```bash
npm test
```

Attendu : les 9 tests de `explore-wall-layout.test.js` passent, plus tous les précédents.

- [ ] **Step 5: Vérifier les types**

```bash
npm run typecheck
```

- [ ] **Step 6: Commit**

```bash
git add src/components/feed/explore/wallLayout.ts tests/explore-wall-layout.test.js
git commit -m "feat(explore): mur en blocs de 7, colonnes rééquilibrées à chaque bloc"
```

---

### Task 3 : `ExploreCard.tsx` — les quatre formats

**Files:**
- Create: `src/components/feed/explore/ExploreCard.tsx`

**Interfaces:**
- Consumes: `CardMeta`, `declarationType`, `quoteType`, `shouldShowCount` de `./cardFormat` ; `CardRect` de `../ExploreGrid` — **déplacé** ici pour casser la dépendance circulaire (voir Step 1)
- Produces:
  - `export interface CardRect { x: number; y: number; width: number; height: number }`
  - `interface ExploreCardProps { meta: CardMeta; cardWidth: number; wide?: boolean; isNew?: boolean; onPress; onLike; onLongPress }`
  - `export default memo(ExploreCard)`

- [ ] **Step 1: Créer le fichier**

`CardRect` vivait dans `ExploreGrid.tsx`. Il descend ici : `ExploreCard` est ce qui se mesure, et `ExploreGrid` le réexportera pour ne rien casser côté `TweetsScreen`/`ExploreImmersive`.

Créer `src/components/feed/explore/ExploreCard.tsx` :

```tsx
import React, { memo, useCallback, useEffect, useMemo, useRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { colors, fonts, displayNameFonts, radius, withAlpha } from '../../../theme';
import { Tappable } from '../../ui';
import feedback from '../../../utils/feedback';
import { formatCompactCount } from '../../../utils/format';
import { contentSourceOf, displayContentOf, splitTweetMedia } from '../../../utils/tweetMedia';
import { declarationType, quoteType, shouldShowCount, type CardMeta } from './cardFormat';

/** Même fenêtre de double-tap que dans tout le fil. */
const DOUBLE_TAP_MS = 280;
/** Attente avant d'ouvrir, pour laisser passer un éventuel second appui. */
const OPEN_DELAY_MS = 260;
const MAX_FONT_SCALE = 1.2;

/** Position à l'écran d'une carte, pour ouvrir la lecture DEPUIS elle. */
export interface CardRect { x: number; y: number; width: number; height: number }

interface ExploreCardProps {
  meta: CardMeta;
  cardWidth: number;
  /** Carte de rupture : pleine largeur, ouvre un bloc. */
  wide?: boolean;
  /** Publié depuis la dernière visite — point cyan. */
  isNew?: boolean;
  onPress: (tweet: CardMeta['tweet'], from: CardRect | null) => void;
  onLike: (tweet: CardMeta['tweet']) => void;
  onLongPress: (tweet: CardMeta['tweet'], from: CardRect | null) => void;
}

/** Résout le token de fond en couleurs concrètes (fond + texte). */
function paletteFor(fill: CardMeta['fill']): { background: string; text: string; dim: string } {
  switch (fill) {
    case 'accent':
      return { background: colors.accent, text: colors.onAccent, dim: withAlpha(colors.onAccent, 0.72) };
    case 'contrast':
      return { background: colors.blockContrast, text: colors.onBlockContrast, dim: withAlpha(colors.onBlockContrast, 0.6) };
    case 'surfaceAlt':
      return { background: colors.surfaceAlt, text: colors.textPrimary, dim: colors.textSecondary };
    default:
      return { background: colors.surface, text: colors.textPrimary, dim: colors.textSecondary };
  }
}

/**
 * Une carte du mur Explorer.
 *
 * Quatre formats, un seul composant : ils partagent la mesure, le double-tap
 * et l'appui long, et ne diffèrent que par leur corps. Les séparer en quatre
 * composants dupliquerait trois fois cette mécanique de geste, qui est
 * précisément la partie fragile.
 *
 * ⚠️ Pas d'animation d'apparition : le rythme vient de la mise en page.
 */
function ExploreCard({
  meta, cardWidth, wide = false, isNew = false, onPress, onLike, onLongPress,
}: ExploreCardProps) {
  const { tweet, format } = meta;
  const content = useMemo(() => displayContentOf(tweet), [tweet]);
  const media = useMemo(() => splitTweetMedia(tweet), [tweet]);
  const author = useMemo(() => contentSourceOf(tweet)?.author, [tweet]);
  const palette = useMemo(() => paletteFor(meta.fill), [meta.fill]);

  const likes = tweet.stats?.likes ?? 0;
  const views = tweet.stats?.views ?? 0;
  const isLiked = !!tweet.user_interaction?.is_liked;

  const lastTapRef = useRef(0);
  const openTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const frameRef = useRef<View>(null);
  const bigHeart = useSharedValue(0);

  useEffect(() => () => {
    if (openTimerRef.current) clearTimeout(openTimerRef.current);
  }, []);

  const bigHeartStyle = useAnimatedStyle(() => ({
    opacity: interpolate(bigHeart.value, [0, 0.12, 0.7, 1], [0, 0.95, 0.9, 0], Extrapolation.CLAMP),
    transform: [{
      scale: interpolate(bigHeart.value, [0, 0.15, 0.3, 0.6, 1], [0.2, 1.2, 0.95, 1, 0.75], Extrapolation.CLAMP),
    }],
  }));

  /** Mesure synchrone : le doigt est encore posé, la grille n'a pas bougé. */
  const measure = useCallback((then: (rect: CardRect | null) => void) => {
    let measured: CardRect | null = null;
    frameRef.current?.measureInWindow((x, y, width, height) => {
      if (width > 0 && height > 0) measured = { x, y, width, height };
    });
    then(measured);
  }, []);

  const handlePress = useCallback(() => {
    const now = Date.now();
    const isDoubleTap = now - lastTapRef.current < DOUBLE_TAP_MS;
    lastTapRef.current = now;

    if (isDoubleTap) {
      if (openTimerRef.current) { clearTimeout(openTimerRef.current); openTimerRef.current = null; }
      bigHeart.value = 0;
      bigHeart.value = withTiming(1, { duration: 700 });
      // Ne jamais RETIRER un like : `apiService.likeTweet` bascule côté serveur,
      // un appel de trop annulerait le like au lieu d'en ajouter un.
      if (!isLiked) { feedback.select(); onLike(tweet); }
      return;
    }

    measure((rect) => {
      openTimerRef.current = setTimeout(() => {
        openTimerRef.current = null;
        onPress(tweet, rect);
      }, OPEN_DELAY_MS);
    });
  }, [bigHeart, isLiked, measure, onLike, onPress, tweet]);

  /**
   * `Gesture.LongPress` plutôt que la prop `onLongPress` de Tappable : il faut
   * la même horloge que le double-tap pour qu'un appui maintenu n'ouvre jamais
   * la lecture en plus du panneau.
   *
   * ⚠️ `scheduleOnRN`, pas `runOnJS` : appeler une fonction JS ordinaire
   * directement depuis un worklet tue l'app SANS AUCUN LOG.
   */
  const longPress = useMemo(
    () => Gesture.LongPress().minDuration(350).onStart(() => {
      'worklet';
      scheduleOnRN(() => {
        if (openTimerRef.current) { clearTimeout(openTimerRef.current); openTimerRef.current = null; }
        feedback.tap();
        measure((rect) => onLongPress(tweet, rect));
      });
    }),
    [measure, onLongPress, tweet],
  );

  const showLikes = shouldShowCount(likes);
  const showViews = shouldShowCount(views);

  let body: React.ReactNode = null;

  if (format === 'photo') {
    const ratio = wide ? 0.62 : 1.05;
    body = (
      <View>
        {media.coverUrl ? (
          <Image
            source={{ uri: media.coverUrl }}
            style={{ width: '100%', height: Math.round(cardWidth * ratio), backgroundColor: colors.surfaceAlt }}
            contentFit="cover"
            cachePolicy="memory-disk"
            transition={140}
            recyclingKey={media.coverUrl}
          />
        ) : (
          <View style={{ width: '100%', height: Math.round(cardWidth * ratio), backgroundColor: colors.surfaceAlt }} />
        )}
        {!!media.videoUrl && (
          <View style={styles.videoBadge} pointerEvents="none">
            <Ionicons name="play" size={11} color={colors.white} />
            {showViews && (
              <Text style={styles.videoBadgeText} maxFontSizeMultiplier={MAX_FONT_SCALE}>
                {formatCompactCount(views)}
              </Text>
            )}
          </View>
        )}
      </View>
    );
  } else if (format === 'declaration') {
    const type = declarationType(content.length);
    body = (
      <View style={[styles.declarationBox, wide && styles.declarationBoxWide]}>
        <Text
          style={[styles.declarationText, {
            color: palette.text,
            fontSize: wide ? type.fontSize * 1.25 : type.fontSize,
            lineHeight: wide ? type.lineHeight * 1.25 : type.lineHeight,
          }]}
          numberOfLines={type.lines}
          maxFontSizeMultiplier={MAX_FONT_SCALE}
        >
          {content}
        </Text>
      </View>
    );
  } else {
    const type = quoteType(content.length);
    const isCitation = format === 'citation';
    body = (
      <View style={[styles.quoteBox, isCitation && styles.citationBox]}>
        <Text
          style={[
            isCitation ? styles.citationText : styles.blocText,
            { color: palette.text, fontSize: type.fontSize, lineHeight: type.lineHeight },
          ]}
          numberOfLines={type.lines}
          maxFontSizeMultiplier={MAX_FONT_SCALE}
        >
          {content}
        </Text>
      </View>
    );
  }

  // Signature textuelle SANS avatar, et seulement là où elle apporte quelque
  // chose : une Déclaration ou une Citation est l'objet lui-même.
  const showByline = format === 'photo' || format === 'bloc';

  return (
    <GestureDetector gesture={longPress}>
      <Tappable
        style={[
          styles.card,
          { width: wide ? '100%' : cardWidth, backgroundColor: palette.background },
        ]}
        onPress={handlePress}
        scaleTo={0.97}
        accessibilityLabel={content || 'Tweet'}
      >
        {/* `collapsable={false}` : sans lui, Android fusionne cette vue avec
            son parent et `measureInWindow` n'a plus rien à mesurer. */}
        <View ref={frameRef} collapsable={false}>
          {body}

          {isNew && <View style={styles.newDot} pointerEvents="none" />}

          <Animated.View pointerEvents="none" style={[styles.bigHeart, bigHeartStyle]}>
            <Ionicons name="heart" size={wide ? 84 : 56} color={colors.white} />
          </Animated.View>
        </View>

        {(showByline || showLikes) && (
          <View style={styles.byline}>
            {showByline && (
              <Text
                style={[styles.bylineText, { color: palette.dim }]}
                numberOfLines={1}
                maxFontSizeMultiplier={MAX_FONT_SCALE}
              >
                {author?.username ? `@${author.username}` : ''}
              </Text>
            )}
            {showLikes && (
              <View style={styles.likeChip}>
                <Ionicons
                  name={isLiked ? 'heart' : 'heart-outline'}
                  size={12}
                  color={isLiked ? colors.like : palette.dim}
                />
                <Text
                  style={[styles.likeText, { color: palette.dim }]}
                  maxFontSizeMultiplier={MAX_FONT_SCALE}
                >
                  {formatCompactCount(likes)}
                </Text>
              </View>
            )}
          </View>
        )}
      </Tappable>
    </GestureDetector>
  );
}

export default memo(ExploreCard);

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.lg,
    overflow: 'hidden',
  },
  declarationBox: { paddingHorizontal: 16, paddingTop: 20, paddingBottom: 18 },
  declarationBoxWide: { paddingHorizontal: 24, paddingTop: 34, paddingBottom: 32 },
  declarationText: {
    fontFamily: displayNameFonts.poster,
    letterSpacing: -0.4,
  },
  quoteBox: { paddingHorizontal: 15, paddingTop: 16, paddingBottom: 14 },
  citationBox: {
    borderLeftWidth: 3,
    borderLeftColor: colors.accent,
  },
  citationText: { fontFamily: displayNameFonts.editorial },
  blocText: { fontFamily: fonts.medium },

  videoBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: radius.md,
    backgroundColor: withAlpha('#000000', 0.55),
  },
  videoBadgeText: {
    color: colors.white,
    fontSize: 10.5,
    fontFamily: fonts.semibold,
    fontVariant: ['tabular-nums'],
  },

  newDot: {
    position: 'absolute',
    top: 10,
    left: 10,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.cyan,
  },

  bigHeart: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },

  byline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingBottom: 10,
    paddingTop: 2,
  },
  bylineText: { flex: 1, fontSize: 11.5, fontFamily: fonts.semibold },
  likeChip: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  likeText: { fontSize: 11, fontFamily: fonts.medium, fontVariant: ['tabular-nums'] },
});
```

- [ ] **Step 2: Vérifier les types**

```bash
npm run typecheck
```

Attendu : aucune erreur. Si `borderCurve` est refusé par la version de types RN, le retirer des styles plutôt que de caster.

- [ ] **Step 3: Commit**

```bash
git add src/components/feed/explore/ExploreCard.tsx
git commit -m "feat(explore): carte typographique à quatre formats, sans avatar répété"
```

---

### Task 4 : `ExploreHero.tsx` — la bande d'entrée

**Files:**
- Create: `src/components/feed/explore/ExploreHero.tsx`

**Interfaces:**
- Consumes: `CardMeta` et `declarationType` de `./cardFormat`, `CardRect` de `./ExploreCard`
- Produces: `interface ExploreHeroProps { metas: CardMeta[]; onOpen: (tweet, from: CardRect | null) => void }`, `export default memo(ExploreHero)`, `HERO_COUNT = 5`

- [ ] **Step 1: Créer le fichier**

Créer `src/components/feed/explore/ExploreHero.tsx` :

```tsx
import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  cancelAnimation,
  Easing as REasing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { colors, displayNameFonts, duration, easing, fonts, radius, withAlpha } from '../../../theme';
import { displayContentOf, splitTweetMedia } from '../../../utils/tweetMedia';
import { declarationType, type CardMeta } from './cardFormat';
import type { CardRect } from './ExploreCard';

/** Nombre de tweets consommés par la bande — le mur commence après. */
export const HERO_COUNT = 5;

/** Durée d'affichage d'un tweet avant enchaînement automatique. */
const DWELL_MS = 4500;

interface ExploreHeroProps {
  metas: CardMeta[];
  onOpen: (tweet: CardMeta['tweet'], from: CardRect | null) => void;
}

/**
 * La bande qui joue seule à l'ouverture d'Explorer.
 *
 * ── Pourquoi elle existe ───────────────────────────────────────────────────
 * Une grille froide oblige à CHOISIR quoi toucher avant que quoi que ce soit
 * n'arrive. Ici quelque chose se passe dès la première frame, sans décision.
 * Elle consomme les 5 premiers tweets du tirage — ceux que le moteur
 * échantillonne déjà à basse température dans le haut du classement, donc les
 * plus forts : ils méritent mieux que d'être noyés dans le mur.
 *
 * ── Pourquoi la progression est une valeur partagée, pas un setInterval ────
 * Il faut pouvoir l'interrompre AU DOIGT et la REPRENDRE là où elle en était.
 * Un `setInterval` ne sait faire ni l'un ni l'autre : il faudrait le tuer et
 * recalculer le reliquat à la main. Ici `cancelAnimation` fige la valeur, et la
 * reprise relance un `withTiming` sur la durée restante.
 */
function ExploreHero({ metas, onOpen }: ExploreHeroProps) {
  const { width, height } = useWindowDimensions();
  const [index, setIndex] = useState(0);
  const progress = useSharedValue(0);
  const drift = useSharedValue(0);
  const fade = useSharedValue(1);
  const frameRef = useRef<View>(null);

  const slides = useMemo(() => metas.slice(0, HERO_COUNT), [metas]);
  const count = slides.length;
  const bandHeight = Math.round(height * 0.38);

  const goTo = useCallback((next: number) => {
    if (count === 0) return;
    const wrapped = ((next % count) + count) % count;
    // Fondu croisé court + dérive latérale : l'œil suit le mouvement au lieu
    // de subir un remplacement sec.
    fade.value = withTiming(0, { duration: 110, easing: easing.in }, (done) => {
      'worklet';
      if (done) {
        scheduleOnRN(setIndex, wrapped);
        drift.value = 24;
        fade.value = withTiming(1, { duration: duration.base, easing: easing.out });
        drift.value = withTiming(0, { duration: duration.base, easing: easing.out });
      }
    });
  }, [count, drift, fade]);

  /** Relance la barre depuis sa position courante, sur la durée restante. */
  const runProgress = useCallback((from: number) => {
    progress.value = from;
    progress.value = withTiming(
      1,
      // Linéaire : elle MESURE du temps. Une courbe la ferait patiner puis
      // accélérer, et l'attente paraîtrait irrégulière.
      { duration: Math.max(0, DWELL_MS * (1 - from)), easing: REasing.linear },
      (done) => {
        'worklet';
        if (done) scheduleOnRN(goTo, 0 + 1 + 0);
      },
    );
  }, [goTo, progress]);

  useEffect(() => {
    if (count === 0) return;
    runProgress(0);
    return () => cancelAnimation(progress);
  }, [index, count, runProgress, progress]);

  /**
   * UN SEUL geste sur la bande : un `Tap`.
   *
   * ⚠️ Surtout PAS de `Gesture.Pan` horizontal ici. `TweetsScreen.tsx:411`
   * enveloppe tout le fil — Explorer compris — dans un Pan horizontal
   * (`activeOffsetX([-24, 24])`) qui change d'onglet. Un Pan imbriqué sans
   * relation déclarée laisse les deux s'activer : on changerait d'onglet ET de
   * tweet. Ce geste d'onglet est le code le plus délicat de l'écran et il n'a
   * jamais été essayé à la main — on ne le met pas en risque pour un balayage
   * manuel qui n'est qu'un bonus. La bande avance toute seule ; c'est sa
   * promesse.
   *
   * Et pas d'`onTouchEnd` sur la vue non plus : un glissé se termine aussi par
   * un « touch end », donc le moindre balayage ouvrirait la lecture.
   *
   * `onTouchesDown` se déclenche que le tap s'active ou non — poser le doigt
   * met donc la barre en pause même si le geste finit par échouer. Et
   * `onFinalize` reçoit `success` : on ne reprend la barre que si le tap n'a
   * PAS abouti (sinon la lecture s'ouvre par-dessus, rien à reprendre).
   */
  const tap = useMemo(
    () => Gesture.Tap()
      .maxDistance(10)
      .onTouchesDown(() => {
        'worklet';
        // Pause nette : la valeur reste où elle est, jamais remise à 0.
        cancelAnimation(progress);
      })
      .onEnd(() => {
        'worklet';
        scheduleOnRN(handlePress);
      })
      .onFinalize((_event, success) => {
        'worklet';
        // Reprise sur la durée RESTANTE — d'où le passage de `progress.value`.
        if (!success) scheduleOnRN(runProgress, progress.value, index + 1);
      }),
    [handlePress, index, progress, runProgress],
  );

  const bodyStyle = useAnimatedStyle(() => ({
    opacity: fade.value,
    transform: [{ translateX: drift.value }],
  }));

  const barStyle = useAnimatedStyle(() => ({ width: `${progress.value * 100}%` }));

  const handlePress = useCallback(() => {
    const current = slides[index];
    if (!current) return;
    let measured: CardRect | null = null;
    frameRef.current?.measureInWindow((x, y, w, h) => {
      if (w > 0 && h > 0) measured = { x, y, width: w, height: h };
    });
    onOpen(current.tweet, measured);
  }, [index, onOpen, slides]);

  if (count === 0) return null;

  const current = slides[index];
  const content = displayContentOf(current.tweet);
  const media = splitTweetMedia(current.tweet);
  const type = declarationType(content.length);

  return (
    <GestureDetector gesture={tap}>
      <View
        ref={frameRef}
        collapsable={false}
        style={[styles.band, { height: bandHeight, width: width - 24 }]}
      >
        <Animated.View style={[styles.body, bodyStyle]}>
          {media.hasVisual && media.coverUrl ? (
            <>
              <Image
                source={{ uri: media.coverUrl }}
                style={StyleSheet.absoluteFill}
                contentFit="cover"
                cachePolicy="memory-disk"
                transition={140}
              />
              <View style={styles.scrim} pointerEvents="none" />
            </>
          ) : null}
          <Text
            style={[styles.text, {
              fontSize: Math.min(44, type.fontSize * 1.35),
              lineHeight: Math.min(42, type.lineHeight * 1.35),
            }]}
            numberOfLines={5}
            maxFontSizeMultiplier={1.2}
          >
            {content}
          </Text>
        </Animated.View>

        <View style={styles.track} pointerEvents="none">
          {slides.map((meta, i) => (
            <View key={meta.tweet.id} style={styles.segment}>
              {i < index && <View style={styles.segmentFull} />}
              {i === index && <Animated.View style={[styles.segmentFull, barStyle]} />}
            </View>
          ))}
        </View>
      </View>
    </GestureDetector>
  );
}

export default memo(ExploreHero);

const styles = StyleSheet.create({
  band: {
    alignSelf: 'center',
    borderRadius: radius.lg,
    overflow: 'hidden',
    backgroundColor: colors.accent,
    marginBottom: 14,
  },
  body: { flex: 1, justifyContent: 'flex-end', padding: 20 },
  scrim: { ...StyleSheet.absoluteFillObject, backgroundColor: withAlpha('#000000', 0.42) },
  text: {
    color: colors.onAccent,
    fontFamily: displayNameFonts.poster,
    letterSpacing: -0.6,
  },
  track: {
    position: 'absolute',
    top: 12,
    left: 14,
    right: 14,
    flexDirection: 'row',
    gap: 4,
  },
  segment: {
    flex: 1,
    height: 2.5,
    borderRadius: 2,
    overflow: 'hidden',
    backgroundColor: withAlpha('#FFFFFF', 0.28),
  },
  segmentFull: { height: '100%', width: '100%', backgroundColor: '#FFFFFF' },
});
```

- [ ] **Step 2: Corriger l'appel d'avance automatique**

Le callback de `runProgress` doit avancer d'un cran **relatif à l'index courant**. Remplacer dans `runProgress` la ligne :

```ts
        if (done) scheduleOnRN(goTo, 0 + 1 + 0);
```

par un passage explicite de l'index suivant. Modifier la signature :

```ts
  const runProgress = useCallback((from: number, nextIndex: number) => {
    progress.value = from;
    progress.value = withTiming(
      1,
      { duration: Math.max(0, DWELL_MS * (1 - from)), easing: REasing.linear },
      (done) => {
        'worklet';
        if (done) scheduleOnRN(goTo, nextIndex);
      },
    );
  }, [goTo, progress]);
```

Et son appel de démarrage :

```ts
  useEffect(() => {
    if (count === 0) return;
    runProgress(0, index + 1);
    return () => cancelAnimation(progress);
  }, [index, count, runProgress, progress]);
```

L'autre appel — la reprise après une pause — est déjà écrit sous cette forme
dans le `onFinalize` du geste `tap` ci-dessus : `scheduleOnRN(runProgress,
progress.value, index + 1)`. Rien à changer là.

- [ ] **Step 3: Vérifier les types**

```bash
npm run typecheck
```

- [ ] **Step 4: Commit**

```bash
git add src/components/feed/explore/ExploreHero.tsx
git commit -m "feat(explore): bande d'entrée auto-défilante, interruptible au doigt"
```

---

### Task 5 : `ExploreActionSheet.tsx` — le panneau d'appui long

**Files:**
- Create: `src/components/feed/explore/ExploreActionSheet.tsx`

**Interfaces:**
- Consumes: `CardRect` de `./ExploreCard`
- Produces: `interface ExploreActionSheetProps { tweet: Tweet | null; origin: CardRect | null; isFollowing: boolean; onClose; onLike; onFollow; onReply; onShare; onNotInterested }`, `export default memo(ExploreActionSheet)`

⚠️ **Contrainte relevée dans le code existant :** `handleExploreFollow` dans `TweetsScreen.tsx:1838` **ne sait que suivre** — il sort immédiatement si l'auteur est déjà suivi (`if (!authorId || followingIds.has(authorId)) return;`). La ligne « Suivre l'auteur » n'est donc affichée **que si on ne suit pas déjà**, au lieu de proposer un « Ne plus suivre » qui ne ferait rien. Ajouter le désabonnement est hors périmètre.

- [ ] **Step 1: Créer le fichier**

Créer `src/components/feed/explore/ExploreActionSheet.tsx` :

```tsx
import React, { memo, useEffect, useMemo } from 'react';
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  withSpring,
} from 'react-native-reanimated';

import { colors, duration, easing, fonts, radius, spring, withAlpha } from '../../../theme';
import feedback from '../../../utils/feedback';
import type { Tweet } from '../../../types/api';
import type { CardRect } from './ExploreCard';

interface ExploreActionSheetProps {
  /** `null` = fermé. */
  tweet: Tweet | null;
  origin: CardRect | null;
  isFollowing: boolean;
  onClose: () => void;
  onLike: (tweet: Tweet) => void;
  onFollow: (tweet: Tweet) => void;
  onReply: (tweet: Tweet) => void;
  onShare: (tweet: Tweet) => void;
  onNotInterested: (tweet: Tweet) => void;
}

const SHEET_WIDTH = 232;

/**
 * Panneau d'actions ouvert par appui long sur une carte.
 *
 * ── Pourquoi pas une <Modal> ───────────────────────────────────────────────
 * Une `<Modal>` est une FENÊTRE NATIVE : elle n'affiche jamais ce qu'il y a
 * derrière, donc le mur disparaîtrait — exactement l'aller-retour qu'on
 * cherche à supprimer. Ici c'est une vue absolue au-dessus de la grille : la
 * position de défilement est intacte, et on voit la carte concernée.
 *
 * ── Pourquoi il grandit depuis la carte ────────────────────────────────────
 * Un panneau qui apparaît au centre de l'écran n'a aucun lien visible avec ce
 * qu'on vient de toucher. Ancré sur le rectangle mesuré, il dit de quoi il
 * parle sans le moindre libellé. On part de 0,92 et jamais de 0 : une échelle
 * nulle donne un surgissement, pas une ouverture.
 */
function ExploreActionSheet({
  tweet, origin, isFollowing, onClose, onLike, onFollow, onReply, onShare, onNotInterested,
}: ExploreActionSheetProps) {
  const { width, height } = useWindowDimensions();
  const open = useSharedValue(0);

  useEffect(() => {
    if (tweet) {
      open.value = withSpring(1, spring);
    } else {
      open.value = withTiming(0, { duration: duration.fast, easing: easing.in });
    }
  }, [tweet, open]);

  // Position : collée à la carte, rabattue dans l'écran si elle déborde.
  const anchor = useMemo(() => {
    if (!origin) return { top: height / 2 - 120, left: width / 2 - SHEET_WIDTH / 2 };
    const left = Math.min(Math.max(12, origin.x), width - SHEET_WIDTH - 12);
    const below = origin.y + origin.height + 8;
    const top = below + 260 > height ? Math.max(60, origin.y - 268) : below;
    return { top, left };
  }, [origin, width, height]);

  const backdropStyle = useAnimatedStyle(() => ({ opacity: open.value }));
  const sheetStyle = useAnimatedStyle(() => ({
    opacity: open.value,
    transform: [{ scale: 0.92 + open.value * 0.08 }],
  }));

  if (!tweet) return null;

  const act = (fn: (t: Tweet) => void) => () => {
    feedback.tap();
    fn(tweet);
    onClose();
  };

  const rows: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void; danger?: boolean }[] = [
    { icon: 'heart-outline', label: 'Aimer', onPress: act(onLike) },
    // Pas de « Ne plus suivre » : `handleExploreFollow` sort immédiatement si
    // l'auteur est déjà suivi. Proposer un geste qui ne fait rien est pire que
    // ne pas le proposer.
    ...(isFollowing
      ? []
      : [{ icon: 'person-add-outline' as const, label: 'Suivre l’auteur', onPress: act(onFollow) }]),
    { icon: 'chatbubble-outline', label: 'Répondre', onPress: act(onReply) },
    { icon: 'arrow-redo-outline', label: 'Partager', onPress: act(onShare) },
    { icon: 'eye-off-outline', label: 'Moins de ça', onPress: act(onNotInterested), danger: true },
  ];

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <Animated.View style={[StyleSheet.absoluteFill, styles.backdrop, backdropStyle]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Fermer" />
      </Animated.View>

      <Animated.View style={[styles.sheet, anchor, sheetStyle]}>
        {rows.map((row, i) => (
          <Pressable
            key={row.label}
            onPress={row.onPress}
            style={({ pressed }) => [
              styles.row,
              i > 0 && styles.rowBorder,
              pressed && styles.rowPressed,
            ]}
          >
            <Ionicons
              name={row.icon}
              size={17}
              color={row.danger ? colors.textMuted : colors.textPrimary}
            />
            <Text
              style={[styles.rowText, row.danger && styles.rowTextDanger]}
              maxFontSizeMultiplier={1.2}
            >
              {row.label}
            </Text>
          </Pressable>
        ))}
      </Animated.View>
    </View>
  );
}

export default memo(ExploreActionSheet);

const styles = StyleSheet.create({
  backdrop: { backgroundColor: withAlpha('#000000', 0.45) },
  sheet: {
    position: 'absolute',
    width: SHEET_WIDTH,
    borderRadius: radius.lg,
    // Fond OPAQUE obligatoire : rien ne doit transparaître à travers.
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
    boxShadow: '0 12px 32px rgba(0,0,0,0.45)',
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 11, paddingHorizontal: 15, paddingVertical: 13 },
  rowBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  rowPressed: { backgroundColor: colors.surfaceHover },
  rowText: { flex: 1, color: colors.textPrimary, fontSize: 14, fontFamily: fonts.medium },
  rowTextDanger: { color: colors.textMuted },
});
```

- [ ] **Step 2: Vérifier les types**

```bash
npm run typecheck
```

- [ ] **Step 3: Commit**

```bash
git add src/components/feed/explore/ExploreActionSheet.tsx
git commit -m "feat(explore): panneau d'actions ancré sur la carte, sans navigation"
```

---

### Task 6 : `ExploreWall.tsx` — assemblage et pagination

**Files:**
- Create: `src/components/feed/explore/ExploreWall.tsx`

**Interfaces:**
- Consumes: `describeCards` de `./cardFormat`, `buildWall` de `./wallLayout`, `ExploreCard` + `CardRect`, `ExploreHero` + `HERO_COUNT`
- Produces: `interface ExploreWallProps { … }`, `export default memo(ExploreWall)`

- [ ] **Step 1: Créer le fichier**

Créer `src/components/feed/explore/ExploreWall.tsx` :

```tsx
import React, { memo, useCallback, useMemo, useRef } from 'react';
import {
  NativeScrollEvent,
  NativeSyntheticEvent,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { colors, fonts, radius } from '../../../theme';
import { AppRefreshControl, Tappable } from '../../ui';
import { describeCards, NEW_SINCE_FLOOR } from './cardFormat';
import { buildWall } from './wallLayout';
import ExploreCard, { type CardRect } from './ExploreCard';
import ExploreHero, { HERO_COUNT } from './ExploreHero';
import type { Tweet } from '../../../types/api';

const GRID_PADDING = 12;
const GRID_GAP = 10;
/** Respiration autour d'une rupture — plus large que l'écart de grille. */
const FEATURE_GAP = 16;
/** La tab bar est absolue et recouvre le bas de l'écran. */
const BOTTOM_INSET = 96;
/** Avance de pagination, en hauteurs d'écran. */
const PREFETCH_SCREENS = 2;

interface ExploreWallProps {
  tweets: Tweet[];
  refreshing: boolean;
  loadingMore: boolean;
  hasMore: boolean;
  /** Date de la dernière visite, en millisecondes. `null` = première visite. */
  lastVisitAt: number | null;
  onRefresh: () => void;
  onEndReached: () => void;
  onOpenTweet: (tweet: Tweet, from: CardRect | null) => void;
  onLikeTweet: (tweet: Tweet) => void;
  onLongPressTweet: (tweet: Tweet, from: CardRect | null) => void;
  onDrawMore: () => void;
  ListHeaderComponent?: React.ReactElement | null;
}

function ExploreWall({
  tweets, refreshing, loadingMore, hasMore, lastVisitAt,
  onRefresh, onEndReached, onOpenTweet, onLikeTweet, onLongPressTweet, onDrawMore,
  ListHeaderComponent,
}: ExploreWallProps) {
  const { width } = useWindowDimensions();
  const endReachedFiredRef = useRef(false);

  // `useWindowDimensions` et non `Dimensions.get()` : la largeur doit suivre
  // une rotation ou un écran partagé, sinon toutes les hauteurs estimées sont
  // fausses et les colonnes partent en dents de scie.
  const cardWidth = (width - GRID_PADDING * 2 - GRID_GAP) / 2;

  const metas = useMemo(() => describeCards(tweets, cardWidth), [tweets, cardWidth]);
  const heroMetas = useMemo(() => metas.slice(0, HERO_COUNT), [metas]);
  const blocks = useMemo(() => buildWall(metas.slice(HERO_COUNT)), [metas]);

  const isNew = useCallback((tweet: Tweet) => {
    if (!lastVisitAt || !tweet.created_at) return false;
    return new Date(tweet.created_at).getTime() > lastVisitAt;
  }, [lastVisitAt]);

  const newCount = useMemo(
    () => (lastVisitAt ? tweets.filter(isNew).length : 0),
    [tweets, lastVisitAt, isNew],
  );

  const handleScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
    const distance = contentSize.height - layoutMeasurement.height - contentOffset.y;
    if (distance < layoutMeasurement.height * PREFETCH_SCREENS) {
      if (!endReachedFiredRef.current) {
        endReachedFiredRef.current = true;
        onEndReached();
      }
    } else {
      endReachedFiredRef.current = false;
    }
  }, [onEndReached]);

  const renderCard = (meta: (typeof metas)[number], wide: boolean) => (
    <ExploreCard
      key={meta.tweet.id}
      meta={meta}
      cardWidth={cardWidth}
      wide={wide}
      isNew={isNew(meta.tweet)}
      onPress={onOpenTweet}
      onLike={onLikeTweet}
      onLongPress={onLongPressTweet}
    />
  );

  return (
    <ScrollView
      style={styles.list}
      contentContainerStyle={styles.listContent}
      showsVerticalScrollIndicator={false}
      refreshControl={<AppRefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      onScroll={handleScroll}
      scrollEventThrottle={100}
    >
      {ListHeaderComponent}

      <ExploreHero metas={heroMetas} onOpen={onOpenTweet} />

      {/* En dessous du plancher, aucune ligne : mieux vaut rien qu'un
          « 2 nouveaux », qui fait paraître le produit vide. */}
      {newCount >= NEW_SINCE_FLOOR && (
        <Text style={styles.newSince} maxFontSizeMultiplier={1.2}>
          {newCount} nouveaux depuis ta dernière visite
        </Text>
      )}

      {blocks.map((block) => (
        <View key={block.feature.tweet.id}>
          <View style={styles.feature}>{renderCard(block.feature, true)}</View>
          <View style={styles.columns}>
            <View style={styles.column}>
              {block.columns[0].map((meta) => (
                <View key={meta.tweet.id} style={styles.cell}>{renderCard(meta, false)}</View>
              ))}
            </View>
            <View style={styles.column}>
              {block.columns[1].map((meta) => (
                <View key={meta.tweet.id} style={styles.cell}>{renderCard(meta, false)}</View>
              ))}
            </View>
          </View>
        </View>
      ))}

      {loadingMore && (
        <View style={styles.loadingRow}>
          <View style={[styles.loadingCard, { width: cardWidth }]} />
          <View style={[styles.loadingCard, { width: cardWidth }]} />
        </View>
      )}

      {/* Fin de vivier : « Vous êtes à jour » est un point final, et le seul
          geste qu'il laisse est de quitter la page. Le classement est retiré à
          chaque recalcul, donc un nouveau tirage remonte réellement des tweets
          restés sous la coupure. */}
      {!hasMore && !loadingMore && (
        <Tappable style={styles.drawMore} onPress={onDrawMore} scaleTo={0.98}>
          <Ionicons name="sparkles-outline" size={15} color={colors.accent} />
          <Text style={styles.drawMoreText} maxFontSizeMultiplier={1.2}>Nouveau tirage</Text>
        </Tappable>
      )}
    </ScrollView>
  );
}

export default memo(ExploreWall);

const styles = StyleSheet.create({
  list: { flex: 1 },
  listContent: {
    paddingHorizontal: GRID_PADDING,
    paddingTop: 4,
    paddingBottom: BOTTOM_INSET,
  },
  feature: { marginBottom: FEATURE_GAP },
  columns: { flexDirection: 'row', gap: GRID_GAP },
  column: { flex: 1 },
  cell: { marginBottom: GRID_GAP },

  newSince: {
    color: colors.cyan,
    fontSize: 12.5,
    fontFamily: fonts.semibold,
    marginBottom: 12,
    marginLeft: 2,
  },

  loadingRow: { flexDirection: 'row', gap: GRID_GAP, marginTop: 2 },
  loadingCard: {
    height: 160,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceAlt,
  },
  drawMore: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    marginTop: 14,
    paddingVertical: 13,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  drawMoreText: { color: colors.textPrimary, fontSize: 13.5, fontFamily: fonts.semibold },
});
```

- [ ] **Step 2: Vérifier les types**

```bash
npm run typecheck
```

- [ ] **Step 3: Commit**

```bash
git add src/components/feed/explore/ExploreWall.tsx
git commit -m "feat(explore): assemblage du mur, largeur réactive et pagination"
```

---

### Task 7 : Réécrire `ExploreGrid.tsx` en assembleur

**Files:**
- Modify: `src/components/feed/ExploreGrid.tsx` (réécriture complète)

**Interfaces:**
- Consumes: `ExploreWall`, `ExploreActionSheet`, `CardRect`
- Produces: `ExploreGridProps` **inchangé** plus `lastVisitAt: number | null`, `isFollowing: (tweet: Tweet) => boolean`, `onFollow: (tweet: Tweet) => void`, `onShare: (tweetId: string) => void`, `onInterest: (tweet: Tweet, interested: boolean) => void` ; réexporte `export type { CardRect }`. **Pas de prop `onReply`** — `ExploreGrid` héberge `CommentSheet` et fabrique `handleReply` en interne.

- [ ] **Step 1: Remplacer intégralement le fichier**

Écraser `src/components/feed/ExploreGrid.tsx` :

```tsx
import React, { memo, useCallback, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { AppRefreshControl, EmptyState, ErrorState } from '../ui';
import TweetSkeleton from './TweetSkeleton';
import { CommentSheet } from '../CommentSheet';
import { contentSourceOf } from '../../utils/tweetMedia';
import ExploreWall from './explore/ExploreWall';
import ExploreActionSheet from './explore/ExploreActionSheet';
import type { CardRect } from './explore/ExploreCard';
import type { Tweet } from '../../types/api';

/**
 * Point d'entrée de l'onglet « Explorer ».
 *
 * Ce fichier ne fait plus QUE deux choses : choisir l'état à montrer
 * (chargement / erreur / vide / mur) et tenir l'état du panneau d'appui long.
 * Toute la mise en page vit dans `explore/` — la version précédente mélangeait
 * ici la carte, le masonry, la pagination et les états sur 598 lignes.
 *
 * `CardRect` est réexporté : `TweetsScreen` et `ExploreImmersive` l'importent
 * depuis ce module depuis la 6ᵉ passe, et rien ne justifie de les toucher.
 */
export type { CardRect };

export interface ExploreGridProps {
  tweets: Tweet[];
  loading: boolean;
  loadingMore: boolean;
  refreshing: boolean;
  hasMore: boolean;
  error: string | null;
  onRefresh: () => void;
  onEndReached: () => void;
  onOpenTweet: (tweet: Tweet, from: CardRect | null) => void;
  onLikeTweet: (tweet: Tweet) => void;
  onRetry: () => void;
  onDrawMore: () => void;
  /** Date de la dernière visite de l'onglet, en millisecondes. */
  lastVisitAt: number | null;
  isFollowing: (tweet: Tweet) => boolean;
  onFollow: (tweet: Tweet) => void;
  /** Signature imposée par `handleShare` existant : un ID, pas un tweet. */
  onShare: (tweetId: string) => void;
  onInterest: (tweet: Tweet, interested: boolean) => void;
  ListHeaderComponent?: React.ReactElement | null;
}

function ExploreGrid({
  tweets, loading, loadingMore, refreshing, hasMore, error,
  onRefresh, onEndReached, onOpenTweet, onLikeTweet, onRetry, onDrawMore,
  lastVisitAt, isFollowing, onFollow, onShare, onInterest,
  ListHeaderComponent,
}: ExploreGridProps) {
  const [sheetTweet, setSheetTweet] = useState<Tweet | null>(null);
  const [sheetOrigin, setSheetOrigin] = useState<CardRect | null>(null);
  const [commentTarget, setCommentTarget] = useState<Tweet | null>(null);

  const handleLongPress = useCallback((tweet: Tweet, from: CardRect | null) => {
    setSheetOrigin(from);
    setSheetTweet(tweet);
  }, []);

  const closeSheet = useCallback(() => setSheetTweet(null), []);

  const handleNotInterested = useCallback(
    (tweet: Tweet) => onInterest(tweet, false),
    [onInterest],
  );

  /**
   * Répondre reste DANS la grille. Le seul chemin existant vers les réponses
   * (`handleOpenExploreThread`) navigue vers `TweetDetail`, ce qui est
   * exactement l'aller-retour qu'on supprime. `CommentSheet` n'est pas une
   * `<Modal>` : elle se superpose ici sans empiler de fenêtre native, et la
   * position de défilement du mur est conservée.
   */
  const handleReply = useCallback((tweet: Tweet) => setCommentTarget(tweet), []);

  const handleShareTweet = useCallback(
    (tweet: Tweet) => onShare(String(tweet.id)),
    [onShare],
  );

  if (loading && tweets.length === 0) {
    return (
      <ScrollView contentContainerStyle={styles.stateContent} showsVerticalScrollIndicator={false}>
        {ListHeaderComponent}
        <TweetSkeleton count={4} />
      </ScrollView>
    );
  }

  if (error && tweets.length === 0) {
    return (
      <ScrollView contentContainerStyle={styles.stateContent} showsVerticalScrollIndicator={false}>
        {ListHeaderComponent}
        <ErrorState detail={error} onRetry={onRetry} />
      </ScrollView>
    );
  }

  if (tweets.length === 0) {
    return (
      <ScrollView
        contentContainerStyle={styles.stateContent}
        showsVerticalScrollIndicator={false}
        refreshControl={<AppRefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {ListHeaderComponent}
        <EmptyState
          icon="compass-outline"
          title="Rien à explorer pour l’instant"
          message="Les tweets qui prennent de l’ampleur en ce moment apparaîtront ici."
          secondaryAction={{ label: 'Actualiser', onPress: onRetry }}
        />
      </ScrollView>
    );
  }

  return (
    <View style={styles.fill}>
      <ExploreWall
        tweets={tweets}
        refreshing={refreshing}
        loadingMore={loadingMore}
        hasMore={hasMore}
        lastVisitAt={lastVisitAt}
        onRefresh={onRefresh}
        onEndReached={onEndReached}
        onOpenTweet={onOpenTweet}
        onLikeTweet={onLikeTweet}
        onLongPressTweet={handleLongPress}
        onDrawMore={onDrawMore}
        ListHeaderComponent={ListHeaderComponent}
      />

      <ExploreActionSheet
        tweet={sheetTweet}
        origin={sheetOrigin}
        isFollowing={sheetTweet ? isFollowing(sheetTweet) : false}
        onClose={closeSheet}
        onLike={onLikeTweet}
        onFollow={onFollow}
        onReply={handleReply}
        onShare={handleShareTweet}
        onNotInterested={handleNotInterested}
      />

      {commentTarget && (
        <CommentSheet
          visible
          tweetId={String(commentTarget.id)}
          totalCount={commentTarget.stats?.replies ?? 0}
          tweetAuthorUsername={contentSourceOf(commentTarget)?.author?.username}
          onClose={() => setCommentTarget(null)}
        />
      )}
    </View>
  );
}

export default memo(ExploreGrid);

const styles = StyleSheet.create({
  fill: { flex: 1 },
  stateContent: { paddingHorizontal: 12, paddingTop: 4, paddingBottom: 96 },
});
```

- [ ] **Step 2: Corriger l'import de `CardRect` dans `ExploreImmersive.tsx`**

`ExploreImmersive` importe `CardRect` depuis `./ExploreGrid`. Le réexport ci-dessus le garde valide — **vérifier** que c'est bien un `import type` et non un import de valeur :

```bash
grep -n "CardRect" src/components/feed/ExploreImmersive.tsx | head -3
```

Si la ligne est `import ExploreGrid, { CardRect } from './ExploreGrid'` ou équivalent non-`type`, la remplacer par :

```ts
import type { CardRect } from './explore/ExploreCard';
```

- [ ] **Step 3: Vérifier les types**

```bash
npm run typecheck
```

Attendu : des erreurs **uniquement** sur `TweetsScreen.tsx`, qui ne passe pas encore les six nouvelles props. C'est ce que corrige la Task 8.

- [ ] **Step 4: Commit**

```bash
git add src/components/feed/ExploreGrid.tsx src/components/feed/ExploreImmersive.tsx
git commit -m "refactor(explore): ExploreGrid devient un assembleur, la mise en page descend dans explore/"
```

---

### Task 8 : Câblage dans `TweetsScreen.tsx`

**Files:**
- Modify: `src/screens/TweetsScreen.tsx` (autour des lignes 233–251, 940–975, 2041–2054)

**Interfaces:**
- Consumes: `ExploreGridProps` de la Task 7
- Produces: un onglet Explorer entièrement fonctionnel

- [ ] **Step 1: Ajouter l'état de dernière visite**

Dans le bloc « Onglet Explorer — état entièrement séparé » (vers la ligne 241), après `const exploreExhaustedRef = useRef(false);` :

```ts
  /**
   * Date de la dernière visite d'Explorer, pour marquer ce qui est arrivé
   * depuis. `exclude_seen` retire déjà le déjà-vu côté serveur, mais en
   * SILENCE : rien ne signale au lecteur que la page a changé, donc il n'a
   * aucune raison de revenir demain. Ce marqueur rend le mécanisme visible.
   */
  const [lastExploreVisitAt, setLastExploreVisitAt] = useState<number | null>(null);
  const exploreEnteredAtRef = useRef<number | null>(null);
```

- [ ] **Step 2: Lire et écrire la date de visite**

Juste après cette déclaration, ajouter :

```ts
  useEffect(() => {
    AsyncStorage.getItem('explore:lastVisitAt')
      .then((raw) => { if (raw) setLastExploreVisitAt(Number(raw)); })
      .catch(() => {});
  }, []);

  /**
   * On mémorise l'instant d'ENTRÉE, pas celui de sortie : sinon tout ce qui
   * paraît pendant la visite serait déjà compté comme « vu » au retour.
   */
  const rememberExploreVisit = useCallback(() => {
    const enteredAt = exploreEnteredAtRef.current;
    if (!enteredAt) return;
    exploreEnteredAtRef.current = null;
    AsyncStorage.setItem('explore:lastVisitAt', String(enteredAt)).catch(() => {});
  }, []);
```

Vérifier que `AsyncStorage` est importé en haut du fichier :

```bash
grep -n "async-storage" src/screens/TweetsScreen.tsx | head -2
```

S'il ne l'est pas, ajouter :

```ts
import AsyncStorage from '@react-native-async-storage/async-storage';
```

- [ ] **Step 3: Marquer l'entrée et la sortie de l'onglet**

Dans le gestionnaire de changement d'onglet (vers la ligne 948), dans la branche `if (newTab === 'explore')`, ajouter en première instruction du bloc :

```ts
      exploreEnteredAtRef.current = Date.now();
```

Et dans la branche `if (activeTab !== 'explore')` (vers la ligne 957), en première instruction :

```ts
      rememberExploreVisit();
```

- [ ] **Step 4: Ajouter le prédicat « je suis déjà cet auteur »**

Les noms exacts ont été relevés dans le fichier : le jeu d'ids s'appelle
`followingIds` (pas `followedIds`), et le handler de suivi
`handleExploreFollow` (`TweetsScreen.tsx:1838`). Il lit l'auteur via
`(tweet as any)?.originalTweet?.author || tweet.author` — on reproduit
exactement cette résolution pour que le prédicat et l'action soient d'accord
sur QUI est l'auteur.

Après `handleExploreInterest` (vers la ligne 1873) :

```ts
  /**
   * Même résolution d'auteur que `handleExploreFollow` : sur un retweet, c'est
   * l'auteur d'ORIGINE qu'on suit. Si le prédicat et l'action divergeaient, le
   * panneau proposerait de suivre quelqu'un qu'on suit déjà.
   */
  const isFollowingExploreAuthor = useCallback((tweet: Tweet) => {
    const author = (tweet as any)?.originalTweet?.author || tweet.author;
    const authorId = author?.id ? String(author.id) : '';
    return !!authorId && followingIds.has(authorId);
  }, [followingIds]);
```

Rien d'autre à créer : `handleExploreFollow` et `handleShare` existent déjà.

- [ ] **Step 5: Passer les nouvelles props**

Remplacer le bloc `<ExploreGrid …>` (lignes 2041–2054) par :

```tsx
        <ExploreGrid
          tweets={exploreTweets}
          loading={exploreLoading}
          loadingMore={exploreLoadingMore}
          refreshing={exploreRefreshing}
          hasMore={exploreHasMore}
          error={exploreError}
          onRefresh={onRefresh}
          onEndReached={onExploreEndReached}
          onOpenTweet={handleOpenExploreTweet}
          onLikeTweet={handleGridDoubleTapLike}
          onRetry={onExploreRetry}
          onDrawMore={onExploreDrawMore}
          lastVisitAt={lastExploreVisitAt}
          isFollowing={isFollowingExploreAuthor}
          onFollow={handleExploreFollow}
          onShare={handleShare}
          onInterest={handleExploreInterest}
        />
```

`handleShare` a bien la signature `(tweetId: string) => Promise<void>`
(`TweetsScreen.tsx:1163`) — c'est pourquoi `ExploreGrid` déclare
`onShare: (tweetId: string) => void` et convertit lui-même le tweet en id.
Il n'y a **pas** de prop `onReply` : `ExploreGrid` héberge `CommentSheet`
directement, pour ne pas retomber sur la navigation de
`handleOpenExploreThread`.

- [ ] **Step 6: Vérifier types et tests**

```bash
npm run typecheck
```

Attendu : aucune erreur.

```bash
npm test
```

Attendu : tous les tests verts, dont les 17 nouveaux.

- [ ] **Step 7: Commit**

```bash
git add src/screens/TweetsScreen.tsx
git commit -m "feat(explore): câblage du mur — dernière visite, actions sur place"
```

---

### Task 9 : Vérification sur appareil et réglage

**Files:** aucun a priori — correctifs selon constat

**Interfaces:**
- Consumes: tout ce qui précède
- Produces: la refonte confirmée sur un vrai téléphone

- [ ] **Step 1: Lancer l'app**

```bash
npx expo start
```

- [ ] **Step 2: Parcourir la liste de contrôle**

1. La bande d'entrée joue **dès l'ouverture** de l'onglet, sans toucher à rien.
2. Poser le doigt dessus **met la barre en pause** ; relâcher la **reprend où elle était** (elle ne repart pas de zéro).
3. Un glissé horizontal **sur la bande** change bien d'ONGLET (le geste du fil), et n'ouvre jamais la lecture au passage.
4. Le mur montre une rupture pleine largeur toutes les 7 cartes.
5. Les deux colonnes finissent **à peu près à la même hauteur** dans chaque bloc.
6. Le magenta apparaît environ 1 carte sur 5 parmi les Déclarations, jamais deux d'affilée.
7. Aucun compteur « 1 » ou « 2 » nulle part.
8. Aucun avatar sur les Déclarations et les Citations.
9. Un appui long ouvre le panneau **depuis la carte**, et la position de défilement est conservée après fermeture.
10. Le double-tap aime et joue le cœur, sans ouvrir la lecture.
11. Faire pivoter le téléphone : la grille se recalcule, les colonnes restent justes.
12. Régler la taille de police du système au maximum : rien ne déborde.

- [ ] **Step 3: Corriger ce qui casse, puis commit**

```bash
git add -A
git commit -m "fix(explore): réglages relevés au premier essai sur appareil"
```

- [ ] **Step 4: Rapporter honnêtement**

Écrire ce qui a été vérifié **et ce qui ne l'a pas été**. Ne jamais déclarer la refonte terminée sur la seule foi de `tsc` et des tests unitaires : c'est exactement l'erreur des 5ᵉ et 6ᵉ passes.

---

## Auto-revue du plan

**Couverture du spec :**

| Exigence du spec | Tâche |
|---|---|
| §3.1 cinq formats, règle de longueur | Task 1 |
| §3.2 Anton + Playfair, deux familles max | Task 3 |
| §3.3 cadence de couleur, tokens `blockContrast` | Task 1 (tokens + cadence), Task 3 (rendu) |
| §3.4 suppression avatar / compteurs sous 5 | Task 1 (`shouldShowCount`), Task 3 (`showByline`) |
| §4.1 bande d'entrée, 5 tweets, 4,5 s, pause au toucher | Task 4 |
| §4.2 blocs de 7, rupture, équilibrage local | Task 2 (calcul), Task 6 (rendu) |
| §4.3 double-tap, appui long, répondre, « moins de ça » | Task 3 (gestes), Task 5 (panneau), Task 8 (câblage) |
| §4.4 dernière visite, point cyan, plancher à 5 | Task 1 (`NEW_SINCE_FLOOR`), Task 6 (ligne + point), Task 8 (stockage) |
| §5 mouvement, `scheduleOnRN`, origine, pas de rebond | Contraintes globales, Tasks 3–5 |
| §6 découpage des fichiers, contrat de props | Tasks 3–7 |
| §7 états, pièges, tests, essai sur appareil | Task 7 (états), Tasks 0 et 9 (appareil) |

**Cohérence des types :** `CardMeta` est produit par `describeCards` (Task 1) et consommé tel quel par `buildWall` (Task 2), `ExploreCard` (Task 3), `ExploreHero` (Task 4) et `ExploreWall` (Task 6). `CardRect` est défini une seule fois dans `ExploreCard.tsx` (Task 3) et réexporté par `ExploreGrid.tsx` (Task 7) pour les deux consommateurs historiques.

**Contraintes du code existant relevées à l'écriture du plan**, et qui ont modifié le design :

| Constat | Conséquence sur le plan |
|---|---|
| `handleExploreFollow` (`TweetsScreen.tsx:1838`) sort si l'auteur est déjà suivi — **il ne sait pas se désabonner** | Le panneau n'affiche « Suivre l'auteur » que si on ne suit pas. Pas de « Ne plus suivre » factice. |
| `handleShare` (`TweetsScreen.tsx:1163`) prend un `tweetId: string`, pas un `Tweet` | `onShare: (tweetId: string) => void` ; la conversion se fait dans `ExploreGrid`. |
| Aucun `handleOpenComments` ; `handleOpenExploreThread` **navigue** vers `TweetDetail` | `ExploreGrid` héberge `CommentSheet` lui-même — sinon « répondre » rouvrait l'aller-retour que le spec supprime. |
| Le jeu d'ids s'appelle `followingIds` | Utilisé tel quel dans `isFollowingExploreAuthor`. |

**Aucun placeholder ne subsiste :** toutes les fonctions, props et constantes citées sont soit définies dans une tâche, soit relevées à une ligne précise du code existant.
