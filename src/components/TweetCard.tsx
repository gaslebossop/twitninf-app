import React, { useState, useRef, useMemo, useCallback, memo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Pressable,
  Dimensions,
  Animated,
  LayoutAnimation,
  Platform,
  UIManager,
  Share,
} from 'react-native';
import Reanimated from 'react-native-reanimated';
import Ionicons from '@expo/vector-icons/Ionicons';
import ReactionBurst, {
  useReactionAnimation,
  LIKE_PALETTE,
  RETWEET_PALETTE,
} from './feed/ReactionBurst';
import VerifiedBadge from './VerifiedBadge';
import PremiumDisplayName from './PremiumDisplayName';
import {
  certifiedNameColors,
  nameIsLit,
  type ProfileCustomization,
} from '../services/profileCustomizationService';
import IosNativeBadge from './IosNativeBadge';
import { useNavigation } from '@react-navigation/native';
import ClickableMentions from './ClickableMentions';
import PaidContentLock from './PaidContentLock';
import LockedText from './LockedText';
import TweetLanguageSwitcher from './TweetLanguageSwitcher';
import TranslationReveal from './TranslationReveal';
import Avatar from './Avatar';
import { Tweet } from '../types/api';
import { useTweetAutoTranslation } from '../contexts/ReadingLanguageContext';
import ModerationActions from './ModerationActions';
import { useAdminPermissions } from '../hooks/useAdminPermissions';
import { useEvents } from '../contexts/EventContext';
import { getEventTheme } from '../themes/eventThemes';
import trackingService from '../services/trackingService';
import { apiService } from '../services';
import { useAuth } from '../contexts/AuthContext';
import { colors, fonts } from '../theme';
import { sameAuthor } from '../utils/sameAuthor';
import { toast } from './ui/Toast';
import { confirmAsync } from './ui/ConfirmSheet';
import { showActionSheet, type ActionSheetItem } from './ui/ActionSheet';

interface TweetCardProps {
  tweet: Tweet;
  onLike?: (tweetId: string) => void;
  onRetweet?: (tweetId: string) => void;
  onReply?: (tweetId: string) => void;
  onShare?: (tweetId: string) => void;
  onBookmark?: (tweetId: string) => void;
  onSkip?: (tweetId: string) => void;
  onBlock?: (userId: string) => void;
  onDelete?: (tweetId: string) => void;
  compact?: boolean;
}

const { width } = Dimensions.get('window');

/**
 * Formatage hors du composant : recréer ces fonctions à chaque rendu ne coûte
 * rien en soi, mais `toLocaleDateString` en coûte beaucoup, et une carte
 * montée cinquante fois le payait cinquante fois par rendu.
 */
const formatNumber = (num: number) => {
  if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
  if (num >= 1000) return `${(num / 1000).toFixed(1)}k`;
  return num.toString();
};

const formatDate = (dateString: string) => {
  const date = new Date(dateString);
  const now = new Date();
  const diffInHours = (now.getTime() - date.getTime()) / (1000 * 60 * 60);

  if (diffInHours < 1) return 'À l\'instant';
  if (diffInHours < 24) return `${Math.floor(diffInHours)}h`;
  if (diffInHours < 168) return `${Math.floor(diffInHours / 24)}j`;
  return date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
};

