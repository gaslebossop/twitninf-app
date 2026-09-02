/**
 * Le budget de couleur du fond de profil.
 *
 * ── Pourquoi ce fichier existe ───────────────────────────────────────────
 * Le 2026-08-31, une capture a montré un profil entièrement rose : fond,
 * boutons, anneau d'avatar, pastilles, nom, carte du post. Plus un seul
 * élément neutre à l'écran, donc plus aucune hiérarchie.
 *
 * Aucune couche n'était fautive prise isolément. C'est leur EMPILEMENT qui
 * l'était, et il n'était écrit nulle part :
 *
 *   assise 0,30 · foyer 0,65 · foyer 0,45 · rim 0,36 · spéculaire 0,16
 *     →  1 - Π(1 - αᵢ)  =  0,93
 *
 * **0,93 d'accent plein sur la page.** Les valeurs vivaient dispersées dans
 * `ThemeMaterial.tsx` — une dans un tableau de foyers, une dans un JSX, deux
 * dans un `<Stop>` — multipliées par des facteurs de thème eux-mêmes ailleurs.
 * Personne ne pouvait les additionner sans les chercher une par une, et
 * personne ne l'a fait pendant quatre sessions de réglage.
 *
 * Elles sont donc réunies ici, et un test les additionne (`tests/
 * profile-theme-budget.test.js`). La géométrie des foyers reste dans
 * `ThemeMaterial` — c'est elle qui fait la différence entre les trois thèmes,
 * et elle n'a jamais posé de problème.
 *
 * ── La règle ─────────────────────────────────────────────────────────────
 *
 *   **L'accent n'est pas un pigment, c'est une lumière.**
 *   Il n'est pas censé teindre la surface, il est censé l'éclairer.
 *
 * Ce n'est pas une nuance de goût, c'est mesurable. Un mur peint en rose et
 * un mur blanc éclairé en rose n'ont pas la même opacité de couleur : le
 * premier est à 1, le second autour de 0,1. Et c'est le premier qui fait
 * « profil MySpace », toujours.
 */

/**
 * Opacité totale de l'accent AU FOYER, intensité « Intense » comprise.
 *
 * Volontairement haut. Une source de lumière est vive — c'est son emprise
 * qui doit être petite, pas sa force. Brider la crête a déjà été essayé
 * (0,30) et donne un fond délavé, refusé à l'écran.
 *
 * Le garde-fou utile n'est pas ici mais dans `REACH`.
 */
export const BUDGET = 0.82;

/**
 * ── LA VRAIE CONTRAINTE : L'EMPRISE, PAS L'INTENSITÉ ─────────────────────
 *
 * Première correction du 2026-08-31 : les opacités ont été divisées par cinq
 * en gardant la même géométrie. Résultat, testé à l'écran par l'utilisateur :
 * **invisible en sombre, « 0 sur 20 » en clair.** Un film rose pâle étalé sur
 * toute la page au lieu d'un film rose vif — c'est-à-dire le même défaut, en
 * plus délavé.
 *
 * La leçon, et c'est elle qui compte :
 *
 *   **Ce qui fait « page coloriée », c'est l'EMPRISE, pas l'intensité.**
 *
 * Une lumière réelle est VIVE et PETITE, avec une chute rapide : fort au
 * foyer, plus rien à trente centimètres. Une peinture est uniforme et couvre
 * tout, quelle que soit sa force. Diluer une peinture ne la transforme pas en
 * lumière — ça donne une peinture délavée.
 *
 * Donc : le foyer peut monter haut (`BUDGET` 0,82), à condition qu'il soit
 * SERRÉ et qu'il soit ÉTEINT au milieu de la page. C'est `REACH` qui le dit,
 * et c'est la contrainte réellement structurante.
 */

/**
 * Opacité maximale tolérée à mi-hauteur du champ.
 *
 * En dessous de la couture le profil porte du contenu — pseudo, bio,
 * compteurs, onglets, cartes. Si la teinte est encore là à cet endroit, tout
 * ce contenu la prend et il ne reste plus un seul élément neutre à l'écran :
 * c'est exactement ce que montrait la capture d'origine.
 *
 * 0,04 est le seuil sous lequel un gris reste lu comme un gris.
 */
