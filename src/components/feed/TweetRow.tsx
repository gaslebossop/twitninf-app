import React, { memo, useCallback, useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Pressable,
  StyleSheet,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  interpolate,
  Extrapolation,
  LinearTransition,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Avatar from '../Avatar';
import ClickableMentions from '../ClickableMentions';
import TweetLanguageSwitcher from '../TweetLanguageSwitcher';
import TranslationReveal from '../TranslationReveal';
import { useTweetAutoTranslation } from '../../contexts/ReadingLanguageContext';
import VerifiedBadge from '../VerifiedBadge';
import PremiumDisplayName from '../PremiumDisplayName';
import { STORY_GRADIENT } from '../StoryRing';
import PaidContentLock from '../PaidContentLock';
import LockedText from '../LockedText';
import { certifiedNameColors, type ProfileCustomization } from '../../services/profileCustomizationService';
import { colors } from '../../theme';
import ReactionBurst, {
  useReactionAnimation,
  LIKE_PALETTE,
  RETWEET_PALETTE,
} from './ReactionBurst';
import type { Tweet } from '../../types/api';
import { toast } from '../ui/Toast';
import feedback from '../../utils/feedback';
import { useFlag } from '../../contexts/FeatureFlagContext';
import { FLAGS } from '../../config/featureFlagKeys';

/** Anneau « déjà vu » : gris neutre, comme dans la barre de stories. */
const SEEN_STORY_RING = ['#3A3A3A', '#3A3A3A'] as const;

const C = {
  border: colors.border,
  accent: colors.accent,
  green: colors.success,
  like: colors.like,
  textPrimary: colors.textPrimary,
  textSecondary: colors.textSecondary,
  textMuted: colors.textMuted,
  white: colors.white,
};

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export interface TweetRowAction {
  type: 'like' | 'retweet' | 'reply' | 'share' | 'options' | 'open' | 'profile' | 'openQuote' | 'report';
  tweetId: string;
  payload?: any;
}

export interface TweetRowProps {
  tweet: Tweet;
  index: number;
  isThreadParent: boolean;
  isThreadChild: boolean;
  /** Handler unique et stable : évite N closures par ligne et par rendu. */
  onAction: (action: TweetRowAction) => void;
  contextData: { tab: string; algorithm: string };
  /** Auteurs ayant une story active (non expirée), pour l'anneau de l'avatar. */
  storyUserIds?: Set<string>;
  unseenStoryUserIds?: Set<string>;
}

function fmtCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1000).toFixed(1)}k`;
  return String(n || '');
}

function fmtDate(d: string): string {
  const diff = Date.now() - new Date(d).getTime();
  if (diff < 60000) return `${Math.floor(diff / 1000)}s`;
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h`;
  return new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
}

const DOUBLE_TAP_MS = 280;

/**
 * Une ligne du fil.
 *
 * Points essentiels pour la fluidité :
 *  - le composant est mémoïsé, avec un comparateur qui ne regarde que ce qui
 *    change réellement (compteurs, interactions, expansion) ;
 *  - toutes les animations sont locales et pilotées par Reanimated sur le
 *    thread UI : un like n'entraîne plus aucun rendu React du fil ;
 *  - l'état de troncature est local, alors qu'il vivait auparavant dans l'écran
 *    et provoquait un rendu complet de la liste par tweet au premier affichage.
 */
