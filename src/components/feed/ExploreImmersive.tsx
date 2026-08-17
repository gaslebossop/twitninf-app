import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Dimensions, Modal, Pressable, Share, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { ResizeMode, Video } from 'expo-av';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  Easing,
  Extrapolation,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { colors, fonts, radius, withAlpha } from '../../theme';
import Avatar from '../Avatar';
import VerifiedBadge from '../VerifiedBadge';
import { CommentSheet } from '../CommentSheet';
import feedback from '../../utils/feedback';
import { formatCompactCount } from '../../utils/format';
import { contentSourceOf, displayContentOf, splitTweetMedia } from '../../utils/tweetMedia';
import type { CardRect } from './ExploreGrid';
import type { Tweet } from '../../types/api';

/**
 * Lecture de la découverte — un tweet, un geste, le suivant.
 *
 * ── Le problème qu'elle résout ──────────────────────────────────────────────
 * La grille envoyait chaque appui sur `TweetDetailScreen`. Ce trajet TERMINE la
 * consultation : on lit un tweet, sa page de réponses s'ouvre, et il faut
 * revenir en arrière — souvent en ayant perdu sa place — pour en voir un
 * second. Un aller-retour complet par tweet, avec à chaque retour une décision
 * à prendre, donc une occasion de partir.
 *
 * ── Un tweet à l'écran, un glissé pour changer ──────────────────────────────
 * Chaque page montre UN tweet, entier, et rien d'autre : pas de bout de la
 * carte suivante en bas d'écran, pas de défilement libre qui coupe un tweet en
 * deux. Un glissé vers le haut passe au suivant, vers le bas au précédent. La
 * conséquence est qu'il n'y a jamais rien à décider entre deux tweets — le
 * geste est le même à chaque fois, et il est minuscule.
 *
 * C'est pour ça que le pager est écrit à la main (geste + trois pages montées)
 * plutôt qu'avec une `FlatList` paginée : une liste réintroduit du défilement
 * libre, de l'inertie, des positions intermédiaires où deux tweets se
 * partagent l'écran — et surtout elle capte tous les glissés verticaux, ce qui
 * rend impossible le geste de sortie ci-dessous.
 *
 * ── Sortir comme sur Instagram ──────────────────────────────────────────────
 * Sur la première page, tirer vers le bas ne va nulle part : ce geste RAMÈNE la
 * lecture vers la carte d'où elle est sortie. La surface rétrécit sous le doigt
 * en direction de son rectangle d'origine (`CardRect`), et se referme si on
 * lâche assez bas — sinon elle remonte. L'ouverture est la même animation à
 * l'endroit : la carte touchée grandit jusqu'au plein écran. Rien ne glisse
 * par-dessus, rien ne se substitue : la grille et la lecture sont la même
 * surface, vue de plus ou moins près.
 *
 * ⚠ Rendu dans une `<Modal>` parce que la barre d'onglets est en
 * `position: 'absolute'` au-dessus des écrans d'onglet : un recouvrement
 * ordinaire passerait dessous. Conséquence (voir CLAUDE.md) : les hôtes
 * `toast`/`confirm` ne s'affichent pas par-dessus — aucun retour d'action ne
 * passe par eux ici, tout est rendu sur place.
 */

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

/** Même fenêtre de double-tap que `TweetRow` et la grille. */
const DOUBLE_TAP_MS = 280;

/** En dessous, on ne prévient pas le classement : c'est un passage, pas une lecture. */
const MIN_TRACKED_DWELL_MS = 900;

/**
 * Toutes les N pages, le fil DEMANDE — au lieu de deviner.
 *
 * Le temps de lecture, les likes et les partages sont des signaux devinés : ils
 * disent ce qu'on a fait, pas ce qu'on voulait. Une question directe tranche là
 * où ils se contredisent (on regarde longtemps une chose qui agace, on aime un
 * ami sans vouloir en voir plus). Instagram fait exactement ça — « is this post
 * worth your time ? » posé dans le fil, et un « Intéressé/Pas intéressé » sous
 * les recommandations.
 *
 * Espacé : trop fréquente, la question devient un péage et on répond n'importe
 * quoi — ce qui rend le signal moins fiable que celui qu'il devait corriger.
 */
const SURVEY_EVERY_PAGES = 8;

/** Durée d'affichage de l'accusé de réception, avant disparition. */
const SURVEY_ACK_MS = 1800;