function TweetCard({
  tweet,
  onLike,
  onRetweet,
  onReply,
  onShare,
  onBookmark,
  onSkip,
  onBlock,
  onDelete,
  compact = false,
}: TweetCardProps) {
  const navigation = useNavigation();
  const { user: currentUser } = useAuth();
  const [isExpanded, setIsExpanded] = useState(false);
  const [isTruncated, setIsTruncated] = useState(false);
  const [showOptionsMenu, setShowOptionsMenu] = useState(false);
  const isOwnTweet = !!(currentUser?.id && tweet.author?.id === currentUser.id);

  // Etat de favori connu cette session (le serveur ne renvoie pas encore
  // `is_bookmarked` sur un tweet du fil) + verrou anti-double-appel : un
  // second appui pendant l'aller-retour réseau annulait le premier
  // (create puis destroy à quelques ms d'écart) au lieu de le confirmer.
  const [bookmarked, setBookmarked] = useState(false);
  const bookmarkInFlightRef = useRef(false);

  /**
   * « Traduction (bêta) » : le tweet s'affiche d'emblée dans la langue de
   * lecture du compte, et le sélecteur permet d'en changer ponctuellement.
   */
  const {
    active: activeTranslation,
    setActive: setActiveTranslation,
    displayedContent,
  } = useTweetAutoTranslation(tweet);

  /**
   * Contenu payant. `content` ne contient déjà que l'aperçu renvoyé par le
   * serveur : sans aperçu rédigé par le créateur, c'est un brouillage, qui se
   * floute pour ne pas passer pour un bug d'affichage.
   */
  const contentLock = (tweet as any).paid_content || null;
  const isContentLocked = !!contentLock && !contentLock.has_access;
  const isScrambled = isContentLocked && !contentLock.preview_text;

  const { isModerator, canModerateContent, canDeleteTweets } = useAdminPermissions();
  const { activeEvent, hasActiveEvent } = useEvents();
  
  // Obtenir le thème de l'événement actif
  const eventTheme = activeEvent?.theme_id ? getEventTheme(activeEvent.theme_id) : null;

  /**
   * Accord nom ↔ pastille dans le fil, à partir de la personnalisation que
   * l'API livre désormais avec l'auteur. Un thème d'événement reprend la main :
   * il habille tout le fil, la personnalisation d'un compte ne doit pas le
   * percer.
   */
  const feedBadge = (() => {
    const authorCustomization =
      hasActiveEvent && eventTheme
        ? undefined
        : ((tweet.author as any)?.profile_customization as ProfileCustomization | undefined);
    return {
      tint: certifiedNameColors(tweet.author?.verification_style as any, authorCustomization).from,
      lit: nameIsLit(authorCustomization),
    };
  })();

  // Animations — cœur et retweet passent par le même éclat que dans le fil.
  /**
   * L'éclat de réaction n'est MONTÉ qu'une fois qu'un doigt s'est posé —
   * jamais au repos. Même correctif que `feed/TweetRow` et
   * `paper2b/TweetRowGutter`, pour la même raison : cette carte sert aussi de
   * ligne de liste (profil), et ses deux `ReactionBurst` valent ~22 vues
   * animées à opacité 0 par carte montée. Voir `docs/2B-FLUIDITE-RENDU.md`.
   */
  const [burstArmed, setBurstArmed] = useState(false);
  const armBurst = useCallback(() => setBurstArmed(true), []);

  const like = useReactionAnimation();
  const retweet = useReactionAnimation(true);
  const scaleAnim = useRef(new Animated.Value(1)).current;

  // Active les animations de layout sur Android
  React.useEffect(() => {
    if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
      UIManager.setLayoutAnimationEnabledExperimental(true);
    }
  }, []);

  // 📊 Track tweet view quand le composant est monté
  React.useEffect(() => {
    trackingService.trackView(tweet.id);
  }, [tweet.id]);

  const handleLike = () => {
    if (onLike) {
      // `play` reçoit l'état d'APRÈS le geste : l'éclat complet n'est joué
      // qu'à l'ajout du like, le retrait se contente d'un rebond.
      like.play(!tweet.user_interaction?.is_liked);

      // 📊 Track like
      trackingService.trackLike(tweet.id);
      onLike(tweet.id);
    }
  };

  const handleRetweet = () => {
    if (onRetweet) {
      retweet.play(!tweet.user_interaction?.is_retweeted);

      // 📊 Track retweet
      trackingService.trackRetweet(tweet.id);
      onRetweet(tweet.id);
    }
  };

  const handleReply = () => {
    if (onReply) {
      // 📊 Track comment
      trackingService.trackComment(tweet.id);
      onReply(tweet.id);
    }
  };

  // `onShare`/`onBookmark` restent facultatifs : ils ne servent plus qu'à
  // prévenir l'écran pour sa propre tenue de liste (ex. retirer une carte).
  // L'action réelle, elle, ne dépend plus de ce que l'écran a branché — sinon
  // ProfileScreen/SearchScreen, qui ne passaient rien, rendaient ces boutons
  // décoratifs : le partage n'ouvrait aucune feuille, le favori ne
  // persistait rien.
  const handleShare = async () => {
    trackingService.trackShare(tweet.id);
    const response = await apiService.shareTweet(tweet.id);
    if (response.success && response.data?.share_link) {
      try {
        await Share.share({ message: response.data.share_link, url: response.data.share_link });
      } catch {
        // Feuille de partage annulée — rien à signaler.
      }
    } else {
      toast.error(response.message || 'Impossible de partager ce tweet');
    }
    onShare?.(tweet.id);
  };

  const handleBookmark = async () => {
    if (bookmarkInFlightRef.current) return;
    bookmarkInFlightRef.current = true;
    try {
      trackingService.trackBookmark(tweet.id);
      const response = await apiService.bookmarkTweet(tweet.id);
      if (response.success) {
        setBookmarked(!!response.data?.bookmarked);
        toast.success(response.data?.bookmarked ? 'Ajouté aux favoris' : 'Retiré des favoris');
      } else {
        toast.error(response.message || 'Impossible de mettre ce tweet en favori');
      }
    } finally {
      bookmarkInFlightRef.current = false;
    }
    onBookmark?.(tweet.id);
  };

  const handleSkip = () => {
    if (onSkip) {
      // 📊 Track skip
      trackingService.trackSkip(tweet.id);
      onSkip(tweet.id);
    } else {
      // Fallback action
      trackingService.trackSkip(tweet.id);
      toast.info('Tweet ignoré', {
        description: 'Ce tweet n\'apparaîtra plus',
      });
    }
  };

  const handleBlock = () => {
    if (!tweet.author?.id) return;
    const author = tweet.author;
    confirmAsync({
      title: `Bloquer @${author.username} ?`,
      message: 'Il ne pourra plus vous contacter ni voir votre profil, et ses tweets disparaîtront de votre fil.',
      confirmLabel: 'Bloquer',
      icon: 'ban-outline',
      destructive: true,
    }).then(async (ok) => {
      if (!ok) return;
      trackingService.trackBlock(author.id);
      const response = await apiService.blockUser(author.id);
      if (response.success) {
        toast.success(`@${author.username} a été bloqué`);
        onBlock?.(author.id);
      } else {
        toast.error(response.message || 'Impossible de bloquer ce compte');
      }
    });
  };

  const handleTweetPress = () => {
    // Navigation vers le détail du tweet
    (navigation as any).navigate('TweetDetail', {
      tweetId: tweet.id,
      tweet: tweet,
      // Permet au detail d'afficher le bon squelette des la premiere frame,
      // avant meme d'avoir recu la conversation.
      isThread: !!(tweet as any).parent_tweet_id,
    });
  };

  const handleDeleteTweet = () => {
    confirmAsync({
      title: 'Supprimer ce tweet ?',
      message: 'Cette action est irréversible.',
      confirmLabel: 'Supprimer',
      destructive: true,
    }).then((ok) => {
      if (ok) (async () => {
            const response = await apiService.deleteTweet(tweet.id);
            if (response?.success) {
              onDelete?.(tweet.id);
            } else {
              toast.error(response?.message || 'Impossible de supprimer ce tweet');
            }
          })();
    });
  };

  const handleOptionsMenu = () => {
    // Se bloquer/s'ignorer/se signaler soi-même n'a pas de sens : sur son
    // propre tweet, le menu ne propose que ce qui reste pertinent.
    const entries: ActionSheetItem[] = isOwnTweet
      ? [
          {
            label: bookmarked ? 'Retirer des favoris' : 'Ajouter aux favoris',
            icon: bookmarked ? 'bookmark' : 'bookmark-outline',
            onPress: handleBookmark,
          },
          { label: 'Supprimer', icon: 'trash-outline', onPress: handleDeleteTweet, destructive: true },
        ]
      : [
          {
            label: bookmarked ? 'Retirer des favoris' : 'Ajouter aux favoris',
            icon: bookmarked ? 'bookmark' : 'bookmark-outline',
            onPress: handleBookmark,
          },
          {
            label: 'Ignorer ce tweet',
            icon: 'eye-off-outline',
            hint: 'Il n’apparaîtra plus dans ton fil',
            onPress: handleSkip,
          },
          {
            label: 'Bloquer cet utilisateur',
            icon: 'ban-outline',
            onPress: handleBlock,
            destructive: true,
          },
        ];

    // Même feuille sur iOS et Android — voir `components/ui/ActionSheet`.
    showActionSheet({ items: entries });
  };

  const handleUserPress = () => {
    if (tweet.author?.id) {
      (navigation as any).navigate('UserProfile', {
        userId: tweet.author.id,
        username: tweet.author.username
      });
    }
  };

  const toggleExpanded = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setIsExpanded(!isExpanded);
  };

  // Le libellé ne dépend que de la date de publication : inutile de le
  // recalculer quand un compteur bouge.
  const dateLabel = useMemo(
    () => formatDate(tweet.created_at || (tweet as any).createdAt || ''),
    [tweet.created_at, (tweet as any).createdAt],
  );

  return (
    <Pressable
      style={({ pressed }) => [
        styles.container, 
        compact && styles.compactContainer,
        // L'ombre portée reste sur iOS et disparaît d'Android. `elevation` sur
        // les lignes d'une liste qui défile y est l'un des coûts de composition
        // les plus classiques : le système recalcule une ombre par ligne et par
        // image, et `TweetCard` est ce qui rend toute la liste de ProfileScreen.
        // Le profil défilait donc moins bien PENDANT un événement que le reste
        // du temps — une dégradation intermittente, difficile à relier à sa
        // cause. La bordure teintée juste au-dessus suffit à marquer le thème.
        hasActiveEvent && eventTheme && {
          backgroundColor: eventTheme.colors.surface,
          borderColor: eventTheme.colors.border,
          borderWidth: 1,
          ...(Platform.OS === 'ios'
            ? {
                shadowColor: eventTheme.colors.shadow,
                shadowOffset: { width: 0, height: 4 },
                shadowOpacity: 0.3,
                shadowRadius: 8,
              }
            : null),
        },
        pressed && { opacity: 0.95 },
      ]}
      onPress={handleTweetPress}
      onLongPress={() => {
        Animated.sequence([
          Animated.timing(scaleAnim, { toValue: 0.95, duration: 100, useNativeDriver: true }),
          Animated.timing(scaleAnim, { toValue: 1, duration: 100, useNativeDriver: true }),
        ]).start();
      }}
    >
      <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
        {/* Fond avec couleur solide */}
        <View
          style={[
            styles.background,
            hasActiveEvent && eventTheme
              ? { backgroundColor: eventTheme.colors.primary }
              : { backgroundColor: colors.overlayMedium }
          ]}
        />
        
        {/* Contenu principal */}
        <View style={styles.content}>
          {/* En-tête du tweet */}
          <View style={styles.header}>
            <TouchableOpacity 
              style={styles.userInfo}
              onPress={handleUserPress}
              activeOpacity={0.7}
            >
              <Avatar 
                size={compact ? 36 : 44} 
                username={tweet.author?.username || 'U'} 
                uri={tweet.author?.avatar}
                style={[
                  styles.avatar,
                  hasActiveEvent && eventTheme && {
                    borderColor: eventTheme.colors.accent,
                    borderWidth: 2,
                  }
                ]}
              />
              
              <View style={styles.userDetails}>
                <View style={styles.nameRow}>
                  {/* L'habillage d'un compte le suit dans le fil : il ne
                      s'arrête pas à sa page de profil. Un thème d'événement, lui,
                      reprend la main — c'est un habillage global assumé. */}
                  <PremiumDisplayName
                    text={tweet.author?.full_name || 'Utilisateur'}
                    baseStyle={{
                      ...styles.displayName,
                      ...(hasActiveEvent && eventTheme ? { color: eventTheme.colors.text } : null),
                    }}
                    isPremium={!!tweet.author?.premium}
                    subscriptionTierRaw={(tweet.author as any)?.subscription_tier}
                    fontId="system"
                    effectId="none"
                    numberOfLines={1}
                    customization={
                      hasActiveEvent && eventTheme
                        ? undefined
                        : ((tweet.author as any)?.profile_customization as ProfileCustomization | undefined)
                    }
                    verified={!!tweet.author?.verified}
                    verificationStyle={(tweet.author?.verification_style as any) || 'default'}
                  />
                  {tweet.author?.verified && (
                    <View style={{ marginLeft: 6 }}>
                      <VerifiedBadge
                        verificationStyle={(tweet.author?.verification_style as any) || 'default'}
                        size={16}
                        tint={feedBadge.tint}
                      />
                    </View>
                  )}
                  {tweet.author?.is_ios_native && (
                    <View style={{ marginLeft: 6 }}>
                      <IosNativeBadge size={16} />
                    </View>
                  )}
                </View>
                
                <View style={styles.usernameRow}>
                  <Text style={[
                    styles.username,
                    hasActiveEvent && eventTheme && {
                      color: eventTheme.colors.textSecondary,
                    }
                  ]}>
                    @{tweet.author?.username || 'username'}
                  </Text>
                  <Text style={[
                    styles.timestamp,
                    hasActiveEvent && eventTheme && {
                      color: eventTheme.colors.textSecondary,
                    }
                  ]}>
                    · {dateLabel}
                  </Text>
                </View>
              </View>
            </TouchableOpacity>

            {/* Bouton d'options */}
            <TouchableOpacity
              style={styles.optionsButton}
              activeOpacity={0.7}
              onPress={handleOptionsMenu}
            >
              <Ionicons name="ellipsis-horizontal" size={20} color={colors.textMuted} />
            </TouchableOpacity>
          </View>

          {/* Contenu du tweet */}
          <View style={styles.tweetContent}>
            {isScrambled ? (
              <LockedText
                text={displayedContent}
                style={[styles.tweetText, compact && styles.compactTweetText]}
                numberOfLines={isExpanded ? undefined : (compact ? 3 : 4)}
                tint={hasActiveEvent && eventTheme ? eventTheme.colors.text : undefined}
                price={contentLock?.price_twc}
                compact={compact}
              />
            ) : (
              <TranslationReveal
                tweetId={tweet.id}
                language={activeTranslation?.language ?? null}
              >
                <ClickableMentions
                  text={displayedContent}
                  mentions={tweet.mentions || []}
                  style={[
                    styles.tweetText,
                    compact && styles.compactTweetText,
                    hasActiveEvent && eventTheme && {
                      color: eventTheme.colors.text,
                    }
                  ]}
                  numberOfLines={isExpanded ? undefined : (compact ? 3 : 4)}
                />
              </TranslationReveal>
            )}
            
            {/* Bouton "Voir plus" si le texte est long */}
            {displayedContent && displayedContent.length > (compact ? 120 : 160) && !isExpanded && (
              <TouchableOpacity 
                style={styles.seeMoreButton}
                onPress={toggleExpanded}
                activeOpacity={0.7}
              >
                <Text style={styles.seeMoreText}>Voir plus</Text>
              </TouchableOpacity>
            )}
            
            {isExpanded && displayedContent && displayedContent.length > (compact ? 120 : 160) && (
              <TouchableOpacity 
                style={styles.seeMoreButton}
                onPress={toggleExpanded}
                activeOpacity={0.7}
              >
                <Text style={styles.seeMoreText}>Voir moins</Text>
              </TouchableOpacity>
            )}

            {/* Sélecteur de langue — uniquement sur les tweets publiés avec l'option */}
            {tweet.translation_enabled && (
              <TweetLanguageSwitcher
                tweetId={tweet.id}
                active={activeTranslation}
                onSelect={setActiveTranslation}
              />
            )}

            {/* Contenu payant : le texte ci-dessus n'est que l'aperçu renvoyé
                par le serveur. Cette carte sert le profil et la recherche —
                sans le verrou ici, l'aperçu y apparaissait illisible et sans
                rien à acheter. */}
            {isContentLocked && (
              <PaidContentLock
                lock={contentLock}
                compact={compact}
                onUnlocked={handleTweetPress}
              />
            )}
          </View>

          {/* Actions du tweet */}
          <View style={styles.actions}>
            {/* Répondre */}
            <TouchableOpacity 
              style={[
                styles.actionButton,
                hasActiveEvent && eventTheme && {
                  backgroundColor: eventTheme.colors.surface + '20',
                  borderColor: eventTheme.colors.border,
                  borderWidth: 1,
                }
              ]}
              onPress={handleReply}
              activeOpacity={0.7}
            >
              <View style={styles.actionBlur}>
                <Ionicons 
                  name="chatbubble-outline" 
                  size={20} 
                  color={hasActiveEvent && eventTheme ? eventTheme.colors.textSecondary : colors.textSecondary} 
                />
                <Text style={[
                  styles.actionText,
                  hasActiveEvent && eventTheme && {
                    color: eventTheme.colors.textSecondary,
                  }
                ]}>
                  {formatNumber(tweet.stats?.replies || 0)}
                </Text>
              </View>
            </TouchableOpacity>

            {/* Retweeter */}
            <TouchableOpacity 
              style={[
                styles.actionButton,
                hasActiveEvent && eventTheme && {
                  backgroundColor: eventTheme.colors.surface + '20',
                  borderColor: eventTheme.colors.border,
                  borderWidth: 1,
                },
                tweet.user_interaction?.is_retweeted && hasActiveEvent && eventTheme && {
                  backgroundColor: eventTheme.colors.primary + '30',
                  borderColor: eventTheme.colors.primary,
                }
              ]}
              onPress={handleRetweet}
              // Monte l'éclat au POSÉ du doigt : le montage a toute la durée
              // de l'appui pour se faire, et l'éclat part après son délai.
              onPressIn={armBurst}
              activeOpacity={0.7}
            >
              <View style={styles.actionBlur}>
                <View style={styles.burstHost}>
                  {burstArmed && (
                    <ReactionBurst progress={retweet.progress} palette={RETWEET_PALETTE} iconSize={20} />
                  )}
                  <Reanimated.View style={retweet.iconStyle}>
                    <Ionicons
                      name={tweet.user_interaction?.is_retweeted ? "repeat" : "repeat-outline"}
                      size={20}
                      color={tweet.user_interaction?.is_retweeted ?
                        (hasActiveEvent && eventTheme ? eventTheme.colors.primary : colors.accent) :
                        (hasActiveEvent && eventTheme ? eventTheme.colors.textSecondary : colors.textSecondary)
                      }
                    />
                  </Reanimated.View>
                </View>
                <Text style={[
                  styles.actionText,
                  hasActiveEvent && eventTheme && {
                    color: eventTheme.colors.textSecondary,
                  },
                  tweet.user_interaction?.is_retweeted && hasActiveEvent && eventTheme && {
                    color: eventTheme.colors.primary,
                  },
                  tweet.user_interaction?.is_retweeted && styles.activeActionText
                ]}>
                  {formatNumber(tweet.stats?.retweets || 0)}
                </Text>
              </View>
            </TouchableOpacity>

            {/* Liker */}
            <TouchableOpacity 
              style={[
                styles.actionButton,
                hasActiveEvent && eventTheme && {
                  backgroundColor: eventTheme.colors.surface + '20',
                  borderColor: eventTheme.colors.border,
                  borderWidth: 1,
                },
                tweet.user_interaction?.is_liked && hasActiveEvent && eventTheme && {
                  backgroundColor: eventTheme.colors.primary + '30',
                  borderColor: eventTheme.colors.primary,
                }
              ]}
              onPress={handleLike}
              onPressIn={armBurst}
              activeOpacity={0.7}
            >
              <View style={styles.actionBlur}>
                <View style={styles.burstHost}>
                  {burstArmed && (
                    <ReactionBurst progress={like.progress} palette={LIKE_PALETTE} iconSize={20} />
                  )}
                  <Reanimated.View style={like.iconStyle}>
                    <Ionicons
                      name={tweet.user_interaction?.is_liked ? "heart" : "heart-outline"}
                      size={20}
                      color={tweet.user_interaction?.is_liked ?
                        (hasActiveEvent && eventTheme ? eventTheme.colors.primary : colors.like) :
                        (hasActiveEvent && eventTheme ? eventTheme.colors.textSecondary : colors.textSecondary)
                      }
                    />
                  </Reanimated.View>
                </View>
                <Text style={[
                  styles.actionText,
                  hasActiveEvent && eventTheme && {
                    color: eventTheme.colors.textSecondary,
                  },
                  tweet.user_interaction?.is_liked && hasActiveEvent && eventTheme && {
                    color: eventTheme.colors.primary,
                  },
                  tweet.user_interaction?.is_liked && styles.likedActionText
                ]}>
                  {formatNumber(tweet.stats?.likes || 0)}
                </Text>
              </View>
            </TouchableOpacity>

            {/* Partager */}
            <TouchableOpacity
              style={[
                styles.actionButton,
                hasActiveEvent && eventTheme && {
                  backgroundColor: eventTheme.colors.surface + '20',
                  borderColor: eventTheme.colors.border,
                  borderWidth: 1,
                }
              ]}
              onPress={handleShare}
              activeOpacity={0.7}
            >
              <View style={styles.actionBlur}>
                <Ionicons
                  name="share-outline"
                  size={20}
                  color={hasActiveEvent && eventTheme ? eventTheme.colors.textSecondary : colors.textSecondary}
                />
              </View>
            </TouchableOpacity>
          </View>

          {/* Actions de modération (visible uniquement pour les modérateurs) */}
          {isModerator && (canModerateContent || canDeleteTweets) && (
            <ModerationActions
              targetType="tweet"
              targetId={tweet.id}
              targetData={tweet}
              onActionComplete={() => {
                // Optionnel : rafraîchir les données après une action
              }}
            />
          )}

      
        </View>
      </Animated.View>
    </Pressable>
  );
}

