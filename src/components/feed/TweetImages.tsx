/**
 * Images jointes à un tweet, et leur visionneuse.
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
 *
 * ── Animations ──
 * Deux, et seulement deux, parce qu'elles répondent à quelque chose :
 *   - l'appui enfonce légèrement la vignette — retour tactile immédiat, avant
 *     même que la visionneuse s'ouvre ;
 *   - une image apparaît en fondu la PREMIÈRE FOIS qu'on la voit.
 *
 * Le « première fois » est essentiel. Les lignes du fil sont recyclées : sans
 * mémoire des images déjà vues, remonter le fil rejouerait le fondu à chaque
 * réapparition, ce qui donne exactement l'effet clinquant et faux qu'on ne
 * veut pas. Rien n'est animé au montage de la ligne elle-même.
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

import { colors } from '../../theme';
import ImageViewer from './ImageViewer';

interface TweetImagesProps {
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

function TweetImageCell({
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
    transform: [{ scale: 1 - pressed.value * 0.02 }],
  }));

  return (
    <Pressable
      style={[styles.cell, full ? styles.cellFull : styles.cellHalf]}
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
      <Animated.View style={[styles.fill, animatedStyle]}>
        {/* `expo-image` et non le `Image` du coeur RN — trois raisons, toutes
            propres à une image montée dans une liste recyclée :

            1. `cachePolicy="memory-disk"` : la même photo réapparaît sans
               retéléchargement NI redécodage quand on remonte le fil (le
               défaut d'expo-image est `disk` seul, il faut le demander) ;
            2. `recyclingKey` : la vue est vidée avant de charger une nouvelle
               source, donc une cellule réutilisée ne montre jamais, même un
               instant, la photo de la ligne precedente ;
            3. `allowDownscaling` (actif par défaut dès que `contentFit` vaut
               `cover` ou `contain`) redimensionne au format réel de la cellule
               au lieu de garder un bitmap pleine resolution en memoire.

            Rendu inchangé : `contentFit="cover"` est l'equivalent exact de
            `resizeMode="cover"`, et `transition={0}` laisse le fondu maison
            (`alreadySeen`) seul maître — celui d'expo-image se rejouerait à
            chaque recyclage, ce que ce composant existe pour éviter. */}
        <Image
          source={{ uri: url }}
          style={styles.fill}
          contentFit="cover"
          cachePolicy="memory-disk"
          recyclingKey={url}
          transition={0}
          onLoad={handleLoad}
        />
      </Animated.View>
    </Pressable>
  );
}

function TweetImages({ urls, onBeforeOpen }: TweetImagesProps) {
  const images = (urls || [])
    .filter((url) => typeof url === 'string' && url.length > 0)
    .slice(0, MAX_VISIBLE);

  const [viewerIndex, setViewerIndex] = useState<number | null>(null);

  const open = useCallback(
    (index: number) => {
      onBeforeOpen?.();
      setViewerIndex(index);
    },
    [onBeforeOpen]
  );

  const closeViewer = useCallback(() => setViewerIndex(null), []);

  if (images.length === 0) return null;

  const single = images.length === 1;
  // Sur trois images, la dernière prend toute la largeur : à deux colonnes,
  // elle resterait sinon seule avec un trou à côté d'elle.
  const lastSpansFullWidth = images.length === 3;

  return (
    <>
      <View style={styles.grid}>
        {images.map((url, index) => (
          <TweetImageCell
            key={`${url}-${index}`}
            url={url}
            full={single || (lastSpansFullWidth && index === 2)}
            label={single ? 'Image du tweet' : `Image ${index + 1} sur ${images.length}`}
            onPress={() => open(index)}
          />
        ))}
      </View>

      {/* Montée SEULEMENT quand elle s'ouvre.
          `ImageViewer` rend `null` tant qu'il est invisible, mais ses crochets,
          eux, s'exécutent quand même : six `useSharedValue`, trois
          `useAnimatedStyle` et trois objets de geste, AVANT le `return null`.
          Passée en propriété `visible`, la visionneuse posait donc tout cela
          sur chaque ligne illustrée du fil, en permanence — et chaque
          `useAnimatedStyle` s'enregistre comme auditeur sur les valeurs
          partagées qu'il lit. Même conditionnement que `TweetImagesPaper`. */}
      {viewerIndex !== null && (
        <ImageViewer
          urls={images}
          initialIndex={viewerIndex}
          visible
          onClose={closeViewer}
        />
      )}
    </>
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
  fill: { width: '100%', height: '100%' },
});

export default React.memo(TweetImages);
