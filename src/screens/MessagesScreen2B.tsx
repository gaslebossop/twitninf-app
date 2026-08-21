/**
 * 🧪 Messages « 2B — Gouttière », sous drapeau `fil.refonte2b`.
 *
 * Écrit de zéro, pas cloné : `MessagesScreen.tsx` reste l'écran de tout compte
 * hors du test et n'est jamais touché. Seul le contrat de données lui est
 * repris — mêmes routes API, mêmes paramètres de navigation — parce que deux
 * écrans qui chargent différemment ne se comparent plus.
 *
 * ── L'objet : un REGISTRE de correspondance ──────────────────────────────
 * Pas une pile de cartes de chat. Une page réglée, tenue dans l'ordre, où
 * chaque ligne est un correspondant. Trois choses en découlent, et ce sont
 * elles qui distinguent cet écran du gabarit d'origine :
 *
 *   1. Il est SECTIONNÉ par période — « AUJOURD'HUI », « CETTE SEMAINE »,
 *      « PLUS TÔT ». Un registre se tient dans le temps ; la liste plate
 *      d'origine laissait l'utilisateur dater chaque ligne lui-même.
 *   2. L'horodatage est une VRAIE COLONNE, en chasse fixe, alignée d'une
 *      ligne à l'autre. C'est ce qui rend un registre balayable ; collé en
 *      fin d'aperçu comme avant, il ne s'aligne sur rien.
 *   3. La gouttière de 52 px — celle de `TweetRowGutter` — porte
 *      l'interlocuteur puis l'état de la ligne. Un seul endroit à regarder.
 *
 * ── La grille est celle du fil, au pixel ─────────────────────────────────
 * `GUTTER_W` / `ROW_GAP` / `ROW_PAD_X` viennent de `theme/paper2b`. C'est ce
 * qui fait qu'on ne quitte pas le papier en passant du fil aux messages.
 *
 * ── Ce qui n'existe plus ─────────────────────────────────────────────────
 * L'appareil photo en bout de chaque ligne : à l'échelle d'un écran, vingt-
 * cinq cibles grises pesant autant que les noms — précisément la rangée
 * d'icônes que 2B existe pour supprimer. Les aplats aussi : la recherche est
 * une ligne réglée, les demandes une ligne du registre, le comptage un nombre
 * en chasse fixe. Ce qui structure la page est un filet, jamais une couleur.
 *
 * ── La feuille ───────────────────────────────────────────────────────────
 * `theme/messages2b` et non `paper.bg` : le papier est propre à cet écran, le
 * fil garde le fond de l'app. Voir l'en-tête de ce fichier-là.
 */
import React, { useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  SectionList,
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

import { paper, paperFonts, ps, GUTTER_W, ROW_PAD_X, ROW_GAP } from '../theme/paper2b';
import { sheet } from '../theme/messages2b';
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

/** L'avatar tient dans la gouttière sans la remplir : 46 dans 52. */
const AVATAR = ps(46);

/**
 * Repli quand l'écran est poussé sur la PILE et non monté comme onglet :
 * `Messages` existe aux deux endroits. `BottomTabBarHeightContext` rend
 * `undefined` hors navigateur d'onglets là où `useBottomTabBarHeight` LÈVE
 * (« Couldn't find the bottom tab bar height ») — c'est la forme sûre, celle
 * de `SearchScreen` et `ExploreWall`.
 */
const FALLBACK_TAB_BAR_HEIGHT = 85;

const hitSlop = { top: 10, bottom: 10, left: 10, right: 10 };

const DAY = 86_400_000;

/** Les trois cases du registre, de la plus récente à la plus ancienne. */
const BUCKETS = [
  { key: 'today', title: "AUJOURD'HUI", within: DAY },
  { key: 'week', title: 'CETTE SEMAINE', within: 7 * DAY },
  { key: 'earlier', title: 'PLUS TÔT', within: Infinity },
] as const;

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

/**
 * Horodatage de la COLONNE : court et de largeur stable, parce qu'il doit
 * s'aligner d'une ligne à l'autre. Dans le jour on donne l'heure (`14:05`),
 * au-delà l'âge (`3 j`, `5 sem.`) — la section dit déjà de quelle période
 * on parle, la ligne n'a pas à la répéter.
 */
function formatStamp(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < DAY) {
    const d = new Date(ts);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }
  const days = Math.floor(diff / DAY);
  if (days < 7) return `${days} j`;
  const weeks = Math.floor(days / 7);
  if (weeks < 52) return `${weeks} sem.`;
  return `${Math.floor(days / 365)} an${Math.floor(days / 365) > 1 ? 's' : ''}`;
}