/**
 * Même rôle que le comparateur de `feed/TweetRow` : sans lui, un like sur une
 * carte re-rendait les cinquante cartes montées d'un écran de profil.
 *
 * Le thème d'événement n'a pas à y figurer : il est lu par un contexte à
 * l'intérieur de la carte, donc il la re-rend de lui-même.
 */
function areEqual(prev: TweetCardProps, next: TweetCardProps) {
  if (
    prev.compact !== next.compact ||
    prev.onLike !== next.onLike ||
    prev.onRetweet !== next.onRetweet ||
    prev.onReply !== next.onReply ||
    prev.onShare !== next.onShare ||
    prev.onBookmark !== next.onBookmark ||
    prev.onSkip !== next.onSkip ||
    prev.onBlock !== next.onBlock ||
    prev.onDelete !== next.onDelete
  ) {
    return false;
  }

  const a = prev.tweet;
  const b = next.tweet;
  if (a === b) return true;

  return (
    a.id === b.id &&
    a.content === b.content &&
    a.stats?.likes === b.stats?.likes &&
    a.stats?.retweets === b.stats?.retweets &&
    a.stats?.replies === b.stats?.replies &&
    a.stats?.views === b.stats?.views &&
    a.user_interaction?.is_liked === b.user_interaction?.is_liked &&
    a.user_interaction?.is_retweeted === b.user_interaction?.is_retweeted &&
    // L'accès au contenu payant change l'affichage du verrou.
    (a as any).paid_content?.has_access === (b as any).paid_content?.has_access &&
    // L'auteur peut changer d'habillage sans que le tweet change d'identité.
    // Comparateur partagé avec TweetRow et TweetRowGutter : il couvre aussi
    // `premium` et `subscription_tier`, qui manquaient ici alors que les
    // deux sont rendus (voir `isPremium` / `subscriptionTierRaw`).
    sameAuthor(a.author, b.author)
  );
}