/** Part de la hauteur d'écran à parcourir pour changer de tweet. */
const PAGE_COMMIT_RATIO = 0.18;
/** …ou cette vitesse, pour que le geste rapide marche sans amplitude. */
const PAGE_COMMIT_VELOCITY = 550;

/** Tirage vers le bas au-delà duquel la lecture se referme. */
const DISMISS_RATIO = 0.22;
const DISMISS_VELOCITY = 800;

/** Le tweet reste entier à l'écran : le média ne dépasse jamais cette part. */
const MEDIA_MAX_RATIO = 1.2;

const HEADER_H = 60;
const ACTIONS_H = 52;

/** Le texte porte la page : plus il est court, plus il est gros. */
function posterTypography(length: number): { fontSize: number; lineHeight: number } {
  if (length <= 60) return { fontSize: 30, lineHeight: 39 };
  if (length <= 140) return { fontSize: 25, lineHeight: 33 };
  if (length <= 260) return { fontSize: 20, lineHeight: 28 };
  return { fontSize: 17, lineHeight: 25 };
}

interface ImmersivePageProps {
  tweet: Tweet;
  active: boolean;
  height: number;
  onLike: (tweet: Tweet, next: boolean) => void;
  onRetweet: (tweet: Tweet) => void;
  onOpenComments: (tweet: Tweet) => void;
  onOpenThread: (tweet: Tweet) => void;
  onOpenProfile: (tweet: Tweet) => void;
  onFollow: (tweet: Tweet) => void;
  /** Durée réelle de la vidéo, dès que le lecteur la connaît. */
  onVideoDuration: (tweetId: string, durationMs: number) => void;
  isFollowed: boolean;
  isSelf: boolean;
}

