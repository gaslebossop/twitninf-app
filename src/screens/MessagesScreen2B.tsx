/**
 * 🧪 Liste des conversations « 2B — Gouttière », sous drapeau `fil.refonte2b`.
 *
 * CLONE de `MessagesScreen.tsx`. Toute la logique — chargement des
 * conversations, invitations, anneaux de story, recherche, tabulation
 * Principal/Général — est reprise telle quelle et doit le RESTER. L'original
 * n'est pas touché ; il continue de servir tout compte sans le drapeau.
 *
 * ── L'objet : un REGISTRE de correspondance ──────────────────────────────
 * Pas une pile de cartes de chat. Une page réglée où chaque ligne est un
 * correspondant : qui, ce qui s'est dit en dernier, et quand. La refonte ne
 * s'arrête donc pas à la couleur — la page entre dans la MÊME grille que le
 * fil (`GUTTER_W` / `ROW_GAP` / `ROW_PAD_X`), sinon on quitte le papier au
 * premier onglet.
 *
 * ── Ce que la gouttière porte ici ────────────────────────────────────────
 * Dans le fil, la colonne de 52 px porte le cœur et son compteur. Ici elle
 * porte l'interlocuteur (avatar + anneau de story) et, juste dessous, l'état
 * de la ligne : la pastille de non-lu, à l'endroit EXACT où une ligne du fil
 * pose son compteur. Un seul endroit à regarder pour savoir où on en est.
 *
 * ── Ce qui disparaît ─────────────────────────────────────────────────────
 * L'icône d'appareil photo en bout de chaque ligne. À l'échelle d'un écran
 * c'était vingt-cinq cibles grises pesant autant que les noms — précisément
 * la rangée d'icônes que 2B existe pour supprimer (voir `TweetRowGutter`).
 * Le raccourci reste accessible depuis la story de la personne.
 *
 * Et les aplats : la barre de recherche grise devient une ligne réglée, le
 * bandeau des demandes une ligne de la même grille, la pastille de comptage
 * un nombre en chasse fixe. Ce qui structure la page est un filet, jamais
 * une couleur — c'est la règle de `TweetDetailGutterScreen`.
 */
import React, { useCallback, useContext, useEffect, useMemo, useState } from 'react';
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
import { BottomTabBarHeightContext } from '@react-navigation/bottom-tabs';
import { statusBarStyle } from '../theme';
import { paper, paperFonts, ps, GUTTER_W, ROW_PAD_X, ROW_GAP } from '../theme/paper2b';
import { AppStatusBar, ScreenSkeleton, AppRefreshControl } from '../components/ui';
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

/**
 * Repli quand l'écran est poussé sur la PILE et non monté comme onglet :
 * `Messages` existe aux deux endroits (route de `MainStack` + onglet optionnel
 * de `BottomTabNavigator2B`), et c'est la même hauteur que le reste de l'app
 * (`SearchScreen`, `ExploreWall`).
 */
const FALLBACK_TAB_BAR_HEIGHT = 85;