function TweetRow({
  tweet,
  index,
  isThreadParent,
  isThreadChild,
  onAction,
  contextData,
  storyUserIds,
  unseenStoryUserIds,
}: TweetRowProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isTruncated, setIsTruncated] = useState<boolean | undefined>(undefined);

  /**
   * ⏳ ESSAI EN COURS — signalement en un geste depuis le fil.
   *
   * Le drapeau se lit par un contexte, donc il traverse la mémoïsation de la
   * ligne : un changement de palier rafraîchit le fil sans qu'on ait à
   * remonter le drapeau en props depuis l'écran.
   *
   * À retirer avec le bouton plus bas quand l'essai sera tranché.
   */
  const showQuickReport = useFlag(FLAGS.QUICK_REPORT);

  // ── Valeurs d'animation : thread UI, jamais dans le state React ────────────
  const like = useReactionAnimation();
  const retweet = useReactionAnimation(true);
  const bigHeart = useSharedValue(0);
  const pressed = useSharedValue(0);

  const lastTapRef = useRef(0);
  const navTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const blockPressUntilRef = useRef(0);

  const isAd = !!(tweet as any).is_ad;
  const isRetweet = !!((tweet as any).is_retweet || (tweet as any).tweet_type === 'retweet');
  const isQuote = !!((tweet as any).is_quote || (tweet as any).tweet_type === 'quote');
  const originalTweet = (tweet as any)?.originalTweet || null;
  const retweeter = tweet.author;

  const displayAuthor = isRetweet && originalTweet?.author ? originalTweet.author : tweet.author;
  const displayAuthorId = displayAuthor?.id ? String(displayAuthor.id) : '';
  // L'anneau reflète une story ACTIVE (non expirée), jamais le badge vérifié :
  // un compte vérifié de longue date n'a pas forcément posté une story aujourd'hui.
  const hasActiveStory = !!displayAuthorId && !!storyUserIds?.has(displayAuthorId);
  const storySeen = hasActiveStory && !unseenStoryUserIds?.has(displayAuthorId);
  // Accorde la pastille de certif au nom habillé — même source que sur le profil,
  // sinon la pastille reste bleue par défaut pendant que le nom prend l'accent choisi.
  const displayBadgeTint = certifiedNameColors(
    (displayAuthor as any)?.verification_style,
    (displayAuthor as any)?.profile_customization as ProfileCustomization | undefined,
  ).from;
  const sourceContent = isRetweet && originalTweet?.content ? originalTweet.content : tweet.content;
  const displayMentions = isRetweet && originalTweet?.mentions ? originalTweet.mentions : tweet.mentions;

  /**
   * « Traduction (bêta) » dans le fil.
   *
   * Sur un retweet pur, c'est le tweet d'origine qui porte l'option ET les
   * traductions (même règle que côté API) : viser la ligne du retweet ne
   * trouverait jamais rien.
   */
  const translationSource = isRetweet && originalTweet ? originalTweet : tweet;
  const {
    active: activeTranslation,
    setActive: setActiveTranslation,
    displayedContent,
  } = useTweetAutoTranslation({
    id: String(translationSource?.id || tweet.id),
    content: sourceContent,
    translation_enabled: !!(translationSource as any)?.translation_enabled,
  });
  const displayContent = displayedContent || sourceContent;

  /**
   * Contenu payant — lu sur la MÊME source que le texte affiché.
   *
   * Sur un retweet, le texte vient du tweet d'origine : c'est donc lui qui
   * porte le verrou. Le lire sur la ligne du retweet laissait le brouillage à
   * l'écran sans rien à acheter.
   */
  const contentLock = (isRetweet && originalTweet
    ? (originalTweet as any).paid_content
    : (tweet as any).paid_content) || null;
  const isContentLocked = !!contentLock && !contentLock.has_access;
  // Sans aperçu écrit par le créateur, le serveur renvoie un brouillage : il
  // se floute. Un aperçu rédigé, lui, est une accroche — il se lit.
  const isScrambled = isContentLocked && !contentLock.preview_text;
  const displayCreatedAt =
    isRetweet && (originalTweet?.created_at || originalTweet?.createdAt)
      ? originalTweet.created_at || originalTweet.createdAt
      : tweet.created_at || (tweet as any).createdAt;

  const isLiked = !!tweet.user_interaction?.is_liked;
  const isRetweeted = !!tweet.user_interaction?.is_retweeted;

  // ── Animations ────────────────────────────────────────────────────────────
  /** @param wasLiked état AVANT le geste. */
  const playLike = useCallback(
    (wasLiked: boolean) => {
      like.play(!wasLiked);
    },
    [like]
  );

  const playBigHeart = useCallback(() => {
    bigHeart.value = 0;
    bigHeart.value = withTiming(1, { duration: 900 });
  }, [bigHeart]);

  const bigHeartStyle = useAnimatedStyle(() => ({
    opacity: interpolate(bigHeart.value, [0, 0.12, 0.7, 1], [0, 0.95, 0.9, 0], Extrapolation.CLAMP),
    transform: [
      {
        scale: interpolate(
          bigHeart.value,
          [0, 0.15, 0.3, 0.6, 1],
          [0.2, 1.22, 0.95, 1.02, 0.7],
          Extrapolation.CLAMP
        ),
      },
    ],
  }));

  const rowStyle = useAnimatedStyle(() => ({
    opacity: interpolate(pressed.value, [0, 1], [1, 0.92]),
    transform: [{ scale: interpolate(pressed.value, [0, 1], [1, 0.994]) }],
  }));

  // ── Interactions ──────────────────────────────────────────────────────────
  const blockRowPress = useCallback((ms = 380) => {
    blockPressUntilRef.current = Date.now() + ms;
  }, []);

  /**
   * Interactions sur un contenu payant non acheté.
   *
   * Le serveur les refuse (403) : aimer, retweeter ou répondre à un texte
   * qu'on n'a pas lu n'a pas de sens, et un retweet le republierait. On ne
   * laisse donc pas le geste partir pour revenir en erreur — on dit
   * pourquoi, et l'animation ne se joue pas dans le vide.
   */
  const refuseLocked = useCallback(() => {
    blockRowPress();
    // Vibration de refus AVANT le message : le doigt sait déjà que le geste
    // n'est pas passé, avant même que l'oeil ne remonte vers le toast.
    feedback.refuse();
    toast.info('Contenu réservé', {
      description: `Débloque ce contenu pour ${contentLock?.price_twc ?? ''} NF avant d'interagir avec lui.`.replace('  ', ' '),
    });
  }, [blockRowPress, contentLock]);

  const handleLikePress = useCallback(() => {
    if (isContentLocked) return refuseLocked();
    blockRowPress();
    // Uniquement à l'ajout du like : vibrer aussi au retrait ferait du bruit
    // sur un geste correctif, et le geste le plus fréquent du fil doit rester
    // discret.
    if (!isLiked) feedback.tap();
    playLike(isLiked);
    onAction({ type: 'like', tweetId: tweet.id });
  }, [isContentLocked, refuseLocked, blockRowPress, playLike, isLiked, onAction, tweet.id]);

  const handleRetweetPress = useCallback(() => {
    if (isContentLocked) return refuseLocked();
    blockRowPress();
    if (!isRetweeted) feedback.tap();
    retweet.play(!isRetweeted);
    onAction({ type: 'retweet', tweetId: tweet.id });
  }, [isContentLocked, refuseLocked, blockRowPress, retweet, isRetweeted, onAction, tweet.id]);

  const handleRowPress = useCallback(() => {
    if (isAd) {
      onAction({ type: 'open', tweetId: tweet.id, payload: { isAd: true, tweet } });
      return;
    }
    if (Date.now() < blockPressUntilRef.current) return;

    const now = Date.now();
    const isDoubleTap = now - lastTapRef.current < DOUBLE_TAP_MS;
    lastTapRef.current = now;

    if (isDoubleTap) {
      if (navTimerRef.current) clearTimeout(navTimerRef.current);
      navTimerRef.current = null;
      // Le double-tap aime aussi : il tombe sous la même règle.
      if (isContentLocked) return;
      playBigHeart();
      if (!isLiked) {
        // Le double-tap est un geste sans cible visible : la vibration est le
        // seul accusé de réception immédiat avant que le coeur ne s'affiche.
        feedback.select();
        playLike(false);
        onAction({ type: 'like', tweetId: tweet.id });
      }
      return;
    }

    navTimerRef.current = setTimeout(() => {
      navTimerRef.current = null;
      onAction({ type: 'open', tweetId: tweet.id });
    }, 260);
  }, [isAd, isLiked, onAction, playBigHeart, playLike, tweet]);

  // `LayoutAnimation` est peu fiable sous la New Architecture (activée ici) :
  // on s'appuie sur l'animation de layout de Reanimated, appliquée à la vue.
  const handleToggleExpand = useCallback(() => {
    setIsExpanded((v) => !v);
  }, []);

  const handleTextLayout = useCallback((e: any) => {
    setIsTruncated((e?.nativeEvent?.lines?.length ?? 0) > 4);
  }, []);

  // La traduction arrive après le premier rendu et n'a pas la même longueur
  // que l'original : sans remesure, « Voir plus » resterait calé sur le texte
  // précédent (absent sur un texte devenu long, ou affiché à tort).
  React.useEffect(() => {
    setIsTruncated(undefined);
  }, [displayContent]);

  React.useEffect(() => {
    return () => {
      if (navTimerRef.current) clearTimeout(navTimerRef.current);
    };
  }, []);

  if (!tweet?.id || !tweet.content) return null;

  return (
    <View>
      <AnimatedPressable
        layout={LinearTransition.duration(180)}
        style={[S.tweetRow, isAd && S.tweetRowAd, rowStyle]}
        onPressIn={() => { pressed.value = withTiming(1, { duration: 90 }); }}
        onPressOut={() => { pressed.value = withTiming(0, { duration: 140 }); }}
        onPress={handleRowPress}
      >
        {/* Cœur plein écran du double-tap */}
        <Animated.View pointerEvents="none" style={[S.bigHeartOverlay, bigHeartStyle]}>
          <Ionicons name="heart" size={90} color={C.white} />
        </Animated.View>

        {isRetweet && retweeter?.username && (
          <View style={S.retweetLabel}>
            <Ionicons name="repeat" size={13} color={C.textSecondary} />
            <Text style={S.retweetLabelText}>@{retweeter.username} a retweeté</Text>
          </View>
        )}

        {isAd && (
          <View style={S.adLabel}>
            <Ionicons name="sparkles" size={12} color="#1a1303" />
            <Text style={S.adLabelText}>Sponsorisé</Text>
          </View>
        )}

        <View style={S.tweetInner}>
          <View style={S.avatarCol}>
            <TouchableOpacity
              onPress={() =>
                onAction({
                  type: 'profile',
                  tweetId: tweet.id,
                  payload: { author: displayAuthor, index },
                })
              }
              style={hasActiveStory ? S.avatarStoryRing : undefined}
            >
              {hasActiveStory ? (
                <LinearGradient
                  colors={(storySeen ? SEEN_STORY_RING : STORY_GRADIENT) as unknown as [string, string, ...string[]]}
                  start={{ x: 0.85, y: 0.05 }}
                  end={{ x: 0.15, y: 0.95 }}
                  style={S.avatarStoryGradient}
                >
                  <View style={S.avatarStoryGap}>
                    <Avatar size={38} username={displayAuthor?.username || 'U'} uri={(displayAuthor as any)?.avatar} />
                  </View>
                </LinearGradient>
              ) : (
                <Avatar size={44} username={displayAuthor?.username || 'U'} uri={(displayAuthor as any)?.avatar} />
              )}
            </TouchableOpacity>
            {isThreadParent && <View style={S.threadLine} />}
            {isThreadChild && <View style={S.threadLineTop} />}
          </View>

          <View style={S.contentCol}>
            <View style={S.authorRow}>
              <PremiumDisplayName
                text={displayAuthor?.full_name || 'Utilisateur'}
                baseStyle={S.authorName}
                isPremium={!!(displayAuthor as any)?.premium}
                subscriptionTierRaw={(displayAuthor as any)?.subscription_tier}
                fontId="system"
                effectId="none"
                numberOfLines={1}
                customization={(displayAuthor as any)?.profile_customization as ProfileCustomization | undefined}
                verified={!!(displayAuthor as any)?.verified}
                verificationStyle={(displayAuthor as any)?.verification_style || 'default'}
              />
              {(displayAuthor as any)?.verified && (
                <View style={S.verifiedWrap}>
                  {/* `animated={false}` dans le fil : chaque badge animé lançait
                      3 à 4 boucles infinies qui ne s'arrêtaient jamais. */}
                  <VerifiedBadge
                    verificationStyle={(displayAuthor as any)?.verification_style || 'default'}
                    size={14}
                    animated={false}
                    tint={displayBadgeTint}
                  />
                </View>
              )}
              <Text style={S.authorHandle} numberOfLines={1}>@{displayAuthor?.username}</Text>
              <Text style={S.dot}>·</Text>
              <Text style={S.timestamp}>{fmtDate(displayCreatedAt || new Date().toISOString())}</Text>
            </View>

            {isScrambled ? (
              <LockedText
                text={displayContent}
                style={S.tweetText}
                numberOfLines={isExpanded ? undefined : 4}
                price={contentLock?.price_twc}
                compact
              />
            ) : (
              <TranslationReveal
                tweetId={String(translationSource?.id || tweet.id)}
                language={activeTranslation?.language ?? null}
              >
                <ClickableMentions
                  text={displayContent}
                  mentions={displayMentions}
                  style={S.tweetText}
                  numberOfLines={isExpanded ? undefined : 4}
                  tweetId={String(tweet.id)}
                  contextData={{ ...contextData, position: index, author_id: displayAuthor?.id }}
                />
              </TranslationReveal>
            )}

            {/* Mesure de troncature : une seule fois par ligne, en local. */}
            {isTruncated === undefined && (
              <Text
                style={[S.tweetText, S.hiddenMeasure]}
                onTextLayout={handleTextLayout}
                accessibilityElementsHidden
                importantForAccessibility="no-hide-descendants"
              >
                {displayContent}
              </Text>
            )}

            {isTruncated && (
              <TouchableOpacity style={S.seeMoreBtn} onPress={handleToggleExpand} activeOpacity={0.7}>
                <Text style={S.seeMoreText}>{isExpanded ? 'Voir moins' : 'Voir plus'}</Text>
              </TouchableOpacity>
            )}

            {/* Sélecteur de langue — uniquement sur les tweets publiés avec l'option */}
            {!!(translationSource as any)?.translation_enabled && (
              <TweetLanguageSwitcher
                tweetId={String(translationSource?.id || tweet.id)}
                active={activeTranslation as any}
                onSelect={setActiveTranslation}
              />
            )}

            {/* Contenu payant : le texte affiché plus haut n'est déjà qu'un
                aperçu envoyé par le serveur — le reste n'a jamais été
                téléchargé. Le verrou propose de l'acheter, il ne masque rien. */}
            {isContentLocked && (
              <PaidContentLock
                lock={contentLock}
                compact
                // Après l'achat, on ouvre le tweet : c'est là que le serveur
                // renverra le contenu complet, désormais accessible.
                onUnlocked={() => onAction({ type: 'open', tweetId: tweet.id })}
              />
            )}

            {isQuote && originalTweet && (
              <TouchableOpacity
                activeOpacity={0.85}
                style={S.quoteTweet}
                onPress={() => onAction({ type: 'openQuote', tweetId: originalTweet.id })}
              >
                <View style={S.quoteAuthorRow}>
                  <Avatar size={18} username={originalTweet.author?.username || 'U'} uri={originalTweet.author?.avatar} />
                  <PremiumDisplayName
                    text={originalTweet.author?.full_name || 'Utilisateur'}
                    baseStyle={S.quoteAuthorName}
                    isPremium={!!(originalTweet.author as any)?.premium}
                    subscriptionTierRaw={(originalTweet.author as any)?.subscription_tier}
                    fontId="system"
                    effectId="none"
                    numberOfLines={1}
                    customization={(originalTweet.author as any)?.profile_customization as ProfileCustomization | undefined}
                    verified={!!originalTweet.author?.verified}
                    verificationStyle={(originalTweet.author?.verification_style as any) || 'default'}
                  />
                  {originalTweet.author?.verified && (
                    <VerifiedBadge
                      verificationStyle={originalTweet.author?.verification_style || 'default'}
                      size={12}
                      animated={false}
                      tint={
                        certifiedNameColors(
                          originalTweet.author?.verification_style,
                          (originalTweet.author as any)?.profile_customization as ProfileCustomization | undefined,
                        ).from
                      }
                    />
                  )}
                  <Text style={S.quoteAuthorHandle}>@{originalTweet.author?.username}</Text>
                </View>
                <Text style={S.quoteText} numberOfLines={3}>{originalTweet.content}</Text>
              </TouchableOpacity>
            )}

            <View style={S.actions}>
              <TouchableOpacity
                style={S.actionChip}
                onPress={() => {
                  if (isContentLocked) return refuseLocked();
                  blockRowPress();
                  onAction({ type: 'reply', tweetId: tweet.id });
                }}
                disabled={isAd}
                activeOpacity={0.7}
              >
                <Ionicons name="chatbubble-outline" size={16} color={C.textMuted} />
                {!isAd && <Text style={S.actionCount}>{fmtCount(tweet.stats?.replies || 0)}</Text>}
              </TouchableOpacity>

              <TouchableOpacity
                style={[S.actionChip, S.burstAnchorBtn, isRetweeted && S.actionChipRetweetActive]}
                onPress={handleRetweetPress}
                disabled={isAd}
                activeOpacity={0.7}
              >
                <View style={S.burstHost}>
                  <ReactionBurst progress={retweet.progress} palette={RETWEET_PALETTE} iconSize={16} />
                  <Animated.View style={retweet.iconStyle}>
                    <Ionicons
                      name={isRetweeted ? 'repeat' : 'repeat-outline'}
                      size={16}
                      color={isRetweeted ? C.green : C.textMuted}
                    />
                  </Animated.View>
                </View>
                {!isAd && (
                  <Text style={[S.actionCount, isRetweeted && S.countRetweeted]}>
                    {fmtCount(tweet.stats?.retweets || 0)}
                  </Text>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={[S.actionChip, S.burstAnchorBtn, isLiked && S.actionChipLikeActive]}
                onPress={handleLikePress}
                disabled={isAd}
                activeOpacity={0.7}
              >
                <View style={S.burstHost}>
                  <ReactionBurst progress={like.progress} palette={LIKE_PALETTE} iconSize={16} />
                  <Animated.View style={like.iconStyle}>
                    <Ionicons
                      name={isLiked ? 'heart' : 'heart-outline'}
                      size={16}
                      color={isLiked ? C.like : C.textMuted}
                    />
                  </Animated.View>
                </View>
                {!isAd && (
                  <Text style={[S.actionCount, isLiked && S.countLiked]}>
                    {fmtCount(tweet.stats?.likes || 0)}
                  </Text>
                )}
              </TouchableOpacity>

              <View style={S.actionChipStatic}>
                <Ionicons name="bar-chart-outline" size={16} color={C.textMuted} />
                {!isAd && <Text style={S.actionCount}>{fmtCount(tweet.stats?.views || 0)}</Text>}
              </View>

              <TouchableOpacity
                style={S.actionIconOnly}
                onPress={() => { blockRowPress(); onAction({ type: 'share', tweetId: tweet.id }); }}
                disabled={isAd}
                activeOpacity={0.7}
              >
                <Ionicons name="share-outline" size={16} color={C.textMuted} />
              </TouchableOpacity>

              {/* ⏳ ESSAI — signalement en un geste, sous drapeau `fil.test`.
                  Masqué sur les publicités : le parcours de signalement vise un
                  tweet, pas une campagne. À retirer avec le drapeau. */}
              {showQuickReport && !isAd && (
                <TouchableOpacity
                  style={S.actionIconOnly}
                  onPress={() => { blockRowPress(); onAction({ type: 'report', tweetId: tweet.id }); }}
                  activeOpacity={0.7}
                  hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
                  accessibilityLabel="Signaler ce tweet"
                >
                  <Ionicons name="flag-outline" size={16} color={C.textMuted} />
                </TouchableOpacity>
              )}

              <TouchableOpacity
                style={S.actionIconOnly}
                onPress={() => { blockRowPress(); onAction({ type: 'options', tweetId: tweet.id }); }}
                disabled={isAd}
                activeOpacity={0.7}
              >
                <Ionicons name="ellipsis-horizontal" size={16} color={C.textMuted} />
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </AnimatedPressable>

      <View style={S.separator} />
    </View>
  );
}

/**
 * Ne re-rend que si quelque chose de visible a changé. Sans ce comparateur,
 * un like re-rendait chaque ligne montée du fil.
 */
function areEqual(prev: TweetRowProps, next: TweetRowProps) {
  const a = prev.tweet;
  const b = next.tweet;
  return (
    a.id === b.id &&
    a.stats?.likes === b.stats?.likes &&
    a.stats?.retweets === b.stats?.retweets &&
    a.stats?.replies === b.stats?.replies &&
    a.stats?.views === b.stats?.views &&
    a.user_interaction?.is_liked === b.user_interaction?.is_liked &&
    a.user_interaction?.is_retweeted === b.user_interaction?.is_retweeted &&
    a.content === b.content &&
    prev.index === next.index &&
    prev.isThreadParent === next.isThreadParent &&
    prev.isThreadChild === next.isThreadChild &&
    prev.onAction === next.onAction &&
    prev.contextData === next.contextData &&
    prev.storyUserIds === next.storyUserIds &&
    prev.unseenStoryUserIds === next.unseenStoryUserIds
  );
}

export default memo(TweetRow, areEqual);

const S = StyleSheet.create({
  tweetRow: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 10,
    position: 'relative',
  },
  tweetRowAd: {
    backgroundColor: 'rgba(250, 204, 21, 0.04)',
  },
  bigHeartOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  retweetLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginLeft: 56,
    marginBottom: 6,
  },
  retweetLabelText: {
    color: C.textSecondary,
    fontSize: 12.5,
  },
  adLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
    marginLeft: 56,
    marginBottom: 6,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
    backgroundColor: colors.gold,
  },
  adLabelText: {
    color: '#1a1303',
    fontSize: 10.5,
    fontWeight: '700',
  },
  tweetInner: {
    flexDirection: 'row',
    gap: 12,
  },
  avatarCol: {
    alignItems: 'center',
  },
  avatarStoryRing: {
    width: 44,
    height: 44,
  },
  avatarStoryGradient: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarStoryGap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  threadLine: {
    flex: 1,
    width: 2,
    marginTop: 6,
    borderRadius: 1,
    backgroundColor: C.border,
  },
  threadLineTop: {
    position: 'absolute',
    top: -14,
    width: 2,
    height: 14,
    borderRadius: 1,
    backgroundColor: C.border,
  },
  contentCol: {
    flex: 1,
  },
  authorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 3,
  },
  authorName: {
    color: C.textPrimary,
    fontSize: 15,
    fontWeight: '700',
    flexShrink: 1,
  },
  verifiedWrap: {
    marginLeft: 1,
  },
  authorHandle: {
    color: C.textMuted,
    fontSize: 13.5,
    flexShrink: 1,
  },
  dot: {
    color: C.textMuted,
    fontSize: 13.5,
  },
  timestamp: {
    color: C.textMuted,
    fontSize: 13.5,
  },
  tweetText: {
    color: C.textPrimary,
    fontSize: 15,
    lineHeight: 21,
  },
  hiddenMeasure: {
    position: 'absolute',
    opacity: 0,
    left: 0,
    right: 0,
    zIndex: -1,
  },
  seeMoreBtn: {
    marginTop: 4,
    alignSelf: 'flex-start',
  },
  seeMoreText: {
    color: C.accent,
    fontSize: 13.5,
    fontWeight: '600',
  },
  quoteTweet: {
    marginTop: 10,
    padding: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.border,
  },
  quoteAuthorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginBottom: 4,
  },
  quoteAuthorName: {
    color: C.textPrimary,
    fontSize: 13,
    fontWeight: '700',
    flexShrink: 1,
  },
  quoteAuthorHandle: {
    color: C.textMuted,
    fontSize: 12,
    flexShrink: 1,
  },
  quoteText: {
    color: C.textSecondary,
    fontSize: 13.5,
    lineHeight: 19,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 10,
  },
  actionChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 999,
  },
  actionChipStatic: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  actionChipRetweetActive: {
    backgroundColor: 'rgba(34, 197, 94, 0.12)',
  },
  actionChipLikeActive: {
    backgroundColor: 'rgba(244, 63, 94, 0.12)',
  },
  // L'éclat déborde largement de la pastille : aucun `overflow: 'hidden'` ne
  // doit apparaître sur ce chemin, sinon les particules sont rognées.
  burstAnchorBtn: {
    position: 'relative',
    overflow: 'visible',
  },
  burstHost: {
    width: 16,
    height: 16,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'visible',
  },
  actionCount: {
    color: C.textMuted,
    fontSize: 12.5,
  },
  countLiked: {
    color: C.like,
  },
  countRetweeted: {
    color: C.green,
  },
  actionIconOnly: {
    paddingHorizontal: 7,
    paddingVertical: 5,
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: C.border,
    marginHorizontal: 16,
  },
});
