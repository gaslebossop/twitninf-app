import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  FlatList,
  Image,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useFocusEffect } from '@react-navigation/native';
import { colors, fonts , statusBarStyle} from '../theme';
import { AppStatusBar, ScreenBackground, ScreenSkeleton, AppRefreshControl } from '../components/ui';
import { LIST_TUNING } from '../utils/listTuning';
import apiService from '../services/api';
import { API_CONFIG } from '../config/api';
import VerifiedBadge from '../components/VerifiedBadge';
import PremiumDisplayName from '../components/PremiumDisplayName';
import { certifiedNameColors, type ProfileCustomization } from '../services/profileCustomizationService';
import BanAlertBanner from '../components/BanAlertBanner';
import StoriesTray from '../components/StoriesTray';
import StoryRing from '../components/StoryRing';
import storiesService from '../services/storiesService';
import { useAuth } from '../contexts/AuthContext';

interface ConvItem {
  id: string;
  userId?: string;
  otherUserId?: string;
  username: string;
  displayName: string;
  secondaryLabel?: string;
  avatar: string | null;
  lastMessage: string;
  lastMessageFromMe: boolean;
  lastTs: number;
  unread: boolean;
  isGroup?: boolean;
  memberCount?: number;
  isAI?: boolean;
  verified?: boolean;
  verificationStyle?: string;
  customization?: ProfileCustomization | null;
  invitationStatus?: 'accepted' | 'pending' | 'declined';
}

type InboxTab = 'primary' | 'general';