const ImmersivePage = memo(function ImmersivePage({
  tweet,
  active,
  height,
  onLike,
  onRetweet,
  onOpenComments,
  onOpenThread,
  onOpenProfile,
  onFollow,
  onVideoDuration,
  isFollowed,
  isSelf,
}: ImmersivePageProps) {
  const insets = useSafeAreaInsets();
  const source = contentSourceOf(tweet);
  const media = useMemo(() => splitTweetMedia(tweet), [tweet]);
  const content = useMemo(() => displayContentOf(tweet), [tweet]);

  const isLiked = !!tweet.user_interaction?.is_liked;
  const isRetweeted = !!tweet.user_interaction?.is_retweeted;
  const likes = tweet.stats?.likes ?? 0;
  const replies = tweet.stats?.replies ?? 0;
  const retweets = tweet.stats?.retweets ?? 0;

  const [muted, setMuted] = useState(true);
  const lastTapRef = useRef(0);
  const bigHeart = useSharedValue(0);

  const playBigHeart = useCallback(() => {
    bigHeart.value = 0;
    bigHeart.value = withTiming(1, { duration: 700 });
  }, [bigHeart]);

  const bigHeartStyle = useAnimatedStyle(() => ({
    opacity: interpolate(bigHeart.value, [0, 0.12, 0.7, 1], [0, 0.95, 0.9, 0], Extrapolation.CLAMP),
    transform: [
      {
        scale: interpolate(
          bigHeart.value,
          [0, 0.15, 0.3, 0.6, 1],
          [0.2, 1.2, 0.95, 1.02, 0.75],
          Extrapolation.CLAMP
        ),
      },
    ] as const,
  }));

  /** Double-tap = j'aime, jamais je retire. Appui simple sur une vidéo = son. */
  const handleBodyPress = useCallback(() => {
    const now = Date.now();
    const isDoubleTap = now - lastTapRef.current < DOUBLE_TAP_MS;
    lastTapRef.current = now;

    if (isDoubleTap) {
      playBigHeart();
      if (!isLiked) {
        feedback.select();
        onLike(tweet, true);
      }
      return;
    }
    if (media.videoUrl) setMuted((m) => !m);
  }, [isLiked, media.videoUrl, onLike, playBigHeart, tweet]);

  const handleShare = useCallback(async () => {
    const author = source?.author?.username ? `@${source.author.username}` : 'twitninf';
    try {
      await Share.share({
        message: content ? `${content}\n\n— ${author} sur twitninf` : `${author} sur twitninf`,
      });
    } catch {
      // Feuille de partage refusée ou fermée : rien à signaler.
    }
  }, [content, source]);

  // Le corps prend ce qui reste une fois l'en-tête, les actions et les encoches
  // retirés — c'est ce qui garantit qu'on voit le tweet ENTIER, jamais coupé.
  const available = Math.max(
    160,
    height - insets.top - insets.bottom - HEADER_H - ACTIONS_H - 56
  );
  const bodyHeight = Math.min(available, Math.round(SCREEN_W * MEDIA_MAX_RATIO));
  const type = posterTypography(content.length);

  return (
    <View style={[styles.page, { height, paddingTop: insets.top + 44, paddingBottom: insets.bottom + 10 }]}>
      {/* ── Qui parle ── */}
      <View style={styles.header}>
        <Pressable style={styles.headerLeft} onPress={() => onOpenProfile(tweet)} hitSlop={6}>
          <Avatar size={36} username={source?.author?.username} uri={source?.author?.avatar} />
          <View style={styles.headerNames}>
            <View style={styles.headerNameRow}>
              <Text style={styles.username} numberOfLines={1}>
                @{source?.author?.username || 'inconnu'}
              </Text>
              {!!source?.author?.verified && (
                <VerifiedBadge
                  verificationStyle={source.author.verification_style as any}
                  size={14}
                  premium={source.author.premium}
                />
              )}
            </View>
            {!!source?.author?.full_name && (
              <Text style={styles.fullName} numberOfLines={1}>
                {source.author.full_name}
              </Text>
            )}
          </View>
        </Pressable>

        {!isSelf && !isFollowed && (
          <Pressable style={styles.followBtn} onPress={() => onFollow(tweet)} hitSlop={6}>
            <Text style={styles.followText}>Suivre</Text>
          </Pressable>
        )}
      </View>

      {/* ── Ce qu'il montre ── */}
      <Pressable onPress={handleBodyPress}>
        <View style={[styles.body, { height: bodyHeight }]}>
          {media.hasVisual ? (
            <>
              {!!media.coverUrl && (
                <Image
                  source={{ uri: media.coverUrl }}
                  style={StyleSheet.absoluteFill}
                  contentFit="cover"
                  cachePolicy="memory-disk"
                  transition={160}
                  recyclingKey={media.coverUrl}
                />
              )}
              {/* La vidéo n'est montée que sur la page active : trois décodeurs
                  ouverts en permanence figent le geste sur Android d'entrée de
                  gamme, et les pages voisines ne sont pas regardées. */}
              {!!media.videoUrl && active && (
                <Video
                  source={{ uri: media.videoUrl }}
                  style={StyleSheet.absoluteFill}
                  resizeMode={ResizeMode.COVER}
                  isLooping
                  isMuted={muted}
                  shouldPlay
                  onPlaybackStatusUpdate={(status) => {
                    // La durée d'une vidéo n'existe nulle part dans le modèle
                    // `Tweet` : le lecteur est la seule source. Sans elle, le
                    // moteur ne peut pas juger si la vidéo a été regardée en
                    // entier ou abandonnée au quart.
                    if (!('isLoaded' in status) || !status.isLoaded) return;
                    if (status.durationMillis) onVideoDuration(String(tweet.id), status.durationMillis);
                  }}
                />
              )}
              {/* Démarrage muet : un son qui part tout seul en pleine
                  découverte fait fermer l'app plus souvent qu'il ne retient. */}
              {!!media.videoUrl && (
                <View style={styles.soundChip} pointerEvents="none">
                  <Ionicons name={muted ? 'volume-mute' : 'volume-medium'} size={13} color={colors.white} />
                </View>
              )}
            </>
          ) : (
            // Sans image, le tweet EST la page : grand guillemet de marque sur
            // aplat plein — pas de dégradé décoratif (règle « surfaces pleines »).
            <View style={styles.poster}>
              <Text style={styles.posterMark}>“</Text>
              <Text
                style={[styles.posterText, { fontSize: type.fontSize, lineHeight: type.lineHeight }]}
                numberOfLines={10}
              >
                {content}
              </Text>
            </View>
          )}

          <Animated.View pointerEvents="none" style={[styles.bigHeartOverlay, bigHeartStyle]}>
            <Ionicons name="heart" size={96} color={colors.white} />
          </Animated.View>
        </View>
      </Pressable>

      {/* La légende ne double jamais le texte déjà affiché en grand. */}
      {media.hasVisual && !!content && (
        <Text style={styles.captionText} numberOfLines={2}>
          {content}
        </Text>
      )}

      {/* ── Ce qu'on peut en faire, sans quitter la lecture ── */}
      <View style={styles.actions}>
        <Pressable
          style={styles.action}
          onPress={() => {
            feedback.select();
            if (!isLiked) playBigHeart();
            onLike(tweet, !isLiked);
          }}
          hitSlop={8}
        >
          <Ionicons
            name={isLiked ? 'heart' : 'heart-outline'}
            size={26}
            color={isLiked ? colors.like : colors.textPrimary}
          />
          <Text style={styles.actionText}>{formatCompactCount(likes)}</Text>
        </Pressable>

        <Pressable style={styles.action} onPress={() => onOpenComments(tweet)} hitSlop={8}>
          <Ionicons name="chatbubble-outline" size={23} color={colors.textPrimary} />
          <Text style={styles.actionText}>{formatCompactCount(replies)}</Text>
        </Pressable>

        <Pressable
          style={styles.action}
          onPress={() => {
            feedback.select();
            onRetweet(tweet);
          }}
          hitSlop={8}
        >
          <Ionicons name="repeat" size={25} color={isRetweeted ? colors.cyan : colors.textPrimary} />
          <Text style={styles.actionText}>{formatCompactCount(retweets)}</Text>
        </Pressable>

        <Pressable style={styles.action} onPress={handleShare} hitSlop={8}>
          <Ionicons name="arrow-redo-outline" size={23} color={colors.textPrimary} />
        </Pressable>

        <View style={{ flex: 1 }} />

        <Pressable style={styles.threadLink} onPress={() => onOpenThread(tweet)} hitSlop={8}>
          <Text style={styles.threadLinkText}>Voir le fil</Text>
          <Ionicons name="chevron-forward" size={13} color={colors.textSecondary} />
        </Pressable>
      </View>
    </View>
  );
});

