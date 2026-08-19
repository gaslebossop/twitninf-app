/**
 * 🧪 Images jointes à un tweet, dans le fil « 2B — Gouttière ».
 *
 * Clone de `components/feed/TweetImages.tsx`. Deux différences seulement :
 * la visionneuse ouverte est celle de 2B (`ImageViewerPaper`, une vraie
 * galerie paginée), et la grille suit les rayons et l'échelle du test.
 *
 * ── Jamais derrière le drapeau ──────────────────────────────────────────
 * `tweet.images` conditionne la PUBLICATION, pas la lecture. Pendant un
 * déploiement progressif, la plupart des lecteurs d'un tweet illustré ne sont
 * pas dans le palier de son auteur : conditionner l'affichage leur montrerait
 * un tweet vide, et le texte « regardez cette photo » sans la photo.
 *
 * ── Disposition ─────────────────────────────────────────────────────────
 * Une image occupe toute la largeur, plusieurs se rangent en grille à deux
 * colonnes. Le ratio est FIXE et l'image recadrée (`cover`) : sans hauteur
 * connue avant chargement, chaque arrivée d'image décalerait le contenu déjà
 * lu — c'est le défaut qui fait perdre sa place dans un fil qu'on parcourt.
 *
 * ── Le fondu ne se rejoue jamais ────────────────────────────────────────
 * Une image apparaît en fondu la PREMIÈRE FOIS qu'on la voit, et seulement
 * celle-là. Les lignes du fil sont recyclées : sans mémoire des images déjà
 * vues, remonter le fil rejouerait le fondu à chaque réapparition — c'est
 * exactement l'effet clinquant que la charte du dépôt rejette.
 */

import React, { useCallback, useRef, useState } from 'react';
import { Image, Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { paper, ps } from '../../../theme/paper2b';
import ImageViewerPaper from './ImageViewerPaper';

interface TweetImagesPaperProps {
  urls: string[];
  /** Appelé avant l'ouverture — sert à neutraliser l'appui de la ligne. */
  onBeforeOpen?: () => void;
}

/** Plafond du modèle côté API — au-delà, la grille ne tiendrait plus. */
const MAX_VISIBLE = 4;

/**
 * Images déjà affichées dans cette session. Volontairement au niveau du
 * module : le recyclage détruit l'état des composants, c'est précisément ce
 * qu'il ne faut pas oublier ici.
 */
const alreadySeen = new Set<string>();

function Cell({
  url,
  full,
  label,
  onPress,
}: {
  url: string;
  full: boolean;
  label: string;
  onPress: () => void;
}) {
  const pressed = useSharedValue(0);
  // Lu une seule fois : si l'image est déjà connue, elle est opaque d'emblée
  // et aucun fondu n'est joué.
  const firstTime = useRef(!alreadySeen.has(url));
  const opacity = useSharedValue(firstTime.current ? 0 : 1);

  const handleLoad = useCallback(() => {
    if (!firstTime.current) return;
    alreadySeen.add(url);
    firstTime.current = false;
    opacity.value = withTiming(1, { duration: 220 });
  }, [opacity, url]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scale: 1 - pressed.value * 0.02 }] as const,
  }));

  return (
    <Pressable
      style={[S.cell, full ? S.cellFull : S.cellHalf]}
      onPress={onPress}
      onPressIn={() => {
        pressed.value = withSpring(1, { damping: 20, stiffness: 300 });
      }}
      onPressOut={() => {
        pressed.value = withSpring(0, { damping: 20, stiffness: 300 });
      }}
      accessibilityRole="imagebutton"
      accessibilityLabel={label}
    >
      <Animated.View style={[S.fill, animatedStyle]}>
        <Image
          source={{ uri: url }}
          style={S.fill}
          resizeMode="cover"
          onLoad={handleLoad}
          accessibilityIgnoresInvertColors
        />
      </Animated.View>
    </Pressable>
  );
}

function TweetImagesPaper({ urls, onBeforeOpen }: TweetImagesPaperProps) {
  const images = (urls || [])
    .filter((url) => typeof url === 'string' && url.length > 0)
    .slice(0, MAX_VISIBLE);

  const [viewerIndex, setViewerIndex] = useState<number | null>(null);

  const open = useCallback(
    (index: number) => {
      onBeforeOpen?.();
      setViewerIndex(index);
    },
    [onBeforeOpen],
  );

  if (images.length === 0) return null;

  const single = images.length === 1;
  // Sur trois images, la dernière prend toute la largeur : à deux colonnes,
  // elle resterait sinon seule avec un trou à côté d'elle.
  const lastSpansFullWidth = images.length === 3;

  return (
    <>
      <View style={S.grid}>
        {images.map((url, index) => (
          <Cell
            key={`${url}-${index}`}
            url={url}
            full={single || (lastSpansFullWidth && index === 2)}
            label={single ? 'Image du tweet' : `Image ${index + 1} sur ${images.length}`}
            onPress={() => open(index)}
          />
        ))}
      </View>

      <ImageViewerPaper
        urls={images}
        initialIndex={viewerIndex ?? 0}
        visible={viewerIndex !== null}
        onClose={() => setViewerIndex(null)}
      />
    </>
  );
}

const S = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: ps(4),
    marginTop: ps(11),
  },
  cell: {
    borderRadius: ps(14),
    borderCurve: 'continuous',
    overflow: 'hidden',
    backgroundColor: paper.bgBand,
  },
  // `flexBasis` en pourcentage plutôt qu'une largeur calculée : la ligne du
  // fil n'a pas la même largeur utile selon l'écran et le retrait des
  // réponses, et mesurer le conteneur ferait rendre deux fois.
  cellFull: { flexBasis: '100%', aspectRatio: 16 / 10 },
  cellHalf: { flexBasis: '48.8%', flexGrow: 1, aspectRatio: 1 },
  fill: { width: '100%', height: '100%' },
});

export default React.memo(TweetImagesPaper);
