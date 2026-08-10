/**
 * Images jointes à un tweet.
 *
 * ── Jamais derrière le drapeau ──
 * `tweet.images` conditionne la PUBLICATION, pas la lecture. Pendant un
 * déploiement progressif, la plupart des lecteurs d'un tweet illustré ne sont
 * pas dans le palier de son auteur : conditionner l'affichage leur montrerait
 * un tweet vide, et le texte « regardez cette photo » sans la photo.
 *
 * ── Disposition ──
 * Une image occupe toute la largeur, plusieurs se rangent en grille à deux
 * colonnes. Le ratio est FIXE et l'image recadrée (`cover`) : sans hauteur
 * connue avant chargement, chaque arrivée d'image décalerait le contenu déjà
 * lu — c'est le défaut qui fait perdre sa place dans un fil qu'on parcourt.
 */

import React from 'react';
import { Image, StyleSheet, TouchableOpacity, View } from 'react-native';

import { colors } from '../../theme';

interface TweetImagesProps {
  urls: string[];
  /** Ouvre le tweet : la grille du fil n'est pas une visionneuse. */
  onPress?: () => void;
}

/** Plafond du modèle côté API — au-delà, la grille ne tiendrait plus. */
const MAX_VISIBLE = 4;

function TweetImages({ urls, onPress }: TweetImagesProps) {
  const images = (urls || []).filter((url) => typeof url === 'string' && url.length > 0).slice(0, MAX_VISIBLE);
  if (images.length === 0) return null;

  const single = images.length === 1;
  // Sur trois images, la dernière prend toute la largeur : à deux colonnes,
  // elle resterait sinon seule avec un trou à côté d'elle.
  const lastSpansFullWidth = images.length === 3;

  return (
    <View style={styles.grid}>
      {images.map((url, index) => {
        const full = single || (lastSpansFullWidth && index === 2);
        return (
          <TouchableOpacity
            key={`${url}-${index}`}
            style={[styles.cell, full ? styles.cellFull : styles.cellHalf]}
            activeOpacity={onPress ? 0.9 : 1}
            onPress={onPress}
            disabled={!onPress}
            accessibilityRole="image"
            accessibilityLabel={
              images.length === 1 ? 'Image du tweet' : `Image ${index + 1} sur ${images.length}`
            }
          >
            <Image source={{ uri: url }} style={styles.image} resizeMode="cover" />
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    marginTop: 10,
  },
  cell: {
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: colors.surface,
  },
  // `flexBasis` en pourcentage plutôt qu'une largeur calculée : la ligne du
  // fil n'a pas la même largeur utile selon l'écran et l'indentation des
  // réponses, et mesurer le conteneur ferait rendre deux fois.
  cellFull: { flexBasis: '100%', aspectRatio: 16 / 10 },
  cellHalf: { flexBasis: '48.8%', flexGrow: 1, aspectRatio: 1 },
  image: { width: '100%', height: '100%' },
});

export default React.memo(TweetImages);