export interface ExploreImmersiveProps {
  visible: boolean;
  tweets: Tweet[];
  initialIndex: number;
  /** Rectangle de la carte touchée : la lecture s'ouvre et se referme dessus. */
  originRect: CardRect | null;
  loadingMore: boolean;
  onClose: () => void;
  onEndReached: () => void;
  onLike: (tweet: Tweet, next: boolean) => void;
  onRetweet: (tweet: Tweet) => void;
  onOpenThread: (tweet: Tweet) => void;
  onOpenProfile: (tweet: Tweet) => void;
  onFollow: (tweet: Tweet) => void;
  /** Réponse à la question posée dans le fil (« ça t'intéresse ? »). */
  onInterest: (tweet: Tweet, interested: boolean) => void;
  /**
   * Temps réellement passé sur un tweet — le signal de goût le plus fiable.
   *
   * `videoDurationMs` n'est renseigné que pour une vidéo dont la durée a été
   * remontée par le lecteur : c'est elle qui permet au moteur de raisonner en
   * TAUX DE COMPLÉTION plutôt qu'en secondes brutes.
   */
  onDwell: (tweet: Tweet, dwellMs: number, videoDurationMs?: number) => void;
  followedIds: Set<string>;
  currentUserId?: string;
}

function ExploreImmersive({
  visible,
  tweets,
  initialIndex,
  originRect,
  loadingMore,
  onClose,
  onEndReached,
  onLike,
  onRetweet,
  onOpenThread,
  onOpenProfile,
  onFollow,
  onInterest,
  onDwell,
  followedIds,
  currentUserId,
}: ExploreImmersiveProps) {
  const insets = useSafeAreaInsets();
  const [mounted, setMounted] = useState(visible);
  const [pageHeight, setPageHeight] = useState(0);
  const [index, setIndex] = useState(initialIndex);
  const [commentTarget, setCommentTarget] = useState<Tweet | null>(null);
  /** Page sur laquelle la question est posée, et réponse déjà donnée. */
  const [survey, setSurvey] = useState<{ index: number; answered: boolean } | null>(null);
  const pagesViewedRef = useRef(0);
  const surveyAckTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (surveyAckTimerRef.current) clearTimeout(surveyAckTimerRef.current);
  }, []);

  const dwellRef = useRef<{ tweet: Tweet; startedAt: number } | null>(null);
  const tweetsRef = useRef(tweets);
  tweetsRef.current = tweets;

  /** Durées remontées par le lecteur vidéo, par id de tweet. */
  const videoDurationsRef = useRef<Record<string, number>>({});
  const handleVideoDuration = useCallback((tweetId: string, durationMs: number) => {
    videoDurationsRef.current[tweetId] = durationMs;
  }, []);

  /** Position du pager, en pages (fractionnaire pendant le geste). */
  const page = useSharedValue(initialIndex);
  /** 0 = à la place de la carte de grille, 1 = plein écran. */
  const open = useSharedValue(0);
  /** Verrou pendant une animation de page, pour ne pas empiler deux gestes. */
  const settling = useSharedValue(false);

  const dwellHandlerRef = useRef(onDwell);
  dwellHandlerRef.current = onDwell;
  const endReachedRef = useRef(onEndReached);
  endReachedRef.current = onEndReached;

  const flushDwell = useCallback(() => {
    const pending = dwellRef.current;
    dwellRef.current = null;
    if (!pending) return;
    const elapsed = Date.now() - pending.startedAt;
    if (elapsed < MIN_TRACKED_DWELL_MS) return;
    dwellHandlerRef.current(pending.tweet, elapsed, videoDurationsRef.current[String(pending.tweet.id)]);
  }, []);

  useEffect(() => {
    if (!visible) return;
    setMounted(true);
    setIndex(initialIndex);
    page.value = initialIndex;
    const seed = tweetsRef.current[initialIndex];
    dwellRef.current = seed ? { tweet: seed, startedAt: Date.now() } : null;
    open.value = 0;
    open.value = withTiming(1, { duration: 260, easing: Easing.out(Easing.cubic) });
    // Ouvrir sur une carte proche du bout doit déjà réclamer la suite : sans
    // ça, le premier glissé tomberait sur du vide au lieu du tweet suivant.
    if (initialIndex >= tweetsRef.current.length - 4) endReachedRef.current();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, initialIndex]);

  // Filet : si le parent referme la lecture sans passer par le geste, la
  // fenêtre ne doit pas rester ouverte en attendant une animation.
  useEffect(() => {
    if (!visible && mounted) setMounted(false);
  }, [visible, mounted]);

  /** Appelé depuis un worklet — jamais directement (voir `runOnJS` plus bas). */
  const finishClose = useCallback(() => {
    setMounted(false);
    flushDwell();
    setCommentTarget(null);
    onClose();
  }, [flushDwell, onClose]);

  const handleClose = useCallback(() => {
    // ⚠ `finishClose` est une fonction JS ordinaire : l'appeler tel quel depuis
    // le worklet de rappel tuerait l'app sans le moindre log.
    open.value = withTiming(0, { duration: 200, easing: Easing.in(Easing.cubic) }, (done) => {
      'worklet';
      if (done) runOnJS(finishClose)();
    });
  }, [finishClose, open]);

  /**
   * Changement de page effectif.
   *
   * Appelé une fois l'animation terminée : c'est ici que le temps de lecture du
   * tweet quitté est remonté, et que la pagination est réveillée quand on
   * approche du bout — jamais une fois arrivé dessus.
   */
  const commitPage = useCallback((next: number) => {
    const list = tweetsRef.current;
    const pending = dwellRef.current;
    if (pending) {
      const elapsed = Date.now() - pending.startedAt;
      if (elapsed >= MIN_TRACKED_DWELL_MS) {
        dwellHandlerRef.current(pending.tweet, elapsed, videoDurationsRef.current[String(pending.tweet.id)]);
      }
    }
    const tweet = list[next];
    dwellRef.current = tweet ? { tweet, startedAt: Date.now() } : null;
    setIndex(next);
    if (next >= list.length - 4) endReachedRef.current();

    // La question suit la page : elle ne survit pas au glissé suivant, sinon
    // elle porterait sur un tweet qui n'est plus à l'écran.
    pagesViewedRef.current += 1;
    if (surveyAckTimerRef.current) {
      clearTimeout(surveyAckTimerRef.current);
      surveyAckTimerRef.current = null;
    }
    setSurvey(
      tweet && pagesViewedRef.current % SURVEY_EVERY_PAGES === 0
        ? { index: next, answered: false }
        : null
    );
  }, []);

  const lastIndex = Math.max(0, tweets.length - 1);

  /**
   * Deux gestes, deux axes, jamais d'ambiguïté entre les deux.
   *
   * La première version faisait tout porter par le tirage vertical : vers le
   * bas changeait de tweet la plupart du temps, mais fermait la lecture si le
   * tirage était assez fort — et UNIQUEMENT depuis la toute première page,
   * sinon un tirage franc ne faisait que reculer d'un tweet. Un même geste,
   * un même axe, deux résultats selon la position et l'intensité : personne
   * ne peut deviner ça, encore moins le sentir sous le doigt. Le vertical ne
   * fait plus QUE changer de tweet, où qu'on soit dans la liste ; sortir est
   * un geste à part, sur l'axe horizontal — comme fermer une story.
   */
  const pan = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetY([-12, 12])
        .failOffsetX([-24, 24])
        .onUpdate((e) => {
          'worklet';
          if (settling.value || pageHeight <= 0) return;
          const target = index - e.translationY / pageHeight;
          page.value = Math.max(0, Math.min(lastIndex, target));
        })
        .onEnd((e) => {
          'worklet';
          if (settling.value || pageHeight <= 0) return;

          const movedEnough = Math.abs(e.translationY) > pageHeight * PAGE_COMMIT_RATIO;
          const fastEnough = Math.abs(e.velocityY) > PAGE_COMMIT_VELOCITY;
          let next = index;
          if (movedEnough || fastEnough) next = e.translationY < 0 ? index + 1 : index - 1;
          next = Math.max(0, Math.min(lastIndex, next));

          settling.value = true;
          page.value = withTiming(next, { duration: 230, easing: Easing.out(Easing.cubic) }, (done) => {
            'worklet';
            settling.value = false;
            if (done && next !== index) runOnJS(commitPage)(next);
          });
        }),
    [commitPage, index, lastIndex, page, pageHeight, settling]
  );

  /**
   * Sortir — tirage vers la DROITE, depuis n'importe quelle page.
   *
   * Même animation que l'ouverture, jouée à l'envers : la surface rétrécit
   * vers le rectangle de la carte d'origine à mesure qu'on tire, et se
   * referme si on lâche assez loin ou assez vite — sinon elle reprend sa
   * taille pleine. Un geste, un axe, un seul résultat possible : plus besoin
   * d'être sur la première page ni de deviner si le tirage était « assez ».
   */
  const dismissGesture = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetX([16, 999])
        .failOffsetY([-16, 16])
        .onUpdate((e) => {
          'worklet';
          if (settling.value || e.translationX <= 0) return;
          open.value = interpolate(
            e.translationX,
            [0, SCREEN_W * 0.6],
            [1, 0.35],
            Extrapolation.CLAMP
          );
        })
        .onEnd((e) => {
          'worklet';
          if (settling.value) return;
          const far = e.translationX > SCREEN_W * DISMISS_RATIO;
          if (e.translationX > 0 && (far || e.velocityX > DISMISS_VELOCITY)) {
            open.value = withTiming(0, { duration: 200, easing: Easing.in(Easing.cubic) }, (done) => {
              'worklet';
              if (done) runOnJS(finishClose)();
            });
          } else {
            open.value = withTiming(1, { duration: 180 });
          }
        }),
    [finishClose, open, settling]
  );

  /** Axes orthogonaux, `activeOffset`/`failOffset` opposés de chaque côté :
      la course ne fait qu'arbitrer LEQUEL démarre en premier, jamais les deux. */
  const composedGesture = useMemo(
    () => Gesture.Race(pan, dismissGesture),
    [pan, dismissGesture]
  );

  /** Trois pages montées : la précédente, la courante, la suivante. */
  const visiblePages = useMemo(() => {
    const out: { tweet: Tweet; slot: number }[] = [];
    for (let i = index - 1; i <= index + 1; i++) {
      if (i < 0 || i >= tweets.length) continue;
      out.push({ tweet: tweets[i], slot: i });
    }
    return out;
  }, [index, tweets]);

  const columnStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: -page.value * pageHeight }] as const,
  }));

  // Ouverture et fermeture sont la MÊME interpolation, jouée dans un sens ou
  // dans l'autre : la lecture part du rectangle de la carte touchée et y
  // revient. Sans mesure (cas limite : carte démontée entre l'appui et
  // l'ouverture), on retombe sur un agrandissement centré.
  const surfaceStyle = useAnimatedStyle(() => {
    const fromScale = originRect ? Math.max(0.2, originRect.width / SCREEN_W) : 0.9;
    const fromX = originRect ? originRect.x + originRect.width / 2 - SCREEN_W / 2 : 0;
    const fromY = originRect ? originRect.y + originRect.height / 2 - SCREEN_H / 2 : 0;
    return {
      opacity: interpolate(open.value, [0, 0.4, 1], [0, 1, 1], Extrapolation.CLAMP),
      borderRadius: interpolate(open.value, [0, 1], [radius.lg, 0], Extrapolation.CLAMP),
      transform: [
        { translateX: interpolate(open.value, [0, 1], [fromX, 0], Extrapolation.CLAMP) },
        { translateY: interpolate(open.value, [0, 1], [fromY, 0], Extrapolation.CLAMP) },
        { scale: interpolate(open.value, [0, 1], [fromScale, 1], Extrapolation.CLAMP) },
      ] as const,
    };
  });

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: interpolate(open.value, [0, 1], [0, 1], Extrapolation.CLAMP),
  }));

  return (
    <Modal
      visible={mounted}
      animationType="none"
      onRequestClose={handleClose}
      statusBarTranslucent
      transparent
    >
      <Animated.View style={[styles.backdrop, backdropStyle]} />
      <Animated.View
        style={[styles.surface, surfaceStyle]}
        onLayout={(e) => {
          const h = Math.round(e.nativeEvent.layout.height);
          if (h > 0 && h !== pageHeight) setPageHeight(h);
        }}
      >
        {pageHeight > 0 && (
          <GestureDetector gesture={composedGesture}>
            <View style={StyleSheet.absoluteFill}>
              <Animated.View style={[StyleSheet.absoluteFill, columnStyle]}>
                {visiblePages.map(({ tweet, slot }) => (
                  <View
                    key={tweet.id}
                    style={[styles.slot, { top: slot * pageHeight, height: pageHeight }]}
                  >
                    <ImmersivePage
                      tweet={tweet}
                      active={slot === index && !commentTarget}
                      height={pageHeight}
                      onLike={onLike}
                      onRetweet={onRetweet}
                      onOpenComments={setCommentTarget}
                      onOpenThread={onOpenThread}
                      onOpenProfile={onOpenProfile}
                      onFollow={onFollow}
                      onVideoDuration={handleVideoDuration}
                      isFollowed={followedIds.has(String(contentSourceOf(tweet)?.author?.id || ''))}
                      isSelf={String(contentSourceOf(tweet)?.author?.id || '') === String(currentUserId || '')}
                    />
                  </View>
                ))}
              </Animated.View>
            </View>
          </GestureDetector>
        )}

        {/* En-tête léger : de quoi ressortir sans chercher, sans habiller la lecture. */}
        <View style={[styles.topBar, { paddingTop: insets.top + 6 }]} pointerEvents="box-none">
          <Pressable style={styles.closeBtn} onPress={handleClose} hitSlop={10}>
            <Ionicons name="chevron-down" size={24} color={colors.textPrimary} />
          </Pressable>
          <Text style={styles.topTitle}>Explorer</Text>
          <View style={styles.closeBtn} />
        </View>

        {/* ── La question ──
            Le fil demande au lieu de deviner. La réponse n'est pas décorative :
            « pas intéressé » met l'AUTEUR en sourdine côté moteur, pas seulement
            ce tweet — sans quoi le geste ne change rien de perceptible et
            l'utilisateur a raison de conclure qu'il ne sert à rien. */}
        {!!survey && !!tweets[survey.index] && (
          <View style={[styles.survey, { bottom: insets.bottom + 74 }]}>
            {survey.answered ? (
              <Text style={styles.surveyAck}>Compris — c'est noté.</Text>
            ) : (
              <>
                <Text style={styles.surveyQuestion} numberOfLines={1}>
                  Ce genre de tweet t'intéresse ?
                </Text>
                <View style={styles.surveyButtons}>
                  <Pressable
                    style={styles.surveyBtn}
                    hitSlop={6}
                    onPress={() => {
                      feedback.select();
                      onInterest(tweets[survey.index], false);
                      setSurvey({ ...survey, answered: true });
                      surveyAckTimerRef.current = setTimeout(() => setSurvey(null), SURVEY_ACK_MS);
                    }}
                  >
                    <Ionicons name="thumbs-down-outline" size={16} color={colors.textSecondary} />
                    <Text style={styles.surveyBtnText}>Non</Text>
                  </Pressable>
                  <Pressable
                    style={[styles.surveyBtn, styles.surveyBtnYes]}
                    hitSlop={6}
                    onPress={() => {
                      feedback.select();
                      onInterest(tweets[survey.index], true);
                      setSurvey({ ...survey, answered: true });
                      surveyAckTimerRef.current = setTimeout(() => setSurvey(null), SURVEY_ACK_MS);
                    }}
                  >
                    <Ionicons name="thumbs-up-outline" size={16} color={colors.white} />
                    <Text style={[styles.surveyBtnText, styles.surveyBtnTextYes]}>Oui</Text>
                  </Pressable>
                </View>
              </>
            )}
          </View>
        )}

        {loadingMore && (
          <View style={[styles.loadingPill, { bottom: insets.bottom + 14 }]} pointerEvents="none">
            <Text style={styles.loadingPillText}>Chargement…</Text>
          </View>
        )}

        {/* `CommentSheet` n'est pas une `<Modal>` : elle se superpose ici sans
            empilement de fenêtres natives, et la lecture reprend à la
            fermeture. Commenter ne fait donc plus quitter la découverte. */}
        {!!commentTarget && (
          <CommentSheet
            visible={!!commentTarget}
            totalCount={commentTarget.stats?.replies ?? 0}
            tweetId={String(commentTarget.id)}
            onClose={() => setCommentTarget(null)}
            tweetAuthorUsername={contentSourceOf(commentTarget)?.author?.username}
          />
        )}
      </Animated.View>
    </Modal>
  );
}

