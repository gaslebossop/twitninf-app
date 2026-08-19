import React, { useEffect, useRef } from 'react';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';

/**
 * L'arrivée d'une ligne de fil — après un rafraîchissement, ou à la toute
 * première ouverture.
 *
 * ── Le piège que ce composant existe pour éviter ─────────────────────────
 * Poser un `entering=` sur une ligne de `FlatList` a DÉJÀ été livré et rejeté
 * (« vraiment IA », « pas pro ») : une ligne se démonte et se remonte au fil du
 * défilement, donc l'animation se REJOUE à chaque fois qu'elle repasse à
 * l'écran. Un fil où le contenu clignote quand on remonte n'est pas un fil
 * animé, c'est un fil cassé.
 *
 * D'où les deux garde-fous, qui sont tout l'intérêt de ce fichier :
 *
 *  1. **Un `Set` d'identifiants déjà vus**, tenu par l'ÉCRAN (donc il survit au
 *     recyclage des lignes, contrairement à une ref locale). Une ligne déjà
 *     apparue une fois ne s'anime plus jamais au remontage.
 *  2. **Un plafond d'index** : seules les premières lignes s'animent. Ce sont
 *     les seules visibles au moment où la fournée arrive. Sans ce plafond, une
 *     ligne montée pour la première fois APRÈS un long défilement s'animerait
 *     en plein scroll — exactement l'effet qu'on cherche à supprimer.
 *
 * ── Ce qui déclenche l'animation ─────────────────────────────────────────
 * Deux chemins, et un seul joue à la fois :
 *  - le MONTAGE, pour une ligne réellement neuve (premier chargement, ou tweet
 *    inédit arrivé par un rafraîchissement) ;
 *  - un changement de `generation`, pour les lignes DÉJÀ montées qu'un
 *    rafraîchissement vient de rafraîchir sans les démonter (l'API renvoie
 *    souvent les mêmes tweets ; sans ce second chemin, tirer pour actualiser
 *    n'animerait rien du tout).
 *
 * ── Le mouvement ─────────────────────────────────────────────────────────
 * Une trajectoire, et rien d'autre : la ligne remonte de 22 px jusqu'à sa
 * place, en décélérant longuement. L'opacité ne bouge jamais (voir la note de
 * réglage plus bas : c'est ce qui a fait rejeter les trois versions
 * précédentes), et il n'y a pas de ressort — un rebond sur du contenu qu'on
 * vient chercher se lit comme un défaut.
 */

/**
 * ── Réglage, en trois corrections ────────────────────────────────────────
 * 1. Montée de 8 px + fondu 0 → 1, 260 ms, 8 lignes : « ça fait mal aux
 *    yeux ». Le tort n'était pas le déplacement seul — c'était de le
 *    combiner à une APPARITION : suivre un bloc qui bouge pendant qu'il se
 *    matérialise, l'œil n'y arrive pas.
 * 2. Fondu nu 0 → 1 en 180 ms : « une flashbang ». Exact — partir de
 *    l'invisible EST un flash, quelle que soit la durée.
 * 3. Fondu depuis 0,35 + échelle : « toujours pas fluide ». Aussi exact : une
 *    opacité qui monte n'est pas un mouvement, c'est une révélation. Ça ne
 *    peut pas couler, il n'y a aucune trajectoire.
 *
 * D'où cette version, qui inverse complètement le parti :
 *  - **l'opacité ne bouge plus DU TOUT.** Chaque ligne est pleinement opaque
 *    du premier au dernier pixel. Rien n'apparaît, rien ne se révèle, donc
 *    rien ne peut claquer ni fatiguer — c'était la cause commune des deux
 *    premiers rejets ;
 *  - **seule la POSITION anime.** Une trajectoire de 22 px : c'est du vrai
 *    mouvement, lisible comme tel, et c'est ce qui donne la sensation de
 *    fluide qu'aucun fondu ne peut produire ;
 *  - **une décélération très longue** (`easing.out`, proche d'un easeOutExpo,
 *    sur 380 ms). Le gros de la course est avalé tôt, puis la ligne glisse et
 *    se pose sans jamais dépasser. C'est la décélération qui fait la
 *    fluidité ;
 *  - **un décalage franc entre lignes** (44 ms), pour que la fournée arrive
 *    en vague plutôt que d'un bloc.
 *
 * Note : un vrai flou de mouvement n'est pas faisable ici — il demanderait un
 * flou recalculé à chaque image (Skia, écarté sur ce projet), pour un coût
 * sans rapport avec le gain. La décélération longue en tient lieu.
 */