export const REACH = 0.04;

/**
 * Facteur d'intensité le plus fort proposé à l'utilisateur.
 *
 * Doit rester aligné sur `INTENSITY_FACTORS.vivid` de
 * `services/profileCustomizationService`. Le budget se vérifie à CE
 * facteur-là, pas à 1 : « Intense » est un réglage offert, donc c'est le pire
 * cas réel, pas un cas théorique.
 */
export const MAX_INTENSITY = 1.32;

/**
 * Composition alpha de N couches empilées : `1 - Π(1 - αᵢ)`.
 *
 * Existe pour rendre le budget VÉRIFIABLE au lieu de le laisser à
 * l'appréciation. Les opacités ne s'additionnent pas — c'est exactement ce
 * qui a permis à cinq couches « raisonnables » d'atteindre 0,93 sans que
 * personne ne s'en aperçoive.
 */
export function composite(alphas: readonly number[]): number {
  return 1 - alphas.reduce((acc, a) => acc * (1 - Math.min(Math.max(a, 0), 1)), 1);
}

/**
 * Ce qui sépare les deux thèmes n'est PAS une quantité de couleur.
 *
 * Les deux tiennent le même budget. Ce qui change, c'est la façon dont la
 * lumière se lit : en sombre elle peut virer franchement au blanc (elle a du
 * noir à mordre), en clair elle doit rester dans sa teinte — un blanc sur du
 * blanc ne brille pas, il délave.
 *
 * Les multiplicateurs valaient 1,25 / 1,5 / 1,8 en sombre, sur l'idée qu'un
 * fond noir « mange » la couleur. Il n'en mange pas : il la fait ressortir
 * davantage. Ils empilaient de la couleur sur de la couleur.
 */
export const TONE = {
  dark: {
    /** Part de couleur gardée au cœur d'un foyer. Plus bas = plus lumineux. */
    core: 0.5,
    gain: 1,
    assise: 1,
    /** Le reflet peut virer au blanc : il a du noir à mordre. */
    sheenKeep: 0.3,
    sheen: 1.15,
    rimKeep: 0.45,
    rim: 1,
  },
  light: {
    core: 0.7,
    gain: 1,
    assise: 1,
    sheenKeep: 0.55,
    sheen: 1,
    rimKeep: 0.62,
    rim: 1,
  },
} as const;

export type ToneKey = keyof typeof TONE;

/**
 * Opacité de crête des couches qui ne dépendent pas du thème de profil.
 *
 * `assise` valait 0,20 (× 1,5 en sombre = 0,30) juste sous un commentaire
 * qui disait qu'une assise trop haute réduirait le thème à « un filtre
 * coloré posé sur la page ». Le commentaire avait raison, la valeur le
 * contredisait — et la baisser n'a pas suffi non plus. Voir ci-dessous.
 */
/**
 * ── LA BANDE : LA FORME QUI MANQUAIT ─────────────────────────────────────
 *
 * Deux constats à l'écran, le même jour, qui n'en font qu'un :
 *
 *  1. Sur un profil AVEC photo de bannière, la couleur était quasi
 *     invisible. La crête ne manquait pourtant pas de force (`peakOf` rend
 *     0,72) : elle était peinte au-dessus de la couture, donc DERRIÈRE la
 *     photo, qui masque tout ce qui s'y trouve. Il ne restait qu'une traînée
 *     sous la bannière.
 *  2. Sans photo, « c'est juste un rond, c'est pas Discord ».
 *
 * Les deux disent la même chose : des foyers RONDS sont le mauvais objet.
 * Discord ne peint pas des taches, il peint **un dégradé vertical qui part
 * du bas de la bannière et descend** — pleine largeur, donc sans forme
 * reconnaissable, donc sans « rond ».
 *
 * C'est ce que fait la bande. Elle porte désormais l'essentiel de la
 * couleur ; les foyers restent, mais en second plan, pour donner la matière
 * (avec le bruit du shader) plutôt que la masse — leurs gains sont donc
 * abaissés d'autant.
 *
 * ── Pourquoi ce n'est PAS l'assise supprimée le 2026-08-31 ───────────────
 *
 * L'assise couvrait la page UNIFORMÉMENT, du haut jusque sous les onglets :
 * quelle que soit sa valeur, elle donnait une page teintée. La bande, elle,
 * est bornée — elle démarre à la couture et elle est ÉTEINTE avant la
 * mi-page (`BAND_HEIGHT` 0,30 contre une mi-page à 0,50, et une chute
 * convexe par-dessus). Le bas du profil revient au fond d'app neutre, et
 * c'est ce contraste qui fait exister la lumière. `reachOf` la mesure.
 */