export default function MessagesScreen2B({ navigation }: any) {
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
        const lastTsRaw =
          last?.created_at || last?.createdAt || conv?.updated_at || conv?.updatedAt || conv?.created_at || conv?.createdAt;
        const hasReliableTs = !!lastTsRaw;
        const parsedTs = hasReliableTs ? new Date(lastTsRaw).getTime() : Date.now();
        const safeTs = Number.isFinite(parsedTs) ? parsedTs : Date.now();

        // Pas de `unread_count` côté API : on le déduit de la dernière lecture
        // du membre comparée à la date du dernier message reçu. Si ce message
        // n'a pas de timestamp exploitable, on considère prudemment qu'il n'y a
        // rien de nouveau — retomber sur `Date.now()` rendrait la conversation
        // éternellement « non lue ».
        const myLastReadAt = conv?.last_read_at ? new Date(conv.last_read_at).getTime() : 0;
        const unread =
          !!last && !lastMessageFromMe && hasReliableTs && Number.isFinite(parsedTs) && (!myLastReadAt || safeTs > myLastReadAt);
        const storyReplyPreview =
          lastMetadata.source === 'story_reply'
            ? `${lastMessageFromMe ? 'Réponse à une story' : 'A répondu à votre story'} · ${last?.content || ''}`
            : null;

        const memberCount = isGroup ? participants.length : undefined;

        return {
          id: conv.id,
          userId: isGroup ? undefined : other?.id,
          otherUserId: !isGroup ? other?.id || undefined : undefined,
          username: isGroup ? 'groupe' : other?.username || 'unknown',
          displayName: isGroup ? conv.title || 'Groupe' : other?.full_name || other?.username || 'Conversation',
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
          // L'habillage suit le compte jusque dans le registre. Un groupe n'en
          // a pas : c'est un titre, pas un nom de compte.
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

  /** Anneaux de story sur les avatars du registre, comme dans le fil. */
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

  const openConversation = useCallback(
    (item: ConvItem) => {
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
    },
    [navigation],
  );

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

  /**
   * Le registre, tenu dans le temps. Les conversations arrivent déjà triées du
   * plus récent au plus ancien : il suffit donc de les répartir dans l'ordre,
   * et une case vide ne produit aucune section (pas de titre pendant dans le
   * vide sous la dernière ligne).
   */
  const sections = useMemo(() => {
    const now = Date.now();
    return BUCKETS.map((bucket, index) => {
      const floor = index === 0 ? 0 : BUCKETS[index - 1].within;
      const data = visibleConversations.filter((item) => {
        // Borné à zéro : un message daté dans le futur (horloge serveur en
        // avance) donnerait un âge négatif, ne satisferait aucune case et
        // disparaîtrait du registre au lieu d'être en tête.
        const age = Math.max(0, now - item.lastTs);
        return age >= floor && age < bucket.within;
      });
      return { key: bucket.key, title: bucket.title, data };
    }).filter((section) => section.data.length > 0);
  }, [visibleConversations]);

  const generalCount = useMemo(
    () => conversations.filter((item) => item.isAI || item.invitationStatus !== 'accepted').length,
    [conversations],
  );

  /**
   * Mémoïsé : sans identité stable, chaque frappe dans la recherche re-rendait
   * toutes les lignes montées du registre.
   */
  const renderRow = useCallback(
    ({ item }: { item: ConvItem }) => {
      const avatarUri = getAvatarUri(item.avatar);
      const targetId = item.otherUserId ? String(item.otherUserId) : '';
      const hasStory = !item.isGroup && !!targetId && storyUserIds.has(targetId);

      return (
        <TouchableOpacity style={S.row} onPress={() => openConversation(item)} activeOpacity={0.65}>
          {/* La gouttière : l'interlocuteur, puis l'état de la ligne dessous —
              à la place exacte où une ligne du fil pose son compteur. */}
          <View style={S.gutter}>
            <View style={S.avatarWrap}>
              <StoryRing
                size={AVATAR}
                uri={avatarUri}
                label={item.displayName}
                hasStory={hasStory}
                seen={hasStory && !unseenStoryUserIds.has(targetId)}
                gapColor={sheet.bg}
              />
              {item.isAI && (
                <View style={S.badgeAI}>
                  <Ionicons name="sparkles" size={9} color={paper.onAccent} />
                </View>
              )}
              {item.isGroup && (
                <View style={S.badgeGroup}>
                  <Ionicons name="people" size={10} color={paper.ink} />
                </View>
              )}
            </View>
            {item.unread && <View style={S.unreadDot} />}
          </View>

          <View style={S.content}>
            <View style={S.nameLine}>
              <PremiumDisplayName
                text={item.displayName}
                baseStyle={{ ...S.name, ...(item.unread ? S.nameUnread : null) }}
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
            <Text style={[S.preview, item.unread && S.previewUnread]} numberOfLines={2}>
              {item.lastMessageFromMe ? `Vous : ${item.lastMessage}` : item.lastMessage}
            </Text>
          </View>

          {/* La colonne de dates : largeur fixe, chasse fixe, alignée à droite.
              C'est ce qui la rend balayable — collée en fin d'aperçu, elle ne
              s'alignerait sur rien. */}
          <Text style={S.stamp}>{formatStamp(item.lastTs)}</Text>
        </TouchableOpacity>
      );
    },
    [storyUserIds, unseenStoryUserIds, openConversation],
  );

  const renderSectionHeader = useCallback(
    ({ section }: { section: { title: string } }) => <Text style={S.sectionTitle}>{section.title}</Text>,
    [],
  );

  return (
    // Pas de `ScreenBackground` : il peint `colors.bg` en dur, le fond de
    // l'app. La feuille se pose à plat, comme `FeedGutterScreen` pose la sienne.
    <View style={S.root}>
      <SafeAreaView style={S.container} edges={['top']}>
        <AppStatusBar />

        {/* Un titre et une action, sur un filet. */}
        <View style={S.header}>
          {navigation.canGoBack?.() ? (
            <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={hitSlop} style={S.headerBack}>
              <Ionicons name="chevron-back" size={26} color={paper.ink} />
            </TouchableOpacity>
          ) : null}
          <Text style={S.headerTitle}>Messages</Text>
          <TouchableOpacity
            hitSlop={hitSlop}
            onPress={() => navigation.navigate('NewConversation')}
            style={S.headerAction}
          >
            <Ionicons name="create-outline" size={24} color={paper.ink} />
          </TouchableOpacity>
        </View>

        <BanAlertBanner />

        <SectionList
          sections={sections}
          keyExtractor={(item) => item.id}
          renderItem={renderRow}
          renderSectionHeader={renderSectionHeader}
          stickySectionHeadersEnabled={false}
          {...LIST_TUNING}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[S.listContent, { paddingBottom: tabBarHeight + ps(16) }]}
          refreshControl={<AppRefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          ListHeaderComponent={
            <View>
              {/* Recherche : une ligne réglée, pas une boîte grise. */}
              <View style={S.searchWrap}>
                <View style={S.searchBar}>
                  <Ionicons name="search" size={16} color={sheet.inkMeta} />
                  <TextInput
                    style={S.searchInput}
                    value={searchQuery}
                    onChangeText={setSearchQuery}
                    placeholder="Rechercher"
                    placeholderTextColor={sheet.inkMeta}
                  />
                  {searchQuery.length > 0 && (
                    <TouchableOpacity onPress={() => setSearchQuery('')} hitSlop={hitSlop}>
                      <Ionicons name="close-circle" size={17} color={sheet.inkMeta} />
                    </TouchableOpacity>
                  )}
                </View>
              </View>

              <StoriesTray
                currentUser={me}
                refreshSignal={storiesRefresh}
                backgroundColor={sheet.bg}
                style={S.tray}
                onOpenProfile={openProfile}
                onSendMessage={sendStoryReply}
              />

              {/* Onglets en capitales espacées : la voix des métas de 2B. */}
              <View style={S.tabs}>
                {(['primary', 'general'] as const).map((value) => (
                  <TouchableOpacity
                    key={value}
                    style={S.tab}
                    onPress={() => setTab(value)}
                    activeOpacity={0.7}
                  >
                    <Text style={[S.tabLabel, tab === value && S.tabLabelActive]}>
                      {value === 'primary' ? 'PRINCIPAL' : 'GÉNÉRAL'}
                      {value === 'general' && generalCount > 0 ? ` ${generalCount}` : ''}
                    </Text>
                    <View style={[S.tabRule, tab === value && S.tabRuleActive]} />
                  </TouchableOpacity>
                ))}
              </View>

              {invitations.length > 0 && (
                <TouchableOpacity
                  style={S.requestRow}
                  activeOpacity={0.7}
                  onPress={() => navigation.navigate('NewConversation', { initialTab: 'invites' })}
                >
                  {/* L'icône tient la gouttière comme un avatar : les demandes
                      sont une ligne du registre, pas un encart posé dessus. */}
                  <View style={S.requestIcon}>
                    <Ionicons name="mail-unread-outline" size={21} color={paper.ink} />
                  </View>
                  <View style={S.content}>
                    <Text style={S.requestTitle}>Demandes de messages</Text>
                    <Text style={S.requestSub}>
                      {invitations.length} nouvelle{invitations.length > 1 ? 's' : ''} demande
                      {invitations.length > 1 ? 's' : ''}
                    </Text>
                  </View>
                  {/* Un nombre, pas une pastille pleine : rien à toucher ici. */}
                  <Text style={S.requestCount}>{invitations.length}</Text>
                </TouchableOpacity>
              )}

              {loading && conversations.length === 0 && <ScreenSkeleton variant="list" count={7} />}
            </View>
          }
          ListEmptyComponent={
            loading ? null : (
              <View style={S.emptyWrap}>
                <Text style={S.emptyTitle}>
                  {searchQuery.trim()
                    ? 'Rien à ce nom'
                    : tab === 'primary'
                      ? 'Registre vide'
                      : 'Rien dans Général'}
                </Text>
                <Text style={S.emptySub}>
                  {searchQuery.trim()
                    ? 'Aucune conversation ne porte ces mots.'
                    : 'Envoie un message privé à une personne que tu suis pour ouvrir une première ligne.'}
                </Text>
                {!searchQuery.trim() && (
                  <TouchableOpacity
                    style={S.emptyCta}
                    onPress={() => navigation.navigate('NewConversation')}
                    activeOpacity={0.85}
                  >
                    <Text style={S.emptyCtaText}>Écrire à quelqu'un</Text>
                  </TouchableOpacity>
                )}
              </View>
            )
          }
        />
      </SafeAreaView>
    </View>
  );
}

/** Largeur de la colonne de dates. Fixe, sinon elle cesse d'être une colonne. */
const STAMP_W = ps(46);

const S = StyleSheet.create({
  root: { flex: 1, backgroundColor: sheet.bg },
  container: { flex: 1, backgroundColor: 'transparent' },

  // ── En-tête ──
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: ROW_PAD_X,
    paddingTop: ps(6),
    paddingBottom: ps(12),
    borderBottomWidth: 1,
    borderBottomColor: paper.hairline,
  },
  headerBack: { padding: ps(4), marginLeft: ps(-8), marginRight: ps(2) },
  headerTitle: {
    flex: 1,
    color: paper.ink,
    fontSize: ps(26),
    fontFamily: paperFonts.display,
    letterSpacing: ps(-0.6),
  },
  headerAction: { padding: ps(4), marginRight: ps(-4) },

  listContent: {},

  // ── Recherche ──
  // Un filet seul (l'essai d'origine) se lisait collé à celui de l'en-tête,
  // deux traits à ps(14) l'un de l'autre sans rien pour les séparer. Une
  // recherche a besoin d'être reconnue comme une zone qu'on touche, pas comme
  // une ligne de plus du registre : `sheet.band`, le même cran de fond que le
  // champ du compositeur des messages, lui donne ce contour.
  searchWrap: { paddingHorizontal: ROW_PAD_X, paddingTop: ps(18), paddingBottom: ps(8) },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: ps(9),
    backgroundColor: sheet.band,
    borderRadius: ps(12),
    paddingHorizontal: ps(13),
    paddingVertical: ps(10),
  },
  searchInput: {
    flex: 1,
    color: paper.ink,
    fontSize: ps(16),
    fontFamily: paperFonts.body,
    padding: 0,
  },

  tray: { borderBottomWidth: 0, paddingVertical: ps(8) },

  // ── Onglets ──
  tabs: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: paper.hairline },
  tab: { flex: 1, alignItems: 'center' },
  tabLabel: {
    color: paper.inkIdle,
    fontSize: ps(11),
    letterSpacing: ps(1.5),
    fontFamily: paperFonts.mono,
    paddingVertical: ps(13),
  },
  tabLabelActive: { color: paper.ink },
  tabRule: { height: 1.5, width: '100%', backgroundColor: 'transparent' },
  tabRuleActive: { backgroundColor: paper.ink },

  // ── Titre de section : la période, dans la voix des métas ──
  sectionTitle: {
    color: sheet.inkMeta,
    fontSize: ps(10),
    letterSpacing: ps(1.5),
    fontFamily: paperFonts.mono,
    paddingHorizontal: ROW_PAD_X,
    paddingTop: ps(22),
    paddingBottom: ps(10),
  },

  // ── Demandes : une ligne du registre ──
  requestRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: ROW_GAP,
    paddingHorizontal: ROW_PAD_X,
    paddingTop: ps(16),
    paddingBottom: ps(16),
  },
  requestIcon: { width: GUTTER_W, alignItems: 'center' },
  requestTitle: { color: paper.ink, fontSize: ps(16), fontFamily: paperFonts.strong },
  requestSub: {
    color: sheet.inkMeta,
    fontSize: ps(13),
    marginTop: ps(2),
    fontFamily: paperFonts.body,
  },
  requestCount: { color: paper.accent, fontSize: ps(14), fontFamily: paperFonts.monoStrong },

  // ── La ligne, dans la grille exacte du fil ──
  // Pas de filet entre deux lignes : le fil 2B n'en pose pas, le rythme vient
  // du rembourrage et de la colonne. Ce sont les titres de période qui
  // découpent la page — un filet par ligne la rouvrirait en tranches.
  row: {
    flexDirection: 'row',
    gap: ROW_GAP,
    paddingHorizontal: ROW_PAD_X,
    paddingTop: ps(13),
    paddingBottom: ps(13),
  },
  gutter: { width: GUTTER_W, alignItems: 'center' },
  avatarWrap: { width: AVATAR, height: AVATAR },
  badgeAI: {
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
    borderColor: sheet.bg,
  },
  badgeGroup: {
    position: 'absolute',
    right: ps(-1),
    bottom: 0,
    width: ps(19),
    height: ps(19),
    borderRadius: ps(10),
    backgroundColor: sheet.band,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: sheet.bg,
  },
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
  preview: {
    color: sheet.inkMeta,
    fontSize: ps(14),
    lineHeight: ps(19),
    marginTop: ps(3),
    fontFamily: paperFonts.body,
  },
  previewUnread: { color: paper.ink, fontFamily: paperFonts.bodyStrong },

  stamp: {
    width: STAMP_W,
    textAlign: 'right',
    color: sheet.inkMeta,
    fontSize: ps(11),
    fontFamily: paperFonts.mono,
    marginTop: ps(2),
  },

  // ── Vide ──
  emptyWrap: { alignItems: 'center', paddingTop: ps(64), paddingHorizontal: ps(44) },
  emptyTitle: {
    color: paper.ink,
    fontSize: ps(22),
    fontFamily: paperFonts.display,
    letterSpacing: ps(-0.5),
  },
  emptySub: {
    color: sheet.inkMeta,
    fontSize: ps(15),
    textAlign: 'center',
    marginTop: ps(10),
    lineHeight: ps(21),
    fontFamily: paperFonts.body,
  },
  emptyCta: { marginTop: ps(20) },
  emptyCtaText: { color: paper.accent, fontSize: ps(15), fontFamily: paperFonts.strong },
});