/** Nombre de lignes animées en tête de fournée — au-delà, rien ne bouge. */
const MAX_ANIMATED_INDEX = 6;
/** Décalage entre deux lignes voisines — ce qui fait arriver la fournée en vague. */
const STAGGER_MS = 44;
/** Course de la trajectoire, en points. Assez pour se voir, trop peu pour sauter. */
const TRAVEL = 22;

// `theme/motion.ts` importe `Easing` de react-native, inutilisable dans un
// worklet : on reprend ici la MÊME courbe (`easing.out`) depuis Reanimated.
const ENTER = {
  duration: 380,
  easing: Easing.bezier(0.16, 1, 0.3, 1),
};

export interface FeedItemEntranceProps {
  /** Identifiant stable de l'élément (l'id du tweet). */
  id: string;
  /** Position dans la liste — décide du décalage ET du droit à s'animer. */
  index: number;
  /**
   * Incrémenté par l'écran à chaque nouvelle fournée (rafraîchissement).
   * Les lignes déjà montées rejouent leur arrivée quand il change.
   */
  generation: number;
  /**
   * Mémoire des lignes déjà apparues, tenue par l'écran (`useRef(new Set())`).
   * À VIDER en même temps qu'on incrémente `generation`.
   */
  seen: Set<string>;
  children: React.ReactNode;
}

function FeedItemEntrance({ id, index, generation, seen, children }: FeedItemEntranceProps) {
  const eligible = index < MAX_ANIMATED_INDEX;

  /**
   * Décision prise UNE FOIS, au premier rendu, par LECTURE PURE du `Set`.
   *
   * L'ajout au `Set` se fait dans un effet, jamais pendant le rendu : en
   * double rendu (StrictMode), marquer ici ferait dire « déjà vue » à la
   * seconde passe, et la ligne ne s'animerait jamais.
   */
  const animateOnMountRef = useRef<boolean | null>(null);
  if (animateOnMountRef.current === null) {
    animateOnMountRef.current = eligible && !seen.has(id);
  }

  const progress = useSharedValue(animateOnMountRef.current ? 0 : 1);
  const lastGenerationRef = useRef(generation);

  useEffect(() => {
    seen.add(id);
  }, [id, seen]);

  // Montage.
  useEffect(() => {
    if (!animateOnMountRef.current) return;
    progress.value = 0;
    progress.value = withDelay(index * STAGGER_MS, withTiming(1, ENTER));
    // Volontairement au montage seul : `index` peut changer quand la liste se
    // réordonne, ce qui rejouerait l'arrivée sans qu'il ne se soit rien passé.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Nouvelle fournée sur une ligne restée montée.
  useEffect(() => {
    if (lastGenerationRef.current === generation) return;
    lastGenerationRef.current = generation;
    if (!eligible) {
      progress.value = 1;
      return;
    }
    progress.value = 0;
    progress.value = withDelay(index * STAGGER_MS, withTiming(1, ENTER));
  }, [generation, eligible, index, progress]);

  /**
   * POSITION SEULE. Pas d'`opacity` dans ce style, volontairement : c'est
   * elle qui a fait rejeter les trois versions précédentes. La ligne est
   * opaque en permanence, elle ne fait que rejoindre sa place.
   */
  const style = useAnimatedStyle(() => ({
    transform: [{ translateY: (1 - progress.value) * TRAVEL }] as const,
  }));

  return <Animated.View style={style}>{children}</Animated.View>;
}

/**
 * Mémoïsé sur les seules entrées qui décident du mouvement : sans ça, chaque
 * rendu de l'écran (un like, une page chargée) traverserait ce niveau pour
 * rien et annulerait la mémoïsation de la ligne qu'il enveloppe.
 */
export default React.memo(FeedItemEntrance);
