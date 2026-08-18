import type { CardMeta } from './cardFormat';

/**
 * Découpage du mur en deux colonnes, resynchronisées par blocs.
 *
 * ── Pourquoi des blocs plutôt qu'un masonry continu ────────────────────────
 * Un seul équilibrage global sur toute la liste laisse les deux colonnes
 * DÉRIVER : l'écart s'accumule sur des centaines de cartes et le bas de page
 * finit en dents de scie. Par blocs, elles se resynchronisent régulièrement.
 *
 * ── Pourquoi il n'y a plus de carte « rupture » ────────────────────────────
 * La version précédente promouvait une carte en pleine largeur à l'ouverture
 * de chaque bloc, pour donner un « pouls » au mur. Sur appareil, l'effet
 * obtenu était l'inverse : la trame à deux colonnes se cassait tous les sept
 * tweets et le mur paraissait décousu. La grille est désormais uniforme d'un
 * bout à l'autre — le rythme vient du contenu des cartes, pas d'une forme
 * spéciale insérée à intervalle fixe.
 */

/**
 * Taille d'un bloc de resynchronisation. Nombre PAIR : les deux colonnes
 * reçoivent alors le même nombre de cartes quand leurs hauteurs se suivent,
 * ce qui évite un décalage d'une carte à chaque bloc.
 */
export const BLOCK_SIZE = 8;

export interface WallBlock {
  /** Le bloc réparti en deux colonnes équilibrées. */
  columns: [CardMeta[], CardMeta[]];
}

/**
 * Équilibrage glouton par hauteur cumulée, local à un bloc.
 *
 * Glouton sans tri préalable (pas LPT ni best-fit) : sur un bloc très
 * hétérogène l'écart final peut rester visible. Accepté — un tri changerait
 * l'ordre d'arrivée du classement `trending`, qui est justement ce que le mur
 * doit préserver.
 */
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
    blocks.push({ columns: splitColumns(metas.slice(i, i + BLOCK_SIZE)) });
  }
  return blocks;
}
