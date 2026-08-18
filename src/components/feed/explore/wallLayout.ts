import type { CardMeta } from './cardFormat';

/**
 * Répartition du mur en deux colonnes.
 *
 * ── Pourquoi il n'y a plus de blocs ────────────────────────────────────────
 * La version précédente découpait la liste en blocs de 8 « resynchronisés »,
 * pour empêcher les deux colonnes de dériver. Vu sur appareil, c'est ce
 * découpage qui abîmait le mur : à la fin de chaque bloc, la colonne la plus
 * courte devait attendre l'autre, ce qui laissait une bande blanche en travers
 * de la grille et une couture visible tous les huit tweets.
 *
 * Le remède n'était pas nécessaire : un glouton « je pose la carte suivante
 * dans la colonne la PLUS COURTE » est déjà autocorrecteur. Une colonne qui
 * prend de l'avance ne reçoit plus rien jusqu'à ce que l'autre l'ait rattrapée,
 * donc l'écart reste borné par la hauteur d'UNE carte, indéfiniment — il
 * n'existe pas de dérive à corriger. C'est l'alternance gauche/droite naïve
 * qui dérive, pas le glouton.
 *
 * Résultat : une trame continue du haut au bas de la page, sans bande blanche
 * et sans couture.
 */

/**
 * Deux colonnes équilibrées par hauteur cumulée.
 *
 * L'ordre d'arrivée est PRÉSERVÉ dans chaque colonne : pas de tri préalable
 * (ni LPT ni best-fit), parce que le flux arrive déjà classé par `trending` et
 * que ce classement est précisément ce que le mur doit rendre visible. Le prix
 * est un écart final possible d'au plus une carte — invisible en pratique,
 * contre une bande blanche bien visible avec les blocs.
 */
export function buildColumns(metas: CardMeta[]): [CardMeta[], CardMeta[]] {
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