export default memo(TweetCard, areEqual);

const styles = StyleSheet.create({
  container: {
    marginHorizontal: 14,
    marginVertical: 6,
    borderRadius: 20,
    overflow: 'hidden',
    position: 'relative',
  },
  compactContainer: {
    marginHorizontal: 8,
    marginVertical: 4,
  },
  background: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.overlayMedium,
    borderWidth: 1,
    borderColor: colors.border,
  },
  content: {
    padding: 16,
    zIndex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  userInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  avatar: {
    marginRight: 12,
  },
  userDetails: {
    flex: 1,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  displayName: {
    fontFamily: fonts.display,
    fontSize: 15.5,
    color: colors.textPrimary,
    marginRight: 4,
    letterSpacing: -0.3,
  },
  username: {
    fontFamily: fonts.regular,
    fontSize: 13.5,
    color: colors.textSecondary,
  },
  verifiedIcon: {
    marginLeft: 4,
  },
  usernameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 1,
  },
  timestamp: {
    fontFamily: fonts.regular,
    fontSize: 13,
    color: colors.textMuted,
    marginLeft: 6,
  },
  optionsButton: {
    padding: 8,
  },
  tweetContent: {
    marginBottom: 16,
  },
  tweetText: {
    fontFamily: fonts.regular,
    fontSize: 15.5,
    lineHeight: 23,
    color: colors.textPrimary,
    letterSpacing: 0.1,
  },
  compactTweetText: {
    fontSize: 14,
    lineHeight: 20,
  },
  seeMoreButton: {
    alignSelf: 'flex-start',
    marginTop: 6,
  },
  seeMoreText: {
    fontFamily: fonts.semibold,
    fontSize: 13.5,
    color: colors.accent,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 2,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.borderSubtle,
  },
  actionButton: {
    borderRadius: 20,
    overflow: 'hidden',
  },
  actionBlur: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 20,
    // L'éclat de réaction déborde de la pastille : rien ne doit le rogner.
    overflow: 'visible',
  },
  burstHost: {
    width: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'visible',
  },
  actionText: {
    fontFamily: fonts.semibold,
    fontSize: 13,
    color: colors.textSecondary,
    marginLeft: 6,
  },
  activeActionText: {
    color: colors.accent,
  },
  likedActionText: {
    color: colors.like,
  },
  bottomBorder: {
    height: 1,
    width: '100%',
  },
});