export default function MessagesScreen2B({ navigation }: any) {
  /**
   * `BottomTabBarHeightContext` rend `undefined` hors navigateur d'onglets ;
   * `useBottomTabBarHeight` LÈVE (« Couldn't find the bottom tab bar height »).
   * L'original utilise le hook qui lève alors que son propre commentaire
   * décrit ce contexte-ci — le bug ne se voyait pas tant que `Messages`
   * n'était atteint que par l'onglet.
   */
  const tabBarHeight = useContext(BottomTabBarHeightContext) ?? FALLBACK_TAB_BAR_HEIGHT;

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

  const renderConversation = useCallback(({ item }: { item: ConvItem }) => {
    const avatarUri = getAvatarUri(item.avatar);
    const targetId = item.otherUserId ? String(item.otherUserId) : '';
    const hasStory = !item.isGroup && !!targetId && storyUserIds.has(targetId);

    return (
      <TouchableOpacity style={styles.row} onPress={() => openConversation(item)} activeOpacity={0.65}>
        {/* La gouttière : l'interlocuteur, puis l'état de la ligne dessous. */}
        <View style={styles.gutter}>
          <View style={styles.avatarWrap}>
          <StoryRing
            size={AVATAR}
            uri={avatarUri}
            label={item.displayName}
            hasStory={hasStory}
            seen={hasStory && !unseenStoryUserIds.has(targetId)}
            gapColor={paper.bg}
          />
          {item.isAI && (
            <View style={styles.aiBadge}>
              <Ionicons name="sparkles" size={9} color={paper.onAccent} />
            </View>
          )}
          {item.isGroup && (
            <View style={styles.groupBadge}>
              <Ionicons name="people" size={10} color={paper.ink} />
            </View>
          )}
          </View>
          {/* Même place que le compteur d'une ligne du fil. */}
          {item.unread && <View style={styles.unreadDot} />}
        </View>

        <View style={styles.content}>
          <View style={styles.nameLine}>
            <PremiumDisplayName
              text={item.displayName}
              baseStyle={{
                ...styles.name,
                ...(item.unread ? styles.nameUnread : null),
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
            {/* L'horodatage tient le bord droit, en chasse fixe : une colonne
                de dates ne se balaie que si les chiffres s'alignent. */}
            <Text style={styles.time}>{formatRelativeTime(item.lastTs)}</Text>
          </View>
          <Text style={[styles.preview, item.unread && styles.previewUnread]} numberOfLines={2}>
            {item.lastMessageFromMe ? `Vous : ${item.lastMessage}` : item.lastMessage}
          </Text>
        </View>
      </TouchableOpacity>
    );
  }, [storyUserIds, unseenStoryUserIds, openConversation]);

  return (
    // Pas de `ScreenBackground` ici : il peint `colors.bg` en dur (le fond
    // « Pulse »), ce qui recouvrait le papier. 2B pose le sien à plat,
    // exactement comme `FeedGutterScreen` et `TweetDetailGutterScreen`.
    <View style={styles.root}>
      <SafeAreaView style={styles.container} edges={['top']}>
        <AppStatusBar />

        {/* Un chevron, un titre, sur un filet — comme la publication ouverte.
            Le chevron « ▾ » décoratif à côté du pseudo est retiré : il
            n'ouvrait rien, la ligne entière menait déjà au profil. */}
        <View style={styles.header}>
          {navigation.canGoBack?.() ? (
            <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={hitSlop} style={styles.headerBack}>
              <Ionicons name="chevron-back" size={28} color={paper.ink} />
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
          </TouchableOpacity>

          <View style={styles.headerActions}>
            <TouchableOpacity
              hitSlop={hitSlop}
              onPress={() => navigation.navigate('NewConversation')}
              style={styles.headerAction}
            >
              <Ionicons name="create-outline" size={25} color={paper.ink} />
            </TouchableOpacity>
          </View>
        </View>

        <BanAlertBanner />

        <FlatList
          data={visibleConversations}
          keyExtractor={(item) => item.id}
          renderItem={renderConversation}
          {...LIST_TUNING}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[styles.listContent, { paddingBottom: tabBarHeight ? tabBarHeight + 16 : 24 }]}
          refreshControl={
            <AppRefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
          ListHeaderComponent={
            <View>
              {/* Recherche */}
              <View style={styles.searchWrap}>
                <View style={styles.searchBar}>
                  <Ionicons name="search" size={17} color={paper.inkMeta} />
                  <TextInput
                    style={styles.searchInput}
                    value={searchQuery}
                    onChangeText={setSearchQuery}
                    placeholder="Rechercher"
                    placeholderTextColor={paper.inkMeta}
                  />
                  {searchQuery.length > 0 && (
                    <TouchableOpacity onPress={() => setSearchQuery('')} hitSlop={hitSlop}>
                      <Ionicons name="close-circle" size={17} color={paper.inkMeta} />
                    </TouchableOpacity>
                  )}
                </View>
              </View>

              {/* Stories — mêmes anneaux que le fil, accessibles depuis Direct */}
              <StoriesTray
                currentUser={me}
                refreshSignal={storiesRefresh}
                backgroundColor={paper.bg}
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
                      {value === 'primary' ? 'PRINCIPAL' : 'GÉNÉRAL'}
                      {value === 'general' && generalCount > 0 ? ` ${generalCount}` : ''}
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
                  {/* L'icône tient la gouttière, comme un avatar : la ligne
                      des demandes est une ligne du registre, pas un encart. */}
                  <View style={styles.requestsIcon}>
                    <Ionicons name="mail-unread-outline" size={22} color={paper.ink} />
                  </View>
                  <View style={styles.content}>
                    <Text style={styles.requestsTitle}>Demandes de messages</Text>
                    <Text style={styles.requestsSubtitle}>
                      {invitations.length} nouvelle{invitations.length > 1 ? 's' : ''} demande
                      {invitations.length > 1 ? 's' : ''}
                    </Text>
                  </View>
                  {/* Un nombre, pas une pastille pleine : rien à toucher ici. */}
                  <Text style={styles.requestsCount}>{invitations.length}</Text>
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
    </View>
  );
}

/** L'avatar tient dans la gouttière sans la remplir : 46 dans 52. */
const AVATAR = ps(46);

const hitSlop = { top: 10, bottom: 10, left: 10, right: 10 };

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: paper.bg },
  container: { flex: 1, backgroundColor: 'transparent' },

  // ── En-tête : un filet, jamais un aplat ──
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: ps(14),
    paddingVertical: ps(10),
    borderBottomWidth: 1,
    borderBottomColor: paper.hairline,
  },
  headerBack: { padding: ps(4), marginLeft: ps(-4) },
  headerBackSpacer: { width: ps(2) },
  headerIdentity: { flexDirection: 'row', alignItems: 'center', flex: 1, paddingLeft: ps(2) },
  headerUsername: {
    color: paper.ink,
    fontSize: ps(21),
    fontFamily: paperFonts.display,
    letterSpacing: ps(-0.42),
    maxWidth: '86%',
  },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: ps(18) },
  headerAction: { padding: ps(2) },

  listContent: {},

  // ── Recherche : une ligne réglée, pas une boîte grise ──
  searchWrap: { paddingHorizontal: ROW_PAD_X, paddingTop: ps(12), paddingBottom: ps(4) },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: ps(9),
    borderBottomWidth: 1,
    borderBottomColor: paper.hairline,
    paddingBottom: ps(9),
  },
  searchInput: {
    flex: 1,
    color: paper.ink,
    fontSize: ps(16),
    fontFamily: paperFonts.body,
    padding: 0,
  },

  tray: { borderBottomWidth: 0, paddingVertical: ps(8) },

  // ── Onglets : la voix des méta de 2B, capitales espacées en chasse fixe ──
  tabs: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: paper.hairline,
  },
  tab: { flex: 1, alignItems: 'center' },
  tabLabel: {
    color: paper.inkIdle,
    fontSize: ps(11),
    letterSpacing: ps(1.5),
    fontFamily: paperFonts.mono,
    paddingVertical: ps(13),
  },
  tabLabelActive: { color: paper.ink },
  tabUnderline: { height: 1.5, width: '100%', backgroundColor: 'transparent' },
  tabUnderlineActive: { backgroundColor: paper.ink },

  // ── Demandes : une ligne du registre ──
  requestsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: ROW_GAP,
    paddingHorizontal: ROW_PAD_X,
    paddingTop: ps(14),
    paddingBottom: ps(14),
  },
  requestsIcon: { width: GUTTER_W, alignItems: 'center' },
  requestsTitle: { color: paper.ink, fontSize: ps(16), fontFamily: paperFonts.strong },
  requestsSubtitle: {
    color: paper.inkMeta,
    fontSize: ps(13),
    marginTop: ps(2),
    fontFamily: paperFonts.body,
  },
  requestsCount: { color: paper.accent, fontSize: ps(14), fontFamily: paperFonts.monoStrong },

  // ── La ligne, dans la grille exacte du fil ──
  // Pas de filet entre deux lignes : le fil 2B n'en pose pas non plus, le
  // rythme vient du rembourrage et de la colonne. En ajouter ici rouvrirait
  // la page en tranches et casserait l'accord avec le fil.
  row: {
    flexDirection: 'row',
    gap: ROW_GAP,
    paddingHorizontal: ROW_PAD_X,
    paddingTop: ps(13),
    paddingBottom: ps(13),
  },
  gutter: { width: GUTTER_W, alignItems: 'center' },
  avatarWrap: { width: AVATAR, height: AVATAR },
  aiBadge: {
    position: 'absolute',
    right: ps(-1),
    bottom: 0,
    width: ps(18),
    height: ps(18),
    borderRadius: ps(9),
    backgroundColor: paper.accent,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: paper.bg,
  },
  groupBadge: {
    position: 'absolute',
    right: ps(-1),
    bottom: 0,
    width: ps(19),
    height: ps(19),
    borderRadius: ps(10),
    backgroundColor: paper.bgBand,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: paper.bg,
  },
  // La pastille de non-lu se pose SOUS l'avatar, dans la colonne — là où une
  // ligne du fil pose son compteur de cœurs.
  unreadDot: {
    width: ps(7),
    height: ps(7),
    borderRadius: ps(4),
    backgroundColor: paper.accent,
    marginTop: ps(7),
  },

  content: { flex: 1, minWidth: 0 },
  nameLine: { flexDirection: 'row', alignItems: 'center', gap: ps(5) },
  name: {
    color: paper.ink,
    fontSize: ps(16),
    fontFamily: paperFonts.body,
    letterSpacing: ps(-0.3),
    flexShrink: 1,
  },
  nameUnread: { fontFamily: paperFonts.strong },
  time: {
    color: paper.inkMeta,
    fontSize: ps(11),
    fontFamily: paperFonts.mono,
    marginLeft: 'auto',
    paddingLeft: ps(8),
  },
  preview: {
    color: paper.inkMeta,
    fontSize: ps(14),
    lineHeight: ps(19),
    marginTop: ps(3),
    fontFamily: paperFonts.body,
  },
  previewUnread: { color: paper.ink, fontFamily: paperFonts.bodyStrong },

  emptyWrap: { alignItems: 'center', paddingTop: ps(56), paddingHorizontal: ps(44) },
  emptyTitle: {
    color: paper.ink,
    fontSize: ps(22),
    fontFamily: paperFonts.display,
    letterSpacing: ps(-0.5),
  },
  emptySubtitle: {
    color: paper.inkMeta,
    fontSize: ps(15),
    textAlign: 'center',
    marginTop: ps(10),
    lineHeight: ps(21),
    fontFamily: paperFonts.body,
  },
  emptyCta: { marginTop: ps(20) },
  emptyCtaText: { color: paper.accent, fontSize: ps(15), fontFamily: paperFonts.strong },
});