export const BAND_HEIGHT = 0.3;

/**
 * Exposant de la chute de la bande. `1` serait linéaire, donc un aplat
 * dégradé ; au-dessus de 1 la chute est raide au début puis longue, ce qui
 * se lit comme une source et non comme une peinture.
 */
export const BAND_CURVE = 1.8;

export const LAYER = {
  /**
   * L'assise est SUPPRIMÉE — c'est elle, et elle seule, le « fond coloré ».
   *
   * C'était la seule couche à couvrir la page uniformément, du haut jusque
   * sous les onglets. Une couche uniforme ne peut structurellement pas se
   * lire comme une lumière : une lumière vient de quelque part. Tant qu'elle
   * existe, quelle que soit sa valeur, le profil est une page teintée — à
   * 0,30 c'est criard, à 0,03 c'est délavé, et les deux ont été refusés à
   * l'écran.
   *
   * Ce qu'on perd : le thème ne descend plus jusqu'aux onglets. C'est voulu.
   * Le bas d'un profil doit être du fond d'app neutre — c'est le contraste
   * avec le haut éclairé qui fait exister la lumière.
   */
  assise: 0,
  /**
   * La bande verticale, sous la couture. C'est elle qui porte la couleur
   * maintenant — d'où une valeur bien plus haute que tout le reste.
   */
  band: 0.42,
  /** Le repère fixe. Serré, c'est un repère, pas un éclairage. */
  rim: 0.1,
  /** La nappe spéculaire qui traverse. */
  sheen: 0.08,
} as const;

/**
 * Opacité de crête de chaque foyer, par thème de profil.
 *
 * Vivait dans `fieldOf`, mêlée aux coordonnées. Les valeurs d'origine
 * (0,52 · 0,36 pour « Dégradé », jusqu'à 0,62 pour « Halo ») étaient des
 * opacités de PEINTURE : un radial à 0,62 d'accent couvrant la moitié de la
 * page, ce n'est pas une source de lumière, c'est un aplat.
 *
 * L'ordre doit suivre celui de `fieldOf` : le foyer d'index i lit `[i]`.
 */
export const SOURCE_GAINS = {
  /** Un foyer serré sur la couture, un second plus large et plus doux. */
  glow: [0.3, 0.09],
  /**
   * Trois foyers qui se croisent, donc chacun plus faible : c'est le
   * croisement qui fait le nuage, et trois couches composent plus vite que
   * deux.
   */
  mesh: [0.15, 0.15, 0.09],
  /** Un foyer large et haut, un second plus bas en couleur secondaire. */
  gradient: [0.25, 0.09],
} as const;

/**
 * Rayons des foyers, en unités du `viewBox` 0–100 — `[rx, ry]` par foyer.
 *
 * Ils vivaient dans `fieldOf` avec les coordonnées, et c'est là que se
 * jouait le vrai défaut : `rx: 72, ry: 40` pour « Dégradé », soit un foyer
 * couvrant les trois quarts de la largeur et 40 % de la hauteur. À cette
 * taille, un radial n'est plus une source de lumière — c'est un aplat avec
 * les bords adoucis, et aucune baisse d'opacité ne le rattrape.
 *
 * Resserrés d'environ 45 %. C'est ce changement-là, pas celui des opacités,
 * qui sépare une lumière d'une peinture.
 */
export const SOURCE_RADII = {
  glow: [[38, 15], [60, 24]],
  mesh: [[34, 17], [33, 16], [30, 14]],
  gradient: [[42, 18], [52, 21]],
} as const;

