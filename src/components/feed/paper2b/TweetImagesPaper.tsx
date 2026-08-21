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
import { Pressable, StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
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
        {/* `expo-image` et non le `Image` du cœur RN — trois raisons, toutes
            propres à une image montée dans une liste recyclée :

            1. `cachePolicy="memory-disk"` : la même photo réapparaît sans
               retéléchargement NI redécodage quand on remonte le fil ;
            2. `recyclingKey` : la vue est vidée avant de charger une nouvelle
               source, donc une cellule réutilisée ne montre jamais, même une
               image, la photo de la ligne précédente ;
            3. `allowDownscaling` (actif par défaut) redimensionne au format
               réel de la cellule au lieu de garder un bitmap pleine résolution
               en mémoire.

            Le rendu ne bouge pas : `contentFit="cover"` est exactement
            l'équivalent de `resizeMode="cover"`, et `transition={0}` laisse le
            fondu maison (`alreadySeen`) seul maître — celui d'expo-image se
            rejouerait à chaque recyclage, ce que ce composant existe pour
            éviter. */}
        <Image
          source={{ uri: url }}
          style={S.fill}
          contentFit="cover"
          cachePolicy="memory-disk"
          recyclingKey={url}
          transition={0}
          // `onLoadEnd` et pas `onLoad` : il part aussi sur un échec de
          // chargement. Avec `onLoad` seul, une image qui ne charge pas
          // laissait sa cellule bloquée à l'opacité 0.
          onLoadEnd={handleLoad}
          accessibilityIgnoresInvertColors
        />
      </Animated.View>
    </Pressable>
  );
}

function TweetImagesPaper({ urls, onBeforeOpen }: TweetImagesPaperProps) {
  // Filtre + coupe mémoïsés : refaits à chaque rendu, ils fabriquaient un
  // tableau neuf, donc une propriété neuve pour la visionneuse.
  const images = React.useMemo(
    () =>
      (urls || [])
        .filter((url) => typeof url === 'string' && url.length > 0)
        .slice(0, MAX_VISIBLE),
    [urls],
  );

  const [viewerIndex, setViewerIndex] = useState<number | null>(null);

  const open = useCallback(
    (index: number) => {
      onBeforeOpen?.();
      setViewerIndex(index);
    },
    [onBeforeOpen],
  );

  const closeViewer = useCallback(() => setViewerIndex(null), []);

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

      {/* Montée SEULEMENT quand elle s'ouvre.
          Rendue en permanence, elle sortait bien `null` tant que
          `visible` était faux — mais ses HOOKS tournaient quand même sur
          chaque tweet illustré du fil : `useWindowDimensions` (un abonné de
          plus aux changements de dimensions par ligne), six valeurs
          partagées et deux `useAnimatedStyle`. Le comportement visible est
          identique : avant comme après, la `<Modal>` apparaît au moment où
          `viewerIndex` cesse d'être nul. */}
      {viewerIndex !== null && (
        <ImageViewerPaper
          urls={images}
          initialIndex={viewerIndex}
          visible
          onClose={closeViewer}
        />
      )}
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
