/**
 * L'échelle de l'événement — grille 8pt, échelle typographique, cibles tactiles.
 *
 * ── Pourquoi une échelle explicite ────────────────────────────────────────
 * Les premières versions du hub étaient chiffrées à l'œil : des marges de 9,
 * 11 et 13, des textes en 10,5 / 11,5 / 12,5. Chaque valeur se défendait
 * isolément, aucune ne s'accordait avec les autres, et le résultat n'avait
 * aucun rythme vertical — c'est précisément ce qu'on ressent comme « pas
 * professionnel » sans pouvoir le nommer.
 *
 * Tout ce fichier suit des règles publiées, pas des préférences :
 *
 *  - **Grille 8pt** : toute marge, tout espacement et tout rembourrage est un
 *    multiple de 4 (demi-pas) ou de 8. Se divise proprement sur les densités
 *    d'écran courantes et donne un rythme régulier.
 *  - **Interlignes multiples de 4**, ratio 1,4 à 1,6 — c'est ce qui aligne le
 *    texte sur la même grille que les espacements.
 *  - **Corps jamais sous 14 pt.** Les 10,5 et 11,5 de la version précédente
 *    étaient sous le plancher de lisibilité mobile.
 *  - **Cibles tactiles à 44 pt minimum** (règle Apple ; Material demande 48).
 *    Les onglets à 38 pt et le bouton à 40 pt de la version précédente étaient
 *    tous deux sous la norme.
 *
 * ── Pourquoi séparé de `utils/responsive` ─────────────────────────────────
 * L'échelle de l'app est FLUIDE : elle multiplie ses valeurs par un facteur
 * tiré de la largeur d'écran, ce qui produit des nombres à virgule et casse
 * par construction toute grille. C'est un choix défendable pour des écrans
 * denses. Une page de fête, elle, gagne à respirer de façon strictement
 * régulière — d'où une grille rigide, assumée, et locale à l'événement.
 */

/**
 * Espacements. Un seul jeu, utilisé partout : la règle de conception des
 * cartes veut que le rembourrage intérieur soit IDENTIQUE d'une carte à
 * l'autre, sans quoi la grille se voit tordue même quand elle est correcte.
 */
export const space = {
  /** Demi-pas. Entre une icône et son libellé, jamais plus. */
  xxs: 4,
  /** Entre deux éléments d'une même ligne. */
  xs: 8,
  /** Entre deux blocs liés à l'intérieur d'une carte. */
  sm: 12,
  /** Rembourrage standard d'une carte, et marge d'écran. */
  md: 16,
  /** Entre deux cartes, et sous un titre de section. */
  lg: 24,
  /** Entre deux sections. */
  xl: 32,
  /** Respiration de tête. */
  xxl: 48,
} as const;

/**
 * Échelle typographique.
 *
 * Les interlignes sont tous des multiples de 4 : c'est ce qui met le texte sur
 * la même grille que les espacements, et donne le rythme vertical qui manquait.
 */
export const type = {
  /** Titre de l'événement. Police d'affiche uniquement. */
  display: { fontSize: 30, lineHeight: 36 },
  /** Grand chiffre : compteur commun, total de récompenses. */
  numeric: { fontSize: 28, lineHeight: 32 },
  /** Titre de section. */
  h1: { fontSize: 20, lineHeight: 28 },
  /** Titre de carte. */
  h2: { fontSize: 16, lineHeight: 24 },
  /** Corps courant. Plancher de lisibilité : on ne descend pas plus bas. */
  body: { fontSize: 15, lineHeight: 24 },
  /** Corps secondaire — descriptions longues. */
  bodySm: { fontSize: 14, lineHeight: 20 },
  /** Libellé d'interface : bouton, onglet, pastille. */
  label: { fontSize: 14, lineHeight: 20 },
  /**
   * Métadonnée non essentielle UNIQUEMENT (horodatage, unité, sur-titre).
   * Jamais pour une information dont la compréhension dépend.
   */
  caption: { fontSize: 12, lineHeight: 16 },
} as const;

/**
 * Cibles tactiles.
 *
 * `min` est le plancher Apple (44 pt) et le minimum absolu de tout ce qui se
 * touche. `comfortable` est la recommandation Material (48 dp), utilisée pour
 * les actions principales — un bouton qu'on rate est un bouton qu'on presse
 * deux fois.
 *
 * L'icône n'a pas besoin de faire cette taille : c'est le REMBOURRAGE autour
 * d'elle qui construit la cible.
 */
export const touch = {
  min: 44,
  comfortable: 48,
} as const;

/** Rayons. Grands et constants — c'est la signature de cette DA. */
export const round = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  /** Pilule pleine. */
  pill: 999,
} as const;

/**
 * Tailles d'icône, alignées sur la grille.
 *
 * Trois tailles suffisent. Un jeu d'icônes à cinq tailles différentes se lit
 * comme une accumulation d'exceptions plutôt que comme un système.
 */
export const icon = {
  sm: 16,
  md: 24,
  lg: 32,
} as const;

export default { space, type, touch, round, icon };
