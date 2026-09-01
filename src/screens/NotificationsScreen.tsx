import React, { useState, useEffect, useCallback } from 'react';
import { fonts, colors , statusBarStyle} from '../theme';
import { ScreenBackground, ScreenSkeleton, AppRefreshControl, PullRefreshLogo } from '../components/ui';
import { usePullRefreshLogo } from '../hooks/usePullRefreshLogo';
import Animated from 'react-native-reanimated';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  FlatList,
  StyleSheet,
  StatusBar,
  Platform,
} from 'react-native';
// `expo-image` plutôt que `Image` de React Native : cache disque et décodage
// hors du thread JS, sur des vignettes montées en liste. `transition={0}` :
// aucune apparition en fondu, le rendu reste celui d'avant.
import { Image } from 'expo-image';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useNavigation } from '@react-navigation/native';
import { useHeaderMetrics } from '../hooks/useHeaderMetrics';
import Avatar from '../components/Avatar';
import { apiService } from '../services';
import unreadService from '../services/unreadService';
import { useAuth } from '../contexts/AuthContext';
import VerifiedBadge from '../components/VerifiedBadge';
import BanAlertBanner from '../components/BanAlertBanner';
import { resolveStoryMedia } from '../services/storiesService';
import { certifiedNameColors, nameIsLit, type ProfileCustomization } from '../services/profileCustomizationService';
import { confirmAsync } from '../components/ui/ConfirmSheet';
import { toast } from '../components/ui/Toast';
import strikeService from '../services/strikeService';

// ─── Types ───────────────────────────────────────────────────────────────────

interface NotificationSender {
  id?: string;
  username: string;
  full_name: string;
  avatar?: string;
  verified?: boolean;
  verification_style?: string;
  profile_customization?: ProfileCustomization;
}

interface SimpleNotification {
  id: string;
  type: 'like' | 'retweet' | 'reply' | 'follow' | 'mention' | 'system' | string;
  message: string;
  title: string;
  is_read: boolean;
  created_at: string;
  sender?: NotificationSender;
  tweet?: { content: string; id: string; image?: string };
  content?: { reason?: string; score?: number;[key: string]: any };
  /**
   * Porte le sous-type des notifications `system` via `kind` — le serveur évite
   * ainsi d'ajouter une valeur à l'ENUM `type` pour chaque nouveau cas
   * (voir `Notification.createFollowRequestNotification` côté API).
   */
  metadata?: { kind?: string; ticket_id?: string; idea?: string;[key: string]: any };
}