export default memo(ExploreImmersive);

const styles = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: colors.bg },
  surface: { flex: 1, backgroundColor: colors.bg, overflow: 'hidden' },

  slot: { position: 'absolute', left: 0, right: 0 },
  page: { width: SCREEN_W, paddingHorizontal: 0, justifyContent: 'center' },

  header: {
    height: HEADER_H,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    gap: 10,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  headerNames: { flex: 1 },
  headerNameRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  username: { color: colors.textPrimary, fontSize: 15, fontFamily: fonts.bold, flexShrink: 1 },
  fullName: { color: colors.textMuted, fontSize: 12, fontFamily: fonts.medium },
  followBtn: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: radius.lg,
    backgroundColor: colors.accent,
  },
  followText: { color: colors.white, fontSize: 12.5, fontFamily: fonts.bold },

  body: { width: SCREEN_W, backgroundColor: colors.surfaceAlt, overflow: 'hidden' },
  poster: { ...StyleSheet.absoluteFillObject, paddingHorizontal: 26, justifyContent: 'center' },
  posterMark: {
    color: colors.accent,
    fontFamily: fonts.bold,
    fontSize: 58,
    lineHeight: 58,
    marginBottom: -2,
  },
  posterText: { color: colors.textPrimary, fontFamily: fonts.bold },
  soundChip: {
    position: 'absolute',
    right: 12,
    bottom: 12,
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: withAlpha('#000000', 0.55),
  },
  bigHeartOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },

  captionText: {
    color: colors.textSecondary,
    fontSize: 13.5,
    lineHeight: 18.5,
    fontFamily: fonts.medium,
    paddingHorizontal: 16,
    paddingTop: 10,
  },

  actions: {
    height: ACTIONS_H,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    gap: 18,
  },
  action: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  actionText: { color: colors.textSecondary, fontSize: 12.5, fontFamily: fonts.semibold },
  threadLink: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  threadLinkText: { color: colors.textSecondary, fontSize: 12.5, fontFamily: fonts.semibold },

  topBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    paddingBottom: 8,
  },
  closeBtn: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center' },
  topTitle: { color: colors.textPrimary, fontSize: 15, fontFamily: fonts.bold },

  survey: {
    position: 'absolute',
    left: 14,
    right: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  surveyQuestion: {
    flex: 1,
    color: colors.textPrimary,
    fontSize: 13.5,
    fontFamily: fonts.semibold,
  },
  surveyAck: { color: colors.textSecondary, fontSize: 13.5, fontFamily: fonts.medium },
  surveyButtons: { flexDirection: 'row', gap: 8 },
  surveyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceAlt,
  },
  surveyBtnYes: { backgroundColor: colors.accent },
  surveyBtnText: { color: colors.textSecondary, fontSize: 12.5, fontFamily: fonts.semibold },
  surveyBtnTextYes: { color: colors.white },

  loadingPill: {
    position: 'absolute',
    alignSelf: 'center',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
  },
  loadingPillText: { color: colors.textSecondary, fontSize: 12, fontFamily: fonts.medium },
});
