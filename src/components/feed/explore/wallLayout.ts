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