type FilterKey = 'all' | 'verified' | 'mentions';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function timeAgo(dateStr: string): string {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return '';
  const diff = Date.now() - date.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'maintenant';
  if (mins < 60) return `${mins} min`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}j`;
  return date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
}

function getActionText(
  type: string,
  message?: string,
  content?: Record<string, any>,
  kind?: string,
): string {
  if (content?.entity_type === 'story_like') return 'a aimé votre story';
  if (content?.entity_type === 'story_reply') return 'a répondu à votre story';
  if (content?.entity_type === 'message') return 'vous a envoyé un message';
  // Un auteur Ultra qui previent ses abonnes : le message est ECRIT PAR LUI,
  // il ne decrit pas une action faite sur ton compte. Le laisser tomber dans
  // le `case 'system'` l'affichait comme une notification de la plateforme,
  // alors que c'est quelqu'un que tu suis qui parle.
  if (kind === 'author_post') return message || 'vient de publier';
  switch (type) {
    case 'like': return 'a aimé votre Tweet';
    case 'retweet': return 'a retweeté votre Tweet';
    case 'reply': return 'a répondu à votre Tweet';
    case 'follow': return 'vous suit maintenant';
    case 'mention': return 'vous a mentionné';
    case 'system': return message || 'Notification système';
    default: return message || 'Nouvelle notification';
  }
}

// ─── Icône type (cercle coloré style Twitter) ────────────────────────────────

const TYPE_CONFIG: Record<string, { icon: string; bg: string; color: string }> = {
  like: { icon: 'heart', bg: colors.accentMuted, color: colors.accent },
  retweet: { icon: 'repeat', bg: colors.successMuted, color: colors.success },
  reply: { icon: 'chatbubble', bg: colors.cyanMuted, color: colors.cyan },
  follow: { icon: 'person-add', bg: colors.accentMuted, color: colors.accent },
  mention: { icon: 'at', bg: colors.cyanMuted, color: colors.cyan },
  system: { icon: 'sparkles', bg: colors.warningMuted, color: colors.gold },
  story_like: { icon: 'heart', bg: colors.accentMuted, color: '#FF375F' },
  story_reply: { icon: 'chatbubble-ellipses', bg: colors.cyanMuted, color: colors.cyan },
  message: { icon: 'mail', bg: colors.cyanMuted, color: colors.cyan },
};

function TypeIcon({ type }: { type: string }) {
  const cfg = TYPE_CONFIG[type] ?? { icon: 'notifications', bg: colors.surfaceAlt, color: colors.textSecondary };
  return (
    <View style={[styles.typeIconWrap, { backgroundColor: cfg.bg }]}>
      <Ionicons name={cfg.icon as any} size={20} color={cfg.color} />
    </View>
  );
}

// ─── Item notification ────────────────────────────────────────────────────────

interface NotificationItemProps {
  notification: SimpleNotification;
  onOpen: (notification: SimpleNotification) => void;
  onDelete: (id: string) => void;
}

function NotificationItemBase({ notification, onOpen, onDelete }: NotificationItemProps) {
  const { sender, tweet, type, is_read, created_at, content, message } = notification;
  const entityType = String(content?.entity_type || type);
  const storyIsVideo = content?.story_media_type === 'video';
  const storyPreview = resolveStoryMedia(
    content?.story_thumbnail_url || (!storyIsVideo ? content?.story_media_url : null),
  );
  // Le nom est imbriqué dans un <Text> (paragraphe notif) : impossible d'y
  // mettre le halo animé (View), qui casserait la mise en page. On garde au
  // moins la couleur — cohérent avec la pastille — plutôt qu'un nom neutre.
  const senderBadgeTint = certifiedNameColors(
    sender?.verification_style as any,
    sender?.profile_customization,
  ).from;
  const senderNameLit = nameIsLit(sender?.profile_customization);

  return (
    <TouchableOpacity
      style={[styles.item, !is_read && styles.itemUnread]}
      onPress={() => onOpen(notification)}
      activeOpacity={0.75}
    >
      {/* Pastille non-lu */}
      {!is_read && <View style={styles.unreadDot} />}

      {/* Colonne gauche : icône type */}
      <View style={styles.leftCol}>
        <TypeIcon type={entityType} />
      </View>

      {/* Colonne droite */}
      <View style={styles.rightCol}>

        {/* Ligne 1 : avatar + bouton ··· */}
        <View style={styles.topRow}>
          <Avatar
            size={40}
            username={sender?.username ?? 'U'}
            uri={sender?.avatar}
          />
          <TouchableOpacity
            style={styles.moreBtn}
            onPress={() => onDelete(notification.id)}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons name="ellipsis-horizontal" size={18} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>

        {/* Ligne 2 : nom + badge + action + temps */}
        <Text style={styles.bodyText} numberOfLines={3}>
          <Text style={[styles.bold, senderNameLit && { color: senderBadgeTint }]}>
            {sender?.full_name ?? 'Utilisateur'}
          </Text>
          {sender?.verified && (
            <VerifiedBadge
              verificationStyle={(sender.verification_style as any) ?? 'default'}
              size={14}
              tint={senderBadgeTint}
            />
          )}
          <Text style={styles.muted}> {getActionText(type, message, content, notification.metadata?.kind)}</Text>
          {created_at && (
            <Text style={styles.time}> · {timeAgo(created_at)}</Text>
          )}
        </Text>

        {/* Aperçu tweet */}
        {tweet && (
          <View style={styles.tweetRow}>
            <Text style={styles.tweetText} numberOfLines={2}>
              {tweet.content}
            </Text>
            {tweet.image && (
              <Image
                source={{ uri: tweet.image }}
                style={styles.tweetThumb}
                contentFit="cover"
                cachePolicy="memory-disk"
                transition={0}
                recyclingKey={tweet.image}
              />
            )}
          </View>
        )}

        {(entityType === 'story_like' || entityType === 'story_reply') && (
          <View style={styles.storyNotificationCard}>
            {storyPreview ? (
              <Image
                source={{ uri: storyPreview }}
                style={styles.storyNotificationThumb}
                contentFit="cover"
                cachePolicy="memory-disk"
                transition={0}
                recyclingKey={storyPreview}
              />
            ) : (
              <View style={[styles.storyNotificationThumb, styles.storyNotificationFallback]}>
                <Ionicons name={storyIsVideo ? 'play' : 'image-outline'} size={20} color="#fff" />
              </View>
            )}
            <View style={styles.storyNotificationCopy}>
              <Text style={styles.storyNotificationTitle}>
                {entityType === 'story_like' ? 'Votre story' : 'Réponse reçue'}
              </Text>
              <Text style={styles.storyNotificationText} numberOfLines={2}>
                {content?.preview || content?.story_caption || message}
              </Text>
            </View>
          </View>
        )}

        {entityType === 'message' && (
          <View style={styles.messageNotificationCard}>
            <Ionicons name="chatbubble-outline" size={16} color={colors.cyan} />
            <Text style={styles.messageNotificationText} numberOfLines={2}>
              {content?.preview || message}
            </Text>
          </View>
        )}

        {/* Box système / Notes de la Communauté */}
        {type === 'system' && entityType === 'system' && content && (
          <View style={styles.systemBox}>
            {!!content.reason && (
              <Text style={styles.systemReason}>{content.reason}</Text>
            )}
            {typeof content.score === 'number' && (
              <Text style={styles.systemScore}>
                Pertinence : {(content.score * 100).toFixed(0)} %
              </Text>
            )}
            {/* Strike Ultra reçu sur un de mes tweets, pas encore contesté
                (`outcome` absent) : seule action possible depuis cette
                notification — une revue indépendante, pas un rétablissement
                automatique. */}
            {content.domain === 'strike' && !!content.strike_id && !content.outcome && (
              <TouchableOpacity
                style={styles.strikeContestButton}
                onPress={async () => {
                  const result = await strikeService.contestStrike(content.strike_id);
                  if (!result.success) {
                    toast.error('Contestation impossible', { description: result.message });
                    return;
                  }
                  const upheld = result.data?.strike?.status === 'upheld';
                  if (upheld) {
                    toast.info('Strike confirmé', {
                      description: 'La revue indépendante a confirmé le retrait de la diffusion.',
                    });
                  } else {
                    toast.success('Strike annulé', {
                      description: 'La revue indépendante a rétabli la diffusion de ce tweet.',
                    });
                  }
                }}
              >
                <Ionicons name="shield-checkmark-outline" size={14} color={colors.accent} />
                <Text style={styles.strikeContestButtonText}>Contester ce strike</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
}

/**
 * Une ligne ne dépend que de sa notification et des deux handlers, qui sont
 * stables : sans ce `memo`, marquer une notification comme lue re-rendait la
 * cinquantaine de lignes de l'écran.
 */
const NotificationItem = React.memo(
  NotificationItemBase,
  (prev, next) =>
    prev.onOpen === next.onOpen &&
    prev.onDelete === next.onDelete &&
    prev.notification === next.notification,
);

/** Référence stable : un `[]` littéral changerait d'identité à chaque rendu. */
const EMPTY_NOTIFICATIONS: SimpleNotification[] = [];

// ─── Onglets ──────────────────────────────────────────────────────────────────

const TABS: { key: FilterKey; label: string }[] = [
  { key: 'all', label: 'Tout' },
  { key: 'verified', label: 'Vérifiés' },
  { key: 'mentions', label: 'Mentions' },
];

// ─── Écran principal ──────────────────────────────────────────────────────────

/**
 * La liste des notifications — animée sur iOS SEULEMENT, et c'est délibéré.
 *
 * `Animated.FlatList` n'est pas un `FlatList` avec une prop en plus : il impose
 * son propre `CellRendererComponent`, qui est une `Animated.View`. Chaque
 * cellule montée devient donc un composant animé complet (filtrage de props,
 * gestionnaire d'événements natifs, mise à jour de props JS), là où un
 * `FlatList` nu n'enveloppe la cellule dans rien du tout.
 *
 * Or le seul consommateur du gestionnaire animé est le logo d'actualisation
 * (`usePullRefreshLogo` → `pull`), qui n'existe QUE sur iOS : `pull` se nourrit
 * d'un `contentOffset.y` NÉGATIF, que seul le rebond iOS produit, et
 * `PullRefreshLogo` n'est monté que sur iOS (Android garde son
 * `RefreshControl` natif). Sur Android, chaque cellule payait un composant
 * animé pour alimenter une valeur que personne ne lit.
 *
 * Même arbitrage, mot pour mot, que `FeedGutterScreen` — voir le commentaire
 * de `FeedList` là-bas. `Platform.OS` est constant sur la durée de vie du
 * processus : la liste ne se remonte jamais à cause de ce choix.
 */
const NotificationList = (Platform.OS === 'ios' ? Animated.FlatList : FlatList) as typeof Animated.FlatList;

export default function NotificationsScreen() {
  const { isUserBanned, isUserSuspended, user } = useAuth();
  const navigation = useNavigation<any>();
  const { top: headerTopInset } = useHeaderMetrics();

  const [notifications, setNotifications] = useState<SimpleNotification[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<FilterKey>('all');
  const [pendingFollowRequests, setPendingFollowRequests] = useState(0);

  const fetchNotifications = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await apiService.getNotifications({ limit: 50, unread_only: false });
      if (response.success && response.data?.notifications) {
        setNotifications(response.data.notifications);
      } else {
        setError(response.message ?? 'Erreur lors du chargement');
      }
    } catch {
      setError('Erreur de connexion');
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchPendingFollowRequests = useCallback(async () => {
    try {
      const res = await apiService.getFollowRequests();
      setPendingFollowRequests(res?.success ? (res.data?.requests?.length || 0) : 0);
    } catch {
      setPendingFollowRequests(0);
    }
  }, []);

  useEffect(() => { fetchNotifications(); }, [fetchNotifications]);
  useEffect(() => { fetchPendingFollowRequests(); }, [fetchPendingFollowRequests]);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchNotifications();
    setRefreshing(false);
  };

  const { pull, scrollHandler, logoKey, listRef } = usePullRefreshLogo(onRefresh, refreshing);

  const handleMarkAllAsRead = async () => {
    try {
      await unreadService.withRetry(async () => {
        const res = await apiService.markAllNotificationsAsRead();
        if (!res?.success) throw new Error(res?.message || 'mark-all-as-read failed');
        return res;
      });
      setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
      unreadService.notifyChanged();
    } catch { }
  };

  // Identité stable : ces deux handlers descendent dans chaque ligne, et le
  // `memo` de `NotificationItem` les compare par référence.
  const handleMarkAsRead = useCallback(async (id: string) => {
    try {
      // apiService avale déjà les erreurs réseau et renvoie { success: false }
      // plutôt que de rejeter : on retente donc sur la valeur de retour, pas
      // seulement sur une exception.
      await unreadService.withRetry(async () => {
        const res = await apiService.markNotificationAsRead(id);
        if (!res?.success) throw new Error(res?.message || 'mark-as-read failed');
        return res;
      });
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
      unreadService.notifyChanged();
    } catch { }
  }, []);

  const handleOpenNotification = useCallback(async (notification: SimpleNotification) => {
    if (!notification.is_read) {
      await handleMarkAsRead(notification.id);
    }
    const content = notification.content || {};
    const kind = notification.metadata?.kind;

    // Idée de tweet du radar de tendances : on ouvre le composeur avec le texte
    // proposé déjà dedans. L'intérêt d'un sujet qui perce est périssable —
    // atterrir sur un écran de statistiques ferait perdre le moment.
    if (kind === 'trend_idea' && notification.metadata?.idea) {
      navigation.navigate('CreateTweet', { prefill: String(notification.metadata.idea) });
      return;
    }

    if (kind === 'support_reply' && notification.metadata?.ticket_id) {
      navigation.navigate('SupportTicket', { ticketId: String(notification.metadata.ticket_id) });
      return;
    }

    // Résultat d'un concours (gagné, terminé sans tirage pour ce
    // participant, ou récap pour l'organisateur) : direct vers la page du
    // concours plutôt que le tweet, pour être sûr que le résultat s'affiche
    // même si le tweet a défilé hors du fil depuis.
    const contestId = notification.metadata?.contest_id || content.contest_id;
    if (
      (kind === 'contest_won' || kind === 'contest_ended' || kind === 'contest_closed') &&
      contestId
    ) {
      navigation.navigate('Contest', { contestId: String(contestId) });
      return;
    }

    if (content.conversation_id) {
      navigation.navigate('ConversationThread', {
        conversationId: String(content.conversation_id),
        title: notification.sender?.full_name || notification.sender?.username || 'Conversation',
        username: notification.sender?.username,
        avatar: notification.sender?.avatar || null,
        verified: !!notification.sender?.verified,
        verificationStyle: notification.sender?.verification_style || 'default',
        otherUserId: notification.sender?.id,
      });
      return;
    }
    if (notification.tweet?.id) {
      navigation.navigate('TweetDetail', { tweetId: String(notification.tweet.id) });
    }
  }, [handleMarkAsRead, navigation]);

  const handleDelete = useCallback((id: string) => {
    confirmAsync({
      title: 'Supprimer',
      message: 'Supprimer cette notification ?',
      confirmLabel: 'Supprimer',
      destructive: true,
    }).then((ok) => {
      if (ok) (async () => {
            try {
              const response = await apiService.deleteNotification(id);
              if (response.success) {
                setNotifications(prev => prev.filter(n => n.id !== id));
              }
            } catch { }
          })();
    });
  }, []);

  const filtered = React.useMemo(
    () =>
      notifications.filter(n => {
        if (activeTab === 'verified') return n.sender?.verified === true;
        if (activeTab === 'mentions') return n.type === 'mention' || n.type === 'reply';
        return true;
      }),
    [notifications, activeTab],
  );

  const keyExtractor = useCallback((n: SimpleNotification) => n.id, []);

  const renderNotification = useCallback(
    ({ item }: { item: SimpleNotification }) => (
      <NotificationItem
        notification={item}
        onOpen={handleOpenNotification}
        onDelete={handleDelete}
      />
    ),
    [handleOpenNotification, handleDelete],
  );

  // ─── Loading ────────────────────────────────────────────────────────────
  if (loading && notifications.length === 0) {
    return (
      <ScreenBackground>
        <View style={styles.container}>
          <StatusBar barStyle={statusBarStyle()} backgroundColor="transparent" translucent />
          <ScreenSkeleton variant="notification" count={7} />
        </View>
      </ScreenBackground>
    );
  }

  return (
    <ScreenBackground>
    <View style={styles.container}>
      <StatusBar barStyle={statusBarStyle()} backgroundColor="transparent" translucent />

      {/* ── Top bar ── */}
      <View style={[styles.topBar, { paddingTop: headerTopInset }]}>
        <View style={styles.topBarLeft}>
          <Avatar size={34} username={user?.username ?? 'U'} uri={user?.avatar} />
        </View>
        <Text style={styles.topBarTitle}>Notifications</Text>
        <View style={styles.topBarRight}>
          {notifications.some(n => !n.is_read) && (
            <TouchableOpacity onPress={handleMarkAllAsRead} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="checkmark-done-outline" size={22} color={colors.textPrimary} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* ── Onglets — sélecteur en bloc plein ── */}
      <View style={styles.tabsRow}>
        {TABS.map(tab => (
          <TouchableOpacity
            key={tab.key}
            style={[styles.tabBtn, activeTab === tab.key && styles.tabBtnActive]}
            onPress={() => setActiveTab(tab.key)}
            activeOpacity={0.8}
          >
            <Text style={[styles.tabLabel, activeTab === tab.key && styles.tabLabelActive]}>
              {tab.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* ── Liste ── */}
      {/*
        Liste virtualisée : les cinquante notifications étaient toutes montées
        avant la première frame. La bannière d'alerte et les demandes
        d'abonnement deviennent l'en-tête, à la même place.
      */}
      <View style={styles.listWrap}>
      {Platform.OS === 'ios' && <PullRefreshLogo key={logoKey} pull={pull} active={refreshing} />}
      <NotificationList
        // Voir `usePullRefreshLogo` : la traction est lue par cette ref, sur
        // le thread UI, pas par `onScroll` (que `VirtualizedList` compose).
        ref={listRef}
        style={styles.list}
        refreshControl={Platform.OS === 'ios' ? undefined : (
          <AppRefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        )}
        // Rien à écouter sur Android : `pull` n'y est jamais lu (voir
        // `NotificationList`). Un gestionnaire animé branché pour personne
        // tourne quand même à chaque image, sur le thread UI.
        onScroll={Platform.OS === 'ios' ? scrollHandler : undefined}
        scrollEventThrottle={1}
        alwaysBounceVertical
        showsVerticalScrollIndicator={false}
        data={error ? EMPTY_NOTIFICATIONS : filtered}
        keyExtractor={keyExtractor}
        renderItem={renderNotification}
        initialNumToRender={8}
        maxToRenderPerBatch={6}
        updateCellsBatchingPeriod={50}
        windowSize={7}
        removeClippedSubviews={Platform.OS === 'android'}
        ListHeaderComponent={
          <>
        <BanAlertBanner />

        {pendingFollowRequests > 0 && (
          <TouchableOpacity
            style={styles.followRequestsBanner}
            onPress={() => navigation.navigate('FollowRequests')}
            activeOpacity={0.8}
          >
            <View style={styles.followRequestsIconWrap}>
              <Ionicons name="person-add" size={18} color={colors.accent} />
            </View>
            <Text style={styles.followRequestsText}>
              {pendingFollowRequests} demande{pendingFollowRequests > 1 ? 's' : ''} d'abonnement en attente
            </Text>
            <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
          </TouchableOpacity>
        )}

          </>
        }
        ListEmptyComponent={
          error ? (
          <View style={styles.centered}>
            <Ionicons name="wifi-outline" size={44} color={colors.textSecondary} />
            <Text style={styles.errorText}>{error}</Text>
            <TouchableOpacity style={styles.retryBtn} onPress={fetchNotifications}>
              <Text style={styles.retryBtnText}>Réessayer</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.centered}>
            <Ionicons name="notifications-outline" size={52} color={colors.textMuted} />
            <Text style={styles.emptyTitle}>Aucune notification</Text>
            <Text style={styles.emptyText}>
              {activeTab === 'all'
                ? "Vous n'avez pas encore de notifications."
                : 'Aucune notification dans cet onglet.'}
            </Text>
          </View>
          )
        }
      />
      </View>
    </View>
    </ScreenBackground>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'transparent',
  },

  // ── Top bar
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    // paddingTop réel posé à l'appel (useHeaderMetrics), pas une valeur devinée.
    paddingBottom: 10,
  },
  topBarLeft: { width: 34 },
  topBarRight: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  topBarTitle: {
    fontSize: 16,
    fontFamily: fonts.heading,
    color: colors.textPrimary,
  },

  // ── Onglets — sélecteur en bloc plein
  tabsRow: {
    flexDirection: 'row',
    paddingHorizontal: 14,
    paddingBottom: 10,
    gap: 8,
  },
  tabBtn: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 9,
    borderRadius: 10,
  },
  tabBtnActive: {
    backgroundColor: colors.surface,
  },
  tabLabel: {
    fontSize: 14,
    fontFamily: fonts.semibold,
    color: colors.textMuted,
  },
  tabLabelActive: {
    color: colors.textPrimary,
    fontFamily: fonts.bold,
  },

  // ── Liste
  listWrap: { flex: 1 },
  list: { flex: 1 },

  // ── Item
  item: {
    flexDirection: 'row',
    paddingLeft: 12,
    paddingRight: 16,
    paddingVertical: 14,
    marginHorizontal: 10,
    marginBottom: 2,
    borderRadius: 14,
  },
  itemUnread: {
    backgroundColor: colors.surface,
  },

  // Pastille non-lu (à gauche, alignée avec le centre de l'icône)
  unreadDot: {
    position: 'absolute',
    left: 6,
    top: 24,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.accent,
  },

  // Colonne gauche : icône type dans cercle coloré
  leftCol: {
    width: 46,
    alignItems: 'center',
    paddingTop: 2,
    flexShrink: 0,
  },
  typeIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Colonne droite
  rightCol: {
    flex: 1,
    minWidth: 0,
    paddingLeft: 4,
  },

  // Ligne avatar + bouton ···
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  moreBtn: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 16,
  },

  // Texte
  bodyText: {
    fontSize: 15,
    color: colors.textPrimary,
    lineHeight: 21,
    flexShrink: 1,
  },
  bold: {
    fontFamily: fonts.bold,
    color: colors.textPrimary,
  },
  muted: {
    color: colors.textPrimary,
    fontFamily: fonts.regular,
  },
  time: {
    color: colors.textMuted,
    fontFamily: fonts.regular,
  },
  // Aperçu tweet
  tweetRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginTop: 6,
    gap: 10,
  },
  tweetText: {
    flex: 1,
    fontSize: 15,
    color: colors.textSecondary,
    lineHeight: 20,
  },
  tweetThumb: {
    width: 56,
    height: 56,
    borderRadius: 10,
    flexShrink: 0,
  },

  storyNotificationCard: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 9,
    padding: 8,
    borderRadius: 12,
    backgroundColor: colors.surfaceAlt,
    gap: 10,
  },
  storyNotificationThumb: {
    width: 42,
    height: 56,
    borderRadius: 9,
    flexShrink: 0,
    backgroundColor: '#17151C',
  },
  storyNotificationFallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  storyNotificationCopy: {
    flex: 1,
    minWidth: 0,
  },
  storyNotificationTitle: {
    color: colors.textPrimary,
    fontSize: 13,
    fontFamily: fonts.semibold,
  },
  storyNotificationText: {
    color: colors.textSecondary,
    fontSize: 12,
    lineHeight: 17,
    marginTop: 2,
    fontFamily: fonts.regular,
  },
  messageNotificationCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 9,
    paddingHorizontal: 11,
    paddingVertical: 9,
    borderRadius: 12,
    backgroundColor: colors.surfaceAlt,
  },
  messageNotificationText: {
    flex: 1,
    color: colors.textSecondary,
    fontSize: 13,
    lineHeight: 18,
    fontFamily: fonts.regular,
  },

  // Box système
  systemBox: {
    marginTop: 10,
    padding: 12,
    backgroundColor: colors.surfaceAlt,
    borderRadius: 12,
  },
  systemReason: {
    fontSize: 15,
    color: colors.textPrimary,
    lineHeight: 20,
    marginBottom: 4,
  },
  systemScore: {
    fontSize: 13,
    color: colors.textSecondary,
    fontFamily: fonts.medium,
  },
  strikeContestButton: {
    marginTop: 10,
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.accent,
  },
  strikeContestButtonText: {
    fontSize: 14,
    color: colors.accent,
    fontFamily: fonts.semibold,
  },

  // ── Bandeau demandes d'abonnement
  followRequestsBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 4,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 14,
    backgroundColor: colors.surfaceAlt,
    gap: 10,
  },
  followRequestsIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.accentMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  followRequestsText: {
    flex: 1,
    fontSize: 14,
    fontFamily: fonts.medium,
    color: colors.textPrimary,
  },

  // ── États vides / erreur
  centered: {
    alignItems: 'center',
    paddingTop: 80,
    paddingHorizontal: 40,
    gap: 12,
  },
  loadingText: { fontSize: 16, color: colors.textSecondary },
  errorText: { fontSize: 15, color: colors.textSecondary, textAlign: 'center' },
  retryBtn: {
    marginTop: 8,
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: colors.surface,
  },
  retryBtnText: {
    fontSize: 15,
    fontFamily: fonts.bold,
    color: colors.textPrimary,
  },
  emptyTitle: {
    fontSize: 22,
    fontFamily: fonts.displayHeavy,
    color: colors.textPrimary,
    textAlign: 'center',
  },
  emptyText: {
    fontSize: 15,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
  },
});