function getMessageMetadata(value: unknown): Record<string, any> {
  let raw: any = value;
  if (typeof raw === 'string') {
    try {
      raw = JSON.parse(raw);
    } catch {
      return {};
    }
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const nested = raw.story_reply && typeof raw.story_reply === 'object' ? raw.story_reply : {};
  const story = raw.story && typeof raw.story === 'object' ? raw.story : {};
  if (raw.source === 'story_reply' || raw.story_id || nested.story_id || story.id) {
    return {
      ...raw,
      source: 'story_reply',
      story_id: raw.story_id || nested.story_id || story.id,
    };
  }
  return raw;
}

function getAvatarUri(avatar: string | null): string | null {
  if (!avatar) return null;
  if (avatar.startsWith('http')) return avatar;
  return `${API_CONFIG.BASE_URL}/static/avatars/${avatar}`;
}

/** Horodatage compact des conversations : 12 min · 3 h · 2 j · 5 sem. */
function formatRelativeTime(ts: number): string {
  const diff = Date.now() - ts;
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'maintenant';
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} j`;
  return `${Math.floor(days / 7)} sem.`;
}

export default function MessagesScreen({ navigation }: any) {
  const [searchQuery, setSearchQuery] = useState('');
  const [conversations, setConversations] = useState<ConvItem[]>([]);
  const [invitations, setInvitations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [tab, setTab] = useState<InboxTab>('primary');
  const [me, setMe] = useState<{ id?: string; username?: string; avatar?: string | null } | null>(null);
  const [storyUserIds, setStoryUserIds] = useState<Set<string>>(new Set());
  const [unseenStoryUserIds, setUnseenStoryUserIds] = useState<Set<string>>(new Set());
  const [storiesRefresh, setStoriesRefresh] = useState(0);

  /**
   * L'utilisateur courant vient d'`AuthContext`, plus d'un `getCurrentUser()`
   * réseau : cet écran en est un descendant, et c'était un aller-retour complet
   * EN TÊTE du chargement — donc strictement sur le chemin critique — pour une
   * donnée déjà en mémoire.
   */
  const { user: authUser } = useAuth();
  const meId = authUser?.id ? String(authUser.id) : null;

  useEffect(() => {
    setMe(
      authUser
        ? { id: meId || undefined, username: authUser.username, avatar: (authUser as any)?.avatar }
        : null,
    );
  }, [authUser, meId]);

  const loadConversations = useCallback(async () => {
    try {

      const convRes = await apiService.get('/api/messages/conversations');
      const list: any[] = convRes?.success ? convRes.conversations || [] : [];

      const mapped: ConvItem[] = list.map((conv: any) => {
        const participants = Array.isArray(conv.participants) ? conv.participants : [];
        const other =
          participants.find((p: any) => String(p?.id || '') !== String(meId || '')) || participants[0];
        const isGroup = conv.type === 'group';
        const invitation = conv?.invitation || { status: 'accepted' };
        const last = conv.last_message;

        const invitationLabel =
          invitation?.status === 'pending'
            ? 'Invitation envoyée'
            : invitation?.status === 'declined'
              ? 'Invitation refusée'
              : null;

        const lastSenderId = String(last?.sender?.id || '');
        const lastMessageFromMe = !!meId && lastSenderId === String(meId);
        const lastMetadata = getMessageMetadata(last?.metadata ?? last?.message_metadata);
        const lastTsRaw = last?.created_at || last?.createdAt || conv?.updated_at || conv?.updatedAt || conv?.created_at || conv?.createdAt;
        const hasReliableTs = !!lastTsRaw;
        const parsedTs = hasReliableTs ? new Date(lastTsRaw).getTime() : Date.now();
        const safeTs = Number.isFinite(parsedTs) ? parsedTs : Date.now();

        // Pas de `unread_count` côté API : on le déduit de la dernière lecture
        // du membre (`last_read_at`) comparée à la date du dernier message reçu.
        // NB : si le dernier message n'a pas de timestamp exploitable, on
        // considère prudemment qu'il n'y a rien de nouveau plutôt que de
        // retomber sur `Date.now()` (qui rendrait la conversation éternellement
        // "non lue" — c'est exactement le bug qui affectait `created_at`/
        // `updated_at` avant la correction du endpoint /conversations).
        const myLastReadAt = conv?.last_read_at ? new Date(conv.last_read_at).getTime() : 0;
        const unread = !!last && !lastMessageFromMe && hasReliableTs && Number.isFinite(parsedTs) && (!myLastReadAt || safeTs > myLastReadAt);
        const storyReplyPreview = lastMetadata.source === 'story_reply'
          ? `${lastMessageFromMe ? 'Réponse à une story' : 'A répondu à votre story'} · ${last?.content || ''}`
          : null;

        const memberCount = isGroup ? participants.length : undefined;

        return {
          id: conv.id,
          userId: isGroup ? undefined : other?.id,
          otherUserId: !isGroup ? other?.id || undefined : undefined,
          username: isGroup ? 'groupe' : other?.username || 'unknown',
          displayName: isGroup ? conv.title || 'Groupe' : other?.full_name || other?.username || 'Conversation',
          secondaryLabel: isGroup
            ? `${memberCount || 0} membre${(memberCount || 0) > 1 ? 's' : ''}`
            : `@${other?.username || 'unknown'}`,
          avatar: (isGroup ? conv.avatar : other?.avatar) || null,
          lastMessage: invitationLabel || storyReplyPreview || last?.content || 'Démarrer la conversation',
          lastMessageFromMe,
          lastTs: safeTs,
          unread,
          isGroup,
          memberCount,
          isAI: !isGroup && participants.some((p: any) => p?.username === 'policiercongo'),
          verified: !!other?.verified,
          verificationStyle: other?.verification_style || 'default',
          // L'habillage suit le compte jusque dans la liste des conversations.
          // Un groupe n'en a pas : c'est un titre, pas un nom de compte.
          customization: isGroup ? null : other?.profile_customization || null,
          invitationStatus: invitation?.status || 'accepted',
        };
      });

      mapped.sort((a, b) => b.lastTs - a.lastTs);
      setConversations(mapped);
    } catch {
      setConversations([]);
    }
  }, [meId]);

  const loadInvitations = useCallback(async () => {
    try {
      const res = await apiService.get('/api/messages/invitations');
      setInvitations(res?.success ? res.invitations || [] : []);
    } catch {
      setInvitations([]);
    }
  }, []);

  /** Anneaux de story sur les avatars de la liste, comme dans Direct. */
  const loadStoryRings = useCallback(async () => {
    const feed = await storiesService.getFeed();
    const withStories = new Set<string>();
    const withUnseen = new Set<string>();
    feed.groups.forEach((group) => {
      const id = group.user?.id ? String(group.user.id) : '';
      if (!id) return;
      withStories.add(id);
      if (group.has_unseen) withUnseen.add(id);
    });
    setStoryUserIds(withStories);
    setUnseenStoryUserIds(withUnseen);
  }, []);

  const loadAll = useCallback(async () => {
    await Promise.all([loadConversations(), loadInvitations(), loadStoryRings()]);
    setLoading(false);
  }, [loadConversations, loadInvitations, loadStoryRings]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  useFocusEffect(
    useCallback(() => {
      loadAll();
    }, [loadAll]),
  );

  const onRefresh = async () => {
    setRefreshing(true);
    setStoriesRefresh((value) => value + 1);
    await loadAll();
    setRefreshing(false);
  };

  const openConversation = useCallback((item: ConvItem) => {
    if (item.invitationStatus === 'pending') {
      navigation.navigate('NewConversation', { initialTab: 'invites' });
      return;
    }
    navigation.navigate('ConversationThread', {
      conversationId: item.id,
      userId: item.userId,
      title: item.displayName,
      username: item.username,
      otherUserId: item.otherUserId,
      avatar: item.avatar,
      verified: !!item.verified,
      verificationStyle: item.verificationStyle || 'default',
      isGroup: !!item.isGroup,
      memberCount: item.memberCount || 0,
    });
  }, [navigation]);

  const openProfile = (author: { id: string; username: string }) => {
    navigation.navigate('UserProfile', { userId: author.id, username: author.username });
  };

  const sendStoryReply = async (author: { id: string; username: string }, text: string) => {
    if (!text.trim()) {
      navigation.navigate('UserProfile', { userId: author.id, username: author.username });
      return;
    }
    try {
      await apiService.post(`/api/messages/direct/${author.id}`, { content: text.trim() });
      await loadConversations();
    } catch {
      // Silencieux : la story reste ouverte, l'utilisateur peut réessayer.
    }
  };

  const visibleConversations = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return conversations.filter((item) => {
      // « Général » regroupe les conversations sans réponse de ma part et les
      // comptes automatiques ; « Principal » garde les échanges actifs.
      const isGeneral = item.isAI || item.invitationStatus !== 'accepted';
      if (tab === 'primary' && isGeneral) return false;
      if (tab === 'general' && !isGeneral) return false;
      if (!query) return true;
      return (
        item.displayName.toLowerCase().includes(query) ||
        item.username.toLowerCase().includes(query) ||
        item.lastMessage.toLowerCase().includes(query)
      );
    });
  }, [conversations, searchQuery, tab]);

  const generalCount = useMemo(
    () => conversations.filter((item) => item.isAI || item.invitationStatus !== 'accepted').length,
    [conversations],
  );

  /**
   * Mémoïsé : sans identité stable, chaque frappe dans la recherche re-rendait
   * toutes les lignes montées de la liste.
   */
  const renderConversation = useCallback(({ item }: { item: ConvItem }) => {
    const avatarUri = getAvatarUri(item.avatar);
    const targetId = item.otherUserId ? String(item.otherUserId) : '';
    const hasStory = !item.isGroup && !!targetId && storyUserIds.has(targetId);

    return (
      <TouchableOpacity style={styles.row} onPress={() => openConversation(item)} activeOpacity={0.65}>
        <View style={styles.rowAvatar}>
          <StoryRing
            size={56}
            uri={avatarUri}
            label={item.displayName}
            hasStory={hasStory}
            seen={hasStory && !unseenStoryUserIds.has(targetId)}
            gapColor={colors.bg}
          />
          {item.isAI && (
            <View style={styles.aiBadge}>
              <Ionicons name="sparkles" size={9} color="#fff" />
            </View>
          )}
          {item.isGroup && (
            <View style={styles.groupBadge}>
              <Ionicons name="people" size={10} color="#fff" />
            </View>
          )}
        </View>

        <View style={styles.rowBody}>
          <View style={styles.rowNameLine}>
            <PremiumDisplayName
              text={item.displayName}
              baseStyle={{
                ...styles.rowName,
                ...(item.unread ? styles.rowNameUnread : null),
              }}
              isPremium={false}
              fontId="system"
              effectId="none"
              numberOfLines={1}
              customization={item.customization}
              verified={!!item.verified}
              verificationStyle={item.verificationStyle as any}
            />
            {item.verified && (
              <VerifiedBadge
                verificationStyle={item.verificationStyle as any}
                size={13}
                tint={certifiedNameColors(item.verificationStyle as any, item.customization).from}
              />
            )}
          </View>
          <Text style={[styles.rowPreview, item.unread && styles.rowPreviewUnread]} numberOfLines={1}>
            {item.lastMessageFromMe ? `Vous : ${item.lastMessage}` : item.lastMessage}
            <Text style={styles.rowTime}>{`  ·  ${formatRelativeTime(item.lastTs)}`}</Text>
          </Text>
        </View>

        <View style={styles.rowTrailing}>
          {item.unread ? (
            <View style={styles.unreadDot} />
          ) : (
            <Ionicons name="camera-outline" size={23} color={colors.textSecondary} />
          )}
        </View>
      </TouchableOpacity>
    );
  }, [storyUserIds, unseenStoryUserIds, openConversation]);

  return (
    <ScreenBackground>
      {/* `SafeAreaView` vient de `react-native-safe-area-context`, PAS du coeur
          de React Native : celle du coeur ne pose aucun inset sur Android, et
          le contenu passait sous la barre de statut. `edges={['top']}` parce
          que le bas est deja gere par la barre d'onglets, en position
          absolue. */}
      <SafeAreaView style={styles.container} edges={['top']}>
        <AppStatusBar />

        {/* ── Header Instagram : identité à gauche, actions à droite ── */}
        <View style={styles.header}>
          {navigation.canGoBack?.() ? (
            <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={hitSlop} style={styles.headerBack}>
              <Ionicons name="chevron-back" size={28} color={colors.textPrimary} />
            </TouchableOpacity>
          ) : (
            <View style={styles.headerBackSpacer} />
          )}

          <TouchableOpacity
            style={styles.headerIdentity}
            activeOpacity={0.7}
            onPress={() => navigation.navigate('Profil')}
          >
            <Text style={styles.headerUsername} numberOfLines={1}>
              {me?.username || 'messages'}
            </Text>
            <Ionicons name="chevron-down" size={16} color={colors.textPrimary} />
          </TouchableOpacity>

          <View style={styles.headerActions}>
            <TouchableOpacity
              hitSlop={hitSlop}
              onPress={() => navigation.navigate('NewConversation')}
              style={styles.headerAction}
            >
              <Ionicons name="create-outline" size={25} color={colors.textPrimary} />
            </TouchableOpacity>
          </View>
        </View>

        <BanAlertBanner />

        <FlatList
          data={visibleConversations}
          keyExtractor={(item) => item.id}
          renderItem={renderConversation}
          // La route `/api/messages/conversations` ne pagine pas côté serveur :
          // un compte ancien télécharge TOUTES ses conversations à chaque
          // ouverture de l'onglet. Le réglage de fenêtre borne au moins ce qui
          // est monté ; le plafonnement de la réponse reste à faire côté API.
          {...LIST_TUNING}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <AppRefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
          ListHeaderComponent={
            <View>
              {/* Recherche */}
              <View style={styles.searchWrap}>
                <View style={styles.searchBar}>
                  <Ionicons name="search" size={17} color={colors.textMuted} />
                  <TextInput
                    style={styles.searchInput}
                    value={searchQuery}
                    onChangeText={setSearchQuery}
                    placeholder="Rechercher"
                    placeholderTextColor={colors.textMuted}
                  />
                  {searchQuery.length > 0 && (
                    <TouchableOpacity onPress={() => setSearchQuery('')} hitSlop={hitSlop}>
                      <Ionicons name="close-circle" size={17} color={colors.textMuted} />
                    </TouchableOpacity>
                  )}
                </View>
              </View>

              {/* Stories — mêmes anneaux que le fil, accessibles depuis Direct */}
              <StoriesTray
                currentUser={me}
                refreshSignal={storiesRefresh}
                backgroundColor={colors.bg}
                style={styles.tray}
                onOpenProfile={openProfile}
                onSendMessage={sendStoryReply}
              />

              {/* Onglets Principal / Général */}
              <View style={styles.tabs}>
                {(['primary', 'general'] as const).map((value) => (
                  <TouchableOpacity
                    key={value}
                    style={styles.tab}
                    onPress={() => setTab(value)}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.tabLabel, tab === value && styles.tabLabelActive]}>
                      {value === 'primary' ? 'Principal' : 'Général'}
                      {value === 'general' && generalCount > 0 ? ` (${generalCount})` : ''}
                    </Text>
                    <View style={[styles.tabUnderline, tab === value && styles.tabUnderlineActive]} />
                  </TouchableOpacity>
                ))}
              </View>

              {/* Demandes de messages */}
              {invitations.length > 0 && (
                <TouchableOpacity
                  style={styles.requestsRow}
                  activeOpacity={0.7}
                  onPress={() => navigation.navigate('NewConversation', { initialTab: 'invites' })}
                >
                  <View style={styles.requestsIcon}>
                    <Ionicons name="mail-unread-outline" size={22} color={colors.textPrimary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.requestsTitle}>Demandes de messages</Text>
                    <Text style={styles.requestsSubtitle}>
                      {invitations.length} nouvelle{invitations.length > 1 ? 's' : ''} demande
                      {invitations.length > 1 ? 's' : ''}
                    </Text>
                  </View>
                  <View style={styles.requestsCount}>
                    <Text style={styles.requestsCountText}>{invitations.length}</Text>
                  </View>
                </TouchableOpacity>
              )}

              {loading && conversations.length === 0 && (
                <ScreenSkeleton variant="list" count={7} />
              )}
            </View>
          }
          ListEmptyComponent={
            loading ? null : (
              <View style={styles.emptyWrap}>
                <View style={styles.emptyIcon}>
                  <Ionicons name="chatbubble-outline" size={38} color={colors.textPrimary} />
                </View>
                <Text style={styles.emptyTitle}>
                  {tab === 'primary' ? 'Aucun message' : 'Rien dans Général'}
                </Text>
                <Text style={styles.emptySubtitle}>
                  Envoie un message privé à une personne que tu suis pour démarrer une conversation.
                </Text>
                <TouchableOpacity
                  style={styles.emptyCta}
                  onPress={() => navigation.navigate('NewConversation')}
                  activeOpacity={0.85}
                >
                  <Text style={styles.emptyCtaText}>Envoyer un message</Text>
                </TouchableOpacity>
              </View>
            )
          }
        />
      </SafeAreaView>
    </ScreenBackground>
  );
}

const hitSlop = { top: 10, bottom: 10, left: 10, right: 10 };

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: 'transparent' },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 10,
  },
  headerBack: { padding: 4 },
  headerBackSpacer: { width: 8 },
  headerIdentity: { flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1, paddingLeft: 4 },
  headerUsername: {
    color: colors.textPrimary,
    fontSize: 21,
    fontFamily: fonts.displayHeavy,
    letterSpacing: -0.4,
    maxWidth: '80%',
  },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 18, paddingRight: 10 },
  headerAction: { padding: 2 },

  listContent: { paddingBottom: 110 },

  searchWrap: { paddingHorizontal: 14, paddingBottom: 10 },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.surfaceAlt,
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 40,
  },
  searchInput: { flex: 1, color: colors.textPrimary, fontSize: 15, padding: 0 },

  tray: { borderBottomWidth: 0, paddingVertical: 6 },

  tabs: {
    flexDirection: 'row',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  tab: { flex: 1, alignItems: 'center' },
  tabLabel: {
    color: colors.textMuted,
    fontSize: 14,
    fontFamily: fonts.semibold,
    paddingVertical: 12,
  },
  tabLabelActive: { color: colors.textPrimary },
  tabUnderline: { height: 1.5, width: '100%', backgroundColor: 'transparent' },
  tabUnderlineActive: { backgroundColor: colors.textPrimary },

  requestsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  requestsIcon: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  requestsTitle: { color: colors.textPrimary, fontSize: 15, fontFamily: fonts.semibold },
  requestsSubtitle: { color: colors.accent, fontSize: 13, marginTop: 2, fontFamily: fonts.regular },
  requestsCount: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    paddingHorizontal: 6,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  requestsCountText: { color: '#fff', fontSize: 12, fontFamily: fonts.bold },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  rowAvatar: { marginRight: 12 },
  aiBadge: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.bg,
  },
  groupBadge: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    width: 19,
    height: 19,
    borderRadius: 10,
    backgroundColor: colors.surfaceElevated,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.bg,
  },
  rowBody: { flex: 1, marginRight: 10 },
  rowNameLine: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  rowName: {
    color: colors.textPrimary,
    fontSize: 15,
    fontFamily: fonts.regular,
    flexShrink: 1,
  },
  rowNameUnread: { fontFamily: fonts.bold },
  rowPreview: {
    color: colors.textMuted,
    fontSize: 14,
    marginTop: 3,
    fontFamily: fonts.regular,
  },
  rowPreviewUnread: { color: colors.textPrimary, fontFamily: fonts.semibold },
  rowTime: { color: colors.textMuted, fontFamily: fonts.regular },
  rowTrailing: { width: 26, alignItems: 'flex-end' },
  unreadDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: '#0095F6' },

  loadingWrap: { paddingVertical: 28, alignItems: 'center' },
  emptyWrap: { alignItems: 'center', paddingTop: 52, paddingHorizontal: 40 },
  emptyIcon: {
    width: 78,
    height: 78,
    borderRadius: 39,
    borderWidth: 1.5,
    borderColor: colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  emptyTitle: { color: colors.textPrimary, fontSize: 20, fontFamily: fonts.display },
  emptySubtitle: {
    color: colors.textMuted,
    fontSize: 14,
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 20,
  },
  emptyCta: { marginTop: 18 },
  emptyCtaText: { color: '#0095F6', fontSize: 15, fontFamily: fonts.bold },
});