/**
 * Profil de chute d'un foyer : `[offset, part de la crête]`.
 *
 * La couleur pleine doit avoir chuté à un cinquième avant 40 % du rayon, et
 * être éteinte à 72 %. L'ancien profil tenait 0,34 de la crête jusqu'à 46 %
 * et ne s'éteignait qu'à 84 % — d'où une teinte encore bien présente à
 * mi-page, et donc du contenu teinté.
 */
export const FALLOFF = [
  [0, 1],
  [0.1, 0.9],
  [0.4, 0.2],
  [0.72, 0],
] as const;

export type ThemeMaterialKind = keyof typeof SOURCE_GAINS;

/**
 * Opacité totale de l'accent au point le plus chaud, pour un thème donné.
 *
 * Toutes les couches sont supposées se recouvrir à cet endroit — c'est le
 * pire cas, et c'est justement celui que personne ne calculait. Les foyers
 * sont pris à leur crête (`offset 0`), les autres couches à leur valeur haute.
 */
export function peakOf(
  kind: ThemeMaterialKind,
  theme: ToneKey,
  factor: number = MAX_INTENSITY,
): number {
  const tone = TONE[theme];
  const clamp = (a: number) => Math.min(Math.max(a, 0), BUDGET);

  return composite([
    ...SOURCE_GAINS[kind].map((gain) => clamp(gain * tone.gain * factor)),
    clamp(LAYER.assise * tone.assise * factor),
    clamp(LAYER.band * tone.gain * factor),
    clamp(LAYER.rim * tone.rim * factor),
    clamp(LAYER.sheen * tone.sheen * factor),
  ]);
}

/**
 * Part de la crête d'un foyer encore présente à `t` fois son rayon.
 *
 * Interpolation linéaire du profil `FALLOFF`, c'est-à-dire exactement ce que
 * fait SVG entre deux `<Stop>`.
 */
export function falloffAt(t: number): number {
  for (let i = 1; i < FALLOFF.length; i += 1) {
    const [x0, y0] = FALLOFF[i - 1];
    const [x1, y1] = FALLOFF[i];
    if (t <= x1) {
      const span = x1 - x0;
      return span <= 0 ? y1 : y0 + ((t - x0) / span) * (y1 - y0);
    }
  }
  return 0;
}

/**
 * Opacité de la teinte à mi-hauteur du champ — la mesure qui compte.
 *
 * Un foyer est ancré sur la couture (~22 % de la hauteur) et son rayon
 * vertical `ry` est exprimé sur 100. La distance de la mi-page au foyer,
 * ramenée en fraction de rayon, donne où on se situe dans la chute.
 *
 * C'est CETTE valeur qui décide si le profil est éclairé ou colorié, et
 * c'est celle que personne ne regardait.
 */
export function reachOf(
  kind: ThemeMaterialKind,
  theme: ToneKey,
  factor: number = MAX_INTENSITY,
  seam = 22,
): number {
  const tone = TONE[theme];
  const clamp = (a: number) => Math.min(Math.max(a, 0), BUDGET);

  const contributions = SOURCE_GAINS[kind].map((gain, i) => {
    const ry = SOURCE_RADII[kind][i][1];
    // Les foyers sont posés entre la couture et un peu en dessous ; on prend
    // le cas le plus défavorable, celui posé le plus bas.
    const distance = Math.abs(50 - (seam + 12));
    return clamp(gain * tone.gain * factor) * falloffAt(distance / ry);
  });

  return composite([
    ...contributions,
    // L'assise, si elle existait, serait encore pleine à mi-page : c'est
    // précisément ce qui la rend incompatible avec une lecture « lumière ».
    clamp(LAYER.assise * tone.assise * factor) * 0.6,
    // La bande, à mi-page. `t` dépasse 1 dès que la mi-page est sous elle,
    // et la puissance l'éteint alors complètement — c'est la borne qui la
    // distingue de l'assise supprimée.
    clamp(LAYER.band * tone.gain * factor)
      * Math.pow(Math.max(0, 1 - (50 - seam) / (BAND_HEIGHT * 100)), BAND_CURVE),
    clamp(LAYER.sheen * tone.sheen * factor) * falloffAt(1),
  ]);
}
