# Messages « 2B — Gouttière » Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Clone `MessagesScreen.tsx` (liste des conversations) and `ConversationThreadScreen.tsx` (fil de messages) into `MessagesScreen2B.tsx` and `ConversationThreadScreen2B.tsx`, restyled with the `paper2b` palette/typography used by the rest of the `fil.refonte2b` test, and route to them only for accounts with that flag enabled — without touching the originals or any navigation call site.

**Architecture:** This repo already has a proven pattern for this exact kind of change — see `FeedGutterScreen.tsx` (clone of `TweetsScreen.tsx`) and `TweetRowGutter.tsx` (clone of `TweetRow.tsx`): copy the file byte-for-byte, keep 100% of the data/business logic untouched, and change only the presentation layer (colors, fonts, and the two spots — bubble background and voice-bubble background — that use a hardcoded Instagram-style gradient instead of a design token). Routing follows the same pattern as `MainTabs` in `MainNavigator.tsx:449`: the flag is read once, and the `component` prop of the existing route is swapped — no route name changes, so `navigation.navigate('ConversationThread', ...)` call sites elsewhere in the app (e.g. `NewConversationScreen.tsx`, `UserProfileScreen.tsx`) need zero changes.

**Tech Stack:** React Native / Expo, TypeScript, React Navigation (native stack + bottom tabs), `src/theme/paper2b.ts` (palette + `ps()` scaling + `paperFonts`).

**Spec:** No separate spec doc — the design was agreed inline in chat (see conversation). This plan is self-contained: every token mapping and every line-level change needed is spelled out below.

**Testing approach — deviation from the standard TDD step shape:** this codebase has no automated test harness for screens (see `twitninfbeta/CLAUDE.md`: the only repo-wide verification command is `npm run typecheck`). There is nothing to write a failing unit test against for a visual reskin. Each task below is therefore verified by (a) `npm run typecheck` passing and (b) a manual on-device/simulator check described in the task, instead of a red/green test cycle.

## Global Constraints

- **Never modify** `MessagesScreen.tsx` or `ConversationThreadScreen.tsx` — the 2B files are full duplicates, not shared components. Accounts without `fil.refonte2b` must see byte-identical behavior to today.
- **Never change a navigation route name.** Only the `component=` prop passed to existing `<Stack.Screen>` / `<Tab.Screen>` entries may change.
- **No gradients, no translucent decorative surfaces.** Per `twitninfbeta/CLAUDE.md` ("Règle centrale : surfaces PLEINES") and `theme/paper2b.ts`'s own doc comment ("un seul accent"), the own-message bubble and voice-bubble gradients (`MY_BUBBLE_GRADIENT`, Instagram blue→purple) become flat `paper.accent` fills.
- **All dimensions in the paper2b files must NOT be re-scaled with `ps()`** unless the original file already used a paper2b component — these two screens are plain reskins of existing, already-correctly-sized layouts (`normalize()`/hardcoded pt values from the originals), not clones of a Figma mock at `DESIGN_WIDTH=402`. Do not introduce `ps()` calls; keep every numeric layout value exactly as in the original file. Only colors and `fontFamily` values change.
- Run `npm run typecheck` after every task; it must exit clean (pre-existing unrelated errors in `behaviorTracker.ts`, `PremiumProfileEffects.tsx`, `EventContext.tsx` are known-bad and may be ignored per `CLAUDE.md`).
- Any new/modified `.tsx` file must be staged with `git add -f` — this repo's `.gitignore` silently swallows `*.md`/`*.js` but **also swallows nothing for `.tsx`**, so plain `git add` is fine for these files; only remember `git add -f` if you touch this plan `.md` file itself.

---

## Token Mapping Reference

Used by Tasks 1 and 2. `paper` and `paperFonts` come from `import { paper, paperFonts, isPaperDark } from '../theme/paper2b'`.

### Structural colors (safe global replace, in this exact order — `borderStrong` MUST be replaced before `border`, or the substring match corrupts it)

| Original | paper2b |
|---|---|
| `colors.surfaceElevated` | `paper.bgBand` |
| `colors.surfaceAlt` | `paper.bgBand` |
| `colors.borderStrong` | `paper.outline` |
| `colors.border` | `paper.hairline` |
| `colors.textSecondary` | `paper.inkSoft` |
| `colors.textMuted` | `paper.inkMeta` |
| `colors.textPrimary` | `paper.ink` |
| `colors.accent` | `paper.accent` |
| `colors.bg` | `paper.bg` |

`colors.overlayMedium` / `colors.overlayStrong` are **not** remapped — paper2b defines no overlay token, and these are neutral utility scrims (backdrop dimming), not brand surfaces. Keep `colors` imported in whichever file still uses them for this reason.

### Fonts (manual, per occurrence — the same original token maps to different roles depending on what the text IS)

| Role | paper2b |
|---|---|
| Body copy (message text, subtitles, plain labels) — was `fonts.regular` | `paperFonts.body` |
| Emphasized body copy — was `fonts.medium` or `fonts.semibold` used as “slightly heavier body” | `paperFonts.bodyStrong` |
| Names, tab labels, button labels, short strong UI labels — was `fonts.semibold` / `fonts.bold` | `paperFonts.strong` |
| Large headline text (screen/empty-state titles) — was `fonts.display` / `fonts.displayHeavy` | `paperFonts.display` |
| **Meta digits — timestamps, durations, counts** (paper2b's own rule: "Méta en chasse fixe (horodatage, nombre de réponses)") | `paperFonts.mono` (regular weight) or `paperFonts.monoStrong` (medium/bold weight) |

### Hardcoded hex literals

| Original literal | New value | Why |
|---|---|---|
| `'#0095F6'` (stray Instagram blue used for unread dot / send button / camera button) | `paper.accent` | paper2b is "un seul accent" — no second brand color |
| `'#3B5DF6'` (voice-bubble / gradient blue) | `paper.accent` | same reason |
| `'#8134AF'` (gradient purple, second stop of `MY_BUBBLE_GRADIENT`) | removed entirely | gradient replaced by flat fill |
| `'#fff'` / `'#000'` drawn **over photographic/video media** (image viewer chevron, story-reply play glyph, image-viewer backdrop) | **unchanged** | these sit on real photo/video content, not app chrome — theme-independent by convention |
| `'#fff'` used as text/icon color **on an accent-filled surface** (bubble text, badge text, icon inside an accent button) | `paper.onAccent` | correct contrast pairing |
| `'#FF3B30'` (destructive red: cancel-recording state, mic recording indicator) | **unchanged** | universal "recording/danger" red, not a brand token in either palette |
| `'#17151C'` / `'#33223D'` (story-reply-without-media gradient) | removed; container becomes flat `paper.bgBand` | no decorative gradients |

---

## Task 1: `MessagesScreen2B.tsx`

**Files:**
- Create: `src/screens/MessagesScreen2B.tsx`
- Reference (do not modify): `src/screens/MessagesScreen.tsx`

**Interfaces:**
- Consumes: same props as `MessagesScreen` — `{ navigation }: any`, same as every other screen in `MainStack`/the tab navigators.
- Produces: default export `MessagesScreen2B`, a drop-in replacement for `MessagesScreen` wherever it's mounted as a route component.

- [ ] **Step 1: Copy the file verbatim**

```bash
cp src/screens/MessagesScreen.tsx src/screens/MessagesScreen2B.tsx
```

- [ ] **Step 2: Replace the whole file content with the reskinned version below**

Write this exact content to `src/screens/MessagesScreen2B.tsx` (identical logic/handlers/JSX structure to the original; only the header comment, the import line, and every color/font reference change, per the mapping table above):

```tsx
/**
 * 🧪 Liste des conversations « 2B — Gouttière », sous drapeau `fil.refonte2b`.
 *
 * CLONE de `MessagesScreen.tsx`. Toute la logique — chargement des
 * conversations, invitations, anneaux de story, recherche, tabulation
 * Principal/Général — est reprise telle quelle et doit le RESTER : seule la
 * palette change (`theme/paper2b.ts`), en clair comme en sombre. L'original
 * n'est pas touché ; il continue de servir tout compte sans le drapeau.
 */
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
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { statusBarStyle } from '../theme';
import { paper, paperFonts } from '../theme/paper2b';
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

export default function MessagesScreen2B({ navigation }: any) {
  const tabBarHeight = useBottomTabBarHeight();

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
        <View style={styles.rowAvatar}>
          <StoryRing
            size={56}
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
            <Ionicons name="camera-outline" size={23} color={paper.inkSoft} />
          )}
        </View>
      </TouchableOpacity>
    );
  }, [storyUserIds, unseenStoryUserIds, openConversation]);

  return (
    <ScreenBackground>
      <SafeAreaView style={styles.container} edges={['top']}>
        <AppStatusBar />

        {/* ── Header Instagram : identité à gauche, actions à droite ── */}
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
            <Ionicons name="chevron-down" size={16} color={paper.ink} />
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
                    <Ionicons name="mail-unread-outline" size={22} color={paper.ink} />
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
                  <Ionicons name="chatbubble-outline" size={38} color={paper.ink} />
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
    color: paper.ink,
    fontSize: 21,
    fontFamily: paperFonts.display,
    letterSpacing: -0.4,
    maxWidth: '80%',
  },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 18, paddingRight: 10 },
  headerAction: { padding: 2 },

  listContent: {},

  searchWrap: { paddingHorizontal: 14, paddingBottom: 10 },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: paper.bgBand,
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 40,
  },
  searchInput: { flex: 1, color: paper.ink, fontSize: 15, padding: 0 },

  tray: { borderBottomWidth: 0, paddingVertical: 6 },

  tabs: {
    flexDirection: 'row',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: paper.hairline,
  },
  tab: { flex: 1, alignItems: 'center' },
  tabLabel: {
    color: paper.inkMeta,
    fontSize: 14,
    fontFamily: paperFonts.strong,
    paddingVertical: 12,
  },
  tabLabelActive: { color: paper.ink },
  tabUnderline: { height: 1.5, width: '100%', backgroundColor: 'transparent' },
  tabUnderlineActive: { backgroundColor: paper.ink },

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
    backgroundColor: paper.bgBand,
    alignItems: 'center',
    justifyContent: 'center',
  },
  requestsTitle: { color: paper.ink, fontSize: 15, fontFamily: paperFonts.strong },
  requestsSubtitle: { color: paper.accent, fontSize: 13, marginTop: 2, fontFamily: paperFonts.body },
  requestsCount: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    paddingHorizontal: 6,
    backgroundColor: paper.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  requestsCountText: { color: paper.onAccent, fontSize: 12, fontFamily: paperFonts.monoStrong },

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
    backgroundColor: paper.accent,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: paper.bg,
  },
  groupBadge: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    width: 19,
    height: 19,
    borderRadius: 10,
    backgroundColor: paper.bgBand,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: paper.bg,
  },
  rowBody: { flex: 1, marginRight: 10 },
  rowNameLine: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  rowName: {
    color: paper.ink,
    fontSize: 15,
    fontFamily: paperFonts.body,
    flexShrink: 1,
  },
  rowNameUnread: { fontFamily: paperFonts.strong },
  rowPreview: {
    color: paper.inkMeta,
    fontSize: 14,
    marginTop: 3,
    fontFamily: paperFonts.body,
  },
  rowPreviewUnread: { color: paper.ink, fontFamily: paperFonts.bodyStrong },
  rowTime: { color: paper.inkMeta, fontFamily: paperFonts.mono },
  rowTrailing: { width: 26, alignItems: 'flex-end' },
  unreadDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: paper.accent },

  loadingWrap: { paddingVertical: 28, alignItems: 'center' },
  emptyWrap: { alignItems: 'center', paddingTop: 52, paddingHorizontal: 40 },
  emptyIcon: {
    width: 78,
    height: 78,
    borderRadius: 39,
    borderWidth: 1.5,
    borderColor: paper.outline,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  emptyTitle: { color: paper.ink, fontSize: 20, fontFamily: paperFonts.display },
  emptySubtitle: {
    color: paper.inkMeta,
    fontSize: 14,
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 20,
  },
  emptyCta: { marginTop: 18 },
  emptyCtaText: { color: paper.accent, fontSize: 15, fontFamily: paperFonts.strong },
});
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: no new errors attributable to `MessagesScreen2B.tsx` (pre-existing unrelated errors listed in `CLAUDE.md` are fine).

- [ ] **Step 4: Commit**

```bash
git add src/screens/MessagesScreen2B.tsx
git commit -m "feat: clone MessagesScreen in paper2b style for fil.refonte2b"
```

---

## Task 2: `ConversationThreadScreen2B.tsx`

**Files:**
- Create: `src/screens/ConversationThreadScreen2B.tsx`
- Reference (do not modify): `src/screens/ConversationThreadScreen.tsx` (2404 lines)

**Interfaces:**
- Consumes: same props/route params as `ConversationThreadScreen` (`conversationId`, `userId`, `title`, `username`, `otherUserId`, `avatar`, `verified`, `verificationStyle`, `isGroup`, `memberCount` — all read from `route.params` inside the component, unchanged).
- Produces: default export `ConversationThreadScreen2B`, drop-in replacement for `ConversationThreadScreen` as a route component.

This file is too large to reproduce in full here (2404 lines, almost entirely unchanged business logic: socket wiring, message pagination, voice recording/playback, image attachments, reactions, typing indicators, seen receipts). Instead of retyping the whole file, this task is a **copy + exhaustive, ordered edit list** — every single line in the original that touches a color, a font, or a hardcoded hex value is listed below with its exact before → after. There are no other changes: every other line (imports aside from the two noted, all handlers, all JSX structure, all comments) is copied as-is.

- [ ] **Step 1: Copy the file verbatim**

```bash
cp src/screens/ConversationThreadScreen.tsx src/screens/ConversationThreadScreen2B.tsx
```

- [ ] **Step 2: Add the header doc comment**

At the very top of `ConversationThreadScreen2B.tsx`, before the first `import`, insert:

```tsx
/**
 * 🧪 Fil de messages « 2B — Gouttière », sous drapeau `fil.refonte2b`.
 *
 * CLONE de `ConversationThreadScreen.tsx`. Toute la logique — socket temps
 * réel, pagination, enregistrement/lecture vocale, pièces jointes, réactions,
 * accusés de lecture, indicateur de frappe — est reprise telle quelle et doit
 * le RESTER. Seule la présentation change :
 *   - la palette papier (`theme/paper2b.ts`), en clair comme en sombre ;
 *   - la bulle « moi » et la bulle vocale « moi » : dégradé bleu → violet
 *     remplacé par un aplat `paper.accent` (règle « surfaces pleines », « un
 *     seul accent ») ;
 *   - le rouge d'enregistrement/annulation (`#FF3B30`) et le noir du
 *     visualiseur d'image restent inchangés : ce sont des conventions
 *     système, pas des couleurs de marque.
 * L'original n'est pas touché ; il continue de servir tout compte sans le
 * drapeau.
 */
```

- [ ] **Step 3: Update the theme import**

Find (near the top of the file, alongside the other third-party imports):

```tsx
import { colors, fonts , statusBarStyle} from '../theme';
```

Replace with:

```tsx
import { colors, statusBarStyle } from '../theme';
import { paper, paperFonts } from '../theme/paper2b';
```

(`colors` stays — `colors.overlayMedium`/`colors.overlayStrong` are kept as-is per the token mapping reference; `fonts` is dropped because every `fonts.*` usage in this file is replaced below.)

- [ ] **Step 4: Remove the gradient constant**

Find:

```tsx
/** Bulles « moi » : dégradé Instagram bleu → violet. */
const MY_BUBBLE_GRADIENT = ['#3B5DF6', '#8134AF'] as const;
```

Delete these two lines entirely (the flat-fill replacement in Step 8 no longer needs it).

- [ ] **Step 5: Drop the now-unused `LinearGradient` import**

Find:

```tsx
import { LinearGradient } from 'expo-linear-gradient';
```

Delete this line (after Steps 8–10 below, no `<LinearGradient>` remains in the file).

- [ ] **Step 6: Voice-message play button — loading spinner and play/pause icon colors**

Find:

```tsx
          {isLoading ? (
            <ActivityIndicator size="small" color={fromMe ? '#3B5DF6' : '#fff'} />
          ) : (
            <Ionicons
              name={isPlaying ? 'pause' : 'play'}
              size={15}
              color={fromMe ? '#3B5DF6' : '#fff'}
              style={!isPlaying ? { marginLeft: 1 } : undefined}
            />
          )}
```

Replace with:

```tsx
          {isLoading ? (
            <ActivityIndicator size="small" color={fromMe ? paper.accent : paper.onAccent} />
          ) : (
            <Ionicons
              name={isPlaying ? 'pause' : 'play'}
              size={15}
              color={fromMe ? paper.accent : paper.onAccent}
              style={!isPlaying ? { marginLeft: 1 } : undefined}
            />
          )}
```

- [ ] **Step 7: Own voice bubble — remove gradient wrapper**

Find:

```tsx
  if (fromMe) {
    return (
      <LinearGradient
        colors={MY_BUBBLE_GRADIENT as unknown as [string, string]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.voiceBubble, bubbleRadius]}
      >
        {content}
      </LinearGradient>
    );
  }
```

Replace with:

```tsx
  if (fromMe) {
    return (
      <View style={[styles.voiceBubble, styles.voiceBubbleMine, bubbleRadius]}>
        {content}
      </View>
    );
  }
```

- [ ] **Step 8: Story-reply-without-media placeholder — remove decorative gradient**

Find:

```tsx
          <LinearGradient
            colors={['#33223D', '#17151C']}
            style={[styles.storyReplyMedia, styles.storyReplyVideo]}
          >
            <Ionicons name={isVideo ? 'play' : 'image-outline'} size={30} color="#fff" />
          </LinearGradient>
```

Replace with:

```tsx
          <View
            style={[styles.storyReplyMedia, styles.storyReplyVideo, styles.storyReplyPlaceholder]}
          >
            <Ionicons name={isVideo ? 'play' : 'image-outline'} size={30} color={paper.ink} />
          </View>
```

(The `<Ionicons name="play" .../>` a few lines below this block, inside `storyReplyPlay`, is drawn over an actual photo/video thumbnail with a `rgba(0,0,0,0.55)` circle behind it — **do not change it**, per the media-overlay exception in the token mapping reference.)

- [ ] **Step 9: Own text bubble — remove gradient wrapper**

Find:

```tsx
            ) : fromMe ? (
              <LinearGradient
                colors={MY_BUBBLE_GRADIENT as unknown as [string, string]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={[styles.bubble, bubbleRadius]}
              >
                <Text style={styles.bubbleTextMe}>{item.content}</Text>
              </LinearGradient>
            ) : (
```

Replace with:

```tsx
            ) : fromMe ? (
              <View style={[styles.bubble, styles.bubbleMine, bubbleRadius]}>
                <Text style={styles.bubbleTextMe}>{item.content}</Text>
              </View>
            ) : (
```

- [ ] **Step 10: Header icons — chevron-back, StoryRing gap, group icon, refresh, info**

Find each of these five lines (they are not adjacent — find and replace each individually, using the surrounding lines already shown to disambiguate if your editor needs more context):

```tsx
            <Ionicons name="chevron-back" size={28} color={colors.textPrimary} />
```
→
```tsx
            <Ionicons name="chevron-back" size={28} color={paper.ink} />
```
(this is the one inside `styles.backBtn`, in the main header — **not** the one inside the image-viewer modal, which stays `"#fff"`, see Step 15)

```tsx
                gapColor={colors.bg}
                ringWidth={2}
```
→
```tsx
                gapColor={paper.bg}
                ringWidth={2}
```
(header `StoryRing`)

```tsx
                  <Ionicons name="people" size={13} color={colors.textSecondary} style={{ marginRight: 4 }} />
```
→
```tsx
                  <Ionicons name="people" size={13} color={paper.inkSoft} style={{ marginRight: 4 }} />
```

```tsx
              <Ionicons name="refresh-outline" size={22} color={colors.textPrimary} />
```
→
```tsx
              <Ionicons name="refresh-outline" size={22} color={paper.ink} />
```

```tsx
              <Ionicons name="information-circle-outline" size={24} color={colors.textPrimary} />
```
→
```tsx
              <Ionicons name="information-circle-outline" size={24} color={paper.ink} />
```

- [ ] **Step 11: Thread-intro StoryRing gap color**

Find:

```tsx
                    hasStory={false}
                    gapColor={colors.bg}
                  />
```

Replace with:

```tsx
                    hasStory={false}
                    gapColor={paper.bg}
                  />
```

- [ ] **Step 12: Composer — camera button icon, recording state, text input, attachment/emoji/mic icons**

Find:

```tsx
              <TouchableOpacity style={styles.cameraBtn} onPress={openPeerStory} activeOpacity={0.85}>
                <Ionicons name="camera" size={19} color="#fff" />
              </TouchableOpacity>
```

Replace with:

```tsx
              <TouchableOpacity style={styles.cameraBtn} onPress={openPeerStory} activeOpacity={0.85}>
                <Ionicons name="camera" size={19} color={paper.onAccent} />
              </TouchableOpacity>
```

Find:

```tsx
                      <Ionicons
                        name="chevron-back"
                        size={14}
                        color={cancelArmed ? '#FF3B30' : colors.textMuted}
                      />
```

Replace with:

```tsx
                      <Ionicons
                        name="chevron-back"
                        size={14}
                        color={cancelArmed ? '#FF3B30' : paper.inkMeta}
                      />
```

Find:

```tsx
                    placeholder="Message…"
                    placeholderTextColor={colors.textMuted}
```

Replace with:

```tsx
                    placeholder="Message…"
                    placeholderTextColor={paper.inkMeta}
```

Find:

```tsx
                        {attachmentSending ? (
                          <ActivityIndicator size="small" color={colors.textSecondary} />
                        ) : (
                          <Ionicons name="image-outline" size={22} color={colors.textSecondary} />
                        )}
                      </TouchableOpacity>
                    )}
                    {!isRecording && <Ionicons name="happy-outline" size={22} color={colors.textSecondary} />}
```

Replace with:

```tsx
                        {attachmentSending ? (
                          <ActivityIndicator size="small" color={paper.inkSoft} />
                        ) : (
                          <Ionicons name="image-outline" size={22} color={paper.inkSoft} />
                        )}
                      </TouchableOpacity>
                    )}
                    {!isRecording && <Ionicons name="happy-outline" size={22} color={paper.inkSoft} />}
```

Find:

```tsx
                        <Ionicons
                          name={isRecording ? 'mic' : 'mic-outline'}
                          size={20}
                          color={isRecording ? '#fff' : colors.textSecondary}
                        />
```

Replace with:

```tsx
                        <Ionicons
                          name={isRecording ? 'mic' : 'mic-outline'}
                          size={20}
                          color={isRecording ? '#fff' : paper.inkSoft}
                        />
```

(`'#fff'` for the `isRecording` branch is intentionally unchanged — the mic button's background stays the system recording red `#FF3B30`, unrelated to either brand palette, so a white icon on red stays correct.)

- [ ] **Step 13: Reaction bar "+" icon**

Find:

```tsx
                      <Ionicons name="add" size={20} color={colors.textPrimary} />
```

Replace with:

```tsx
                      <Ionicons name="add" size={20} color={paper.ink} />
```

- [ ] **Step 14: Image-viewer back chevron and backdrop — confirm unchanged**

These two lines stay **exactly as in the original** (media viewer over a photo/video, theme-independent):

```tsx
                  <Ionicons name="chevron-back" size={26} color="#fff" />
```

and, in the style sheet, `imageViewerBackdrop: { flex: 1, backgroundColor: '#000' }`. No edit needed — just confirm they were not accidentally touched by a broader find/replace tool.

- [ ] **Step 15: Restyle the `StyleSheet.create({...})` block**

This is the large block at the end of the file (originally lines 2091–2404). Apply every change below to the copied file; every style key not listed here is unchanged. Two new style keys are added (`bubbleMine`, `voiceBubbleMine`, `storyReplyPlaceholder` — three, not two).

```tsx
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 6,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: paper.hairline,
  },
  backBtn: { padding: 4, marginRight: 2 },
  headerCenter: { flex: 1, flexDirection: 'row', alignItems: 'center', paddingLeft: 2 },
  headerTextBlock: { marginLeft: 8, flex: 1, minWidth: 0 },
  headerNameRow: { flexDirection: 'row', alignItems: 'center', minWidth: 0 },
  headerName: {
    color: paper.ink,
    fontSize: 15,
    fontFamily: paperFonts.strong,
    flexShrink: 1,
  },
  headerSub: { color: paper.inkMeta, fontSize: 12, marginTop: 1, fontFamily: paperFonts.body },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  headerIconBtn: { padding: 7 },

  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  listContent: { paddingVertical: 12, paddingHorizontal: 10 },

  threadIntro: { alignItems: 'center', paddingTop: 18, paddingBottom: 28 },
  introName: {
    color: paper.ink,
    fontSize: 19,
    fontFamily: paperFonts.display,
    marginTop: 12,
  },
  introSub: { color: paper.inkMeta, fontSize: 13, marginTop: 4, fontFamily: paperFonts.body },
  introBtn: {
    marginTop: 14,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: paper.bgBand,
  },
  introBtnText: { color: paper.ink, fontSize: 13, fontFamily: paperFonts.strong },

  msgRow: { flexDirection: 'row', alignItems: 'flex-end', marginVertical: 1 },
  msgRowLeft: { justifyContent: 'flex-start' },
  msgRowRight: { justifyContent: 'flex-end', paddingRight: 2 },
  avatarSlot: { width: 32, alignItems: 'center', justifyContent: 'flex-end', marginRight: 6 },
  rowAvatar: { width: 26, height: 26, borderRadius: 13 },
  rowAvatarFallback: { backgroundColor: paper.bgBand, alignItems: 'center', justifyContent: 'center' },
  rowAvatarText: { color: paper.ink, fontSize: 11, fontFamily: paperFonts.strong },

  groupSenderRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginLeft: 44, marginBottom: 4, marginTop: 8 },
  groupSenderName: { color: paper.inkMeta, fontSize: 11, fontFamily: paperFonts.strong },

  messageColumn: { maxWidth: '82%', alignItems: 'flex-start' },
  messageColumnMine: { alignItems: 'flex-end' },
  bubbleTouch: { maxWidth: '100%' },
  bubble: { paddingHorizontal: 14, paddingVertical: 9 },
  bubbleMine: { backgroundColor: paper.accent },
  bubbleOther: { backgroundColor: paper.bgBand },
  bubbleTextMe: { color: paper.onAccent, fontSize: 15, lineHeight: 21, fontFamily: paperFonts.body },
  bubbleTextOther: { color: paper.ink, fontSize: 15, lineHeight: 21, fontFamily: paperFonts.body },
  storyReplyCard: {
    width: 212,
    maxWidth: '100%',
    marginBottom: 9,
  },  storyReplyCardMine: {
    alignItems: 'flex-end',
  },
  storyReplyLabel: {
    color: paper.inkMeta,
    fontSize: 11.5,
    lineHeight: 15,
    fontFamily: paperFonts.strong,
    marginBottom: 5,
  },
  storyReplyLabelMine: { color: paper.inkSoft, textAlign: 'right' },
  storyReplyPreview: {
    width: '100%',
    aspectRatio: 0.72,
    borderRadius: 18,
    overflow: 'hidden',
    backgroundColor: paper.bgBand,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.overlayStrong,
  },
  storyReplyPlaceholder: { backgroundColor: paper.bgBand },
  storyReplyMedia: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  storyReplyVideo: { alignItems: 'center', justifyContent: 'center' },
  storyReplyPlay: {
    position: 'absolute',
    top: 10,
    right: 10,
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  storyReplyCaption: {
    position: 'absolute',
    left: 10,
    right: 10,
    bottom: 10,
    color: '#fff',
    fontSize: 12,
    lineHeight: 16,
    fontFamily: paperFonts.body,
    textShadowColor: 'rgba(0,0,0,0.9)',
    textShadowRadius: 4,
  },

  attachmentImage: {
    width: 220,
    maxWidth: '100%',
    height: 220,
    backgroundColor: paper.bgBand,
  },

  voiceBubble: {
    paddingHorizontal: 10,
    paddingVertical: 10,
    width: 230,
    maxWidth: '100%',
  },
  voiceBubbleMine: { backgroundColor: paper.accent },
  voiceBubbleOther: { backgroundColor: paper.bgBand },
  voiceRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  voicePlayBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  voicePlayBtnMine: { backgroundColor: paper.onAccent },
  voicePlayBtnOther: { backgroundColor: paper.accent },
  voicePlayBtnTouch: { width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center' },
  voiceWaveform: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2.5,
    height: 24,
  },
  voiceBar: { width: 2.5, borderRadius: 1.5 },
  voiceBarMine: { backgroundColor: isPaperDark ? 'rgba(26,2,7,0.35)' : 'rgba(255,255,255,0.4)' },
  voiceBarActiveMine: { backgroundColor: paper.onAccent },
  voiceBarOther: { backgroundColor: paper.outline },
  voiceBarActiveOther: { backgroundColor: paper.accent },
  voiceDuration: { color: paper.ink, fontSize: 10.5, fontFamily: paperFonts.monoStrong },
  voiceDurationMine: { color: paper.onAccent },

  recordingRow: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, overflow: 'hidden' },
  recordingDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#FF3B30' },
  recordingTimer: { color: paper.ink, fontSize: 14, fontFamily: paperFonts.monoStrong },
  recordingSlideHint: { flexDirection: 'row', alignItems: 'center', gap: 2, marginLeft: 'auto' },
  recordingSlideHintText: { color: paper.inkMeta, fontSize: 12.5, fontFamily: paperFonts.bodyStrong },
  recordingSlideHintTextActive: { color: '#FF3B30' },

  micButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  micButtonActive: { backgroundColor: '#FF3B30' },

  imageViewerBackdrop: { flex: 1, backgroundColor: '#000' },
  imageViewerHeader: { position: 'absolute', top: 0, left: 0, zIndex: 1 },
  imageViewerBack: { padding: 14 },
  imageViewerBody: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  imageViewerImage: {
    width: '100%',
    height: '80%',
  },

  reactionPillRow: {
    flexDirection: 'row',
    gap: 4,
    marginTop: -10,
    zIndex: 1,
  },
  reactionPillRowMine: { alignSelf: 'flex-end', marginRight: 6 },
  reactionPillRowOther: { alignSelf: 'flex-start', marginLeft: 6 },
  reactionPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: paper.bgBand,
    borderRadius: 12,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: paper.outline,
  },
  reactionPillMine: { borderColor: paper.accent },
  reactionPillEmoji: { fontSize: 13 },
  reactionPillCount: { color: paper.inkSoft, fontSize: 11, fontFamily: paperFonts.monoStrong },

  reactionBar: {
    position: 'absolute',
    width: REACTION_BAR_WIDTH,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: paper.bgBand,
    borderRadius: 28,
    paddingHorizontal: REACTION_BAR_PADDING,
    paddingVertical: 6,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: paper.outline,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 16,
    elevation: 12,
  },
  reactionBarItem: {
    width: REACTION_ITEM_WIDTH,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reactionBarEmoji: { fontSize: REACTION_EMOJI_SIZE, lineHeight: REACTION_EMOJI_SIZE + 6 },
  reactionBarMore: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.overlayMedium,
  },

  messageTime: { color: paper.inkMeta, fontSize: 10.5, marginTop: 3, fontFamily: paperFonts.mono },
  messageTimeRight: { textAlign: 'right', marginRight: 6 },
  messageTimeLeft: { marginLeft: 44 },

  separator: { alignItems: 'center', marginVertical: 14 },
  separatorText: { color: paper.inkMeta, fontSize: 11, fontFamily: paperFonts.strong },

  seenRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', paddingRight: 4, marginTop: 4, gap: 4 },
  seenAvatar: { width: 14, height: 14, borderRadius: 7 },
  seenAvatarText: { color: paper.ink, fontSize: 7, fontFamily: paperFonts.strong },
  seenLabel: { color: paper.inkMeta, fontSize: 11, fontFamily: paperFonts.bodyStrong },

  typingRow: { flexDirection: 'row', alignItems: 'flex-end', paddingHorizontal: 10, paddingBottom: 8 },
  typingBubble: {
    backgroundColor: paper.bgBand,
    borderRadius: 20,
    borderBottomLeftRadius: 6,
    paddingHorizontal: 14,
    paddingVertical: 13,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  typingDot: { width: 7, height: 7, borderRadius: 3.5, backgroundColor: paper.inkSoft },

  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 10,
    paddingVertical: 10,
    gap: 10,
  },
  cameraBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: paper.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  inputWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: paper.bg,
    borderRadius: 22,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: paper.outline,
    paddingLeft: 16,
    paddingRight: 12,
    minHeight: 40,
  },
  input: {
    flex: 1,
    color: paper.ink,
    fontSize: 15,
    paddingVertical: Platform.OS === 'ios' ? 9 : 6,
    maxHeight: 110,
    fontFamily: paperFonts.body,
  },
  inputIcons: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingLeft: 8 },
  sendBtn: { paddingLeft: 10, paddingVertical: 6 },
  sendText: { color: paper.accent, fontSize: 14, fontFamily: paperFonts.strong },
```

- [ ] **Step 16: Sanity grep — confirm nothing was missed**

Run:

```bash
grep -n "fonts\.\|MY_BUBBLE_GRADIENT\|LinearGradient" src/screens/ConversationThreadScreen2B.tsx
```

Expected: **no output**. If anything prints, an edit from Steps 3–15 was missed or mistyped — fix it before continuing.

Run:

```bash
grep -n "colors\." src/screens/ConversationThreadScreen2B.tsx
```

Expected: only the two import-line/util occurrences (`colors.overlayMedium`, `colors.overlayStrong`, and the `import { colors, statusBarStyle } from '../theme';` line itself). Anything else means a `colors.*` reference from the original leaked through unchanged — fix it.

- [ ] **Step 17: Typecheck**

Run: `npm run typecheck`
Expected: no new errors attributable to `ConversationThreadScreen2B.tsx`.

- [ ] **Step 18: Commit**

```bash
git add src/screens/ConversationThreadScreen2B.tsx
git commit -m "feat: clone ConversationThreadScreen in paper2b style for fil.refonte2b"
```

---

## Task 3: Wire both screens behind `fil.refonte2b`

**Files:**
- Modify: `src/navigation/MainNavigator.tsx:95` (import), `src/navigation/MainNavigator.tsx:108` (import), `src/navigation/MainNavigator.tsx:956-957` (`Messages` screen), `src/navigation/MainNavigator.tsx:1073-1074` (`ConversationThread` screen)
- Modify: `src/navigation/BottomTabNavigator2B.tsx:120` (import), `src/navigation/BottomTabNavigator2B.tsx:679` (`Messages` tab)

**Interfaces:**
- Consumes: `MessagesScreen2B` (Task 1) and `ConversationThreadScreen2B` (Task 2) default exports; the existing `feed2B` boolean already computed in `MainNavigator.tsx:422` (`const feed2B = useFlag(FLAGS.FEED_2B);`).
- Produces: no new exports — this task only changes which component two existing routes render.

- [ ] **Step 1: Import the 2B screens in `MainNavigator.tsx`**

Find:

```tsx
import MessagesScreen from '../screens/MessagesScreen';
```

Replace with:

```tsx
import MessagesScreen from '../screens/MessagesScreen';
import MessagesScreen2B from '../screens/MessagesScreen2B';
```

Find:

```tsx
import ConversationThreadScreen from '../screens/ConversationThreadScreen';
```

Replace with:

```tsx
import ConversationThreadScreen from '../screens/ConversationThreadScreen';
import ConversationThreadScreen2B from '../screens/ConversationThreadScreen2B';
```

- [ ] **Step 2: Swap the `Messages` stack screen's component**

Find (around line 956):

```tsx
        name="Messages"
        component={MessagesScreen}
```

Replace with:

```tsx
        name="Messages"
        component={feed2B ? MessagesScreen2B : MessagesScreen}
```

- [ ] **Step 3: Swap the `ConversationThread` stack screen's component**

Find (around line 1073):

```tsx
        name="ConversationThread"
        component={ConversationThreadScreen}
```

Replace with:

```tsx
        name="ConversationThread"
        component={feed2B ? ConversationThreadScreen2B : ConversationThreadScreen}
```

Both of these are inside the same `<MainStack.Navigator>` render as the existing `MainTabs` screen (`MainNavigator.tsx:449`, `component={feed2B ? BottomTabNavigator2B : BottomTabNavigator}`), so `feed2B` is already in scope — no new hook call needed.

- [ ] **Step 4: Swap the Messages tab inside `BottomTabNavigator2B.tsx`**

This navigator is only ever mounted when `feed2B` is already `true` (see Step 3 above / `MainNavigator.tsx:449`), so no additional flag check is needed here — it always renders the 2B screen.

Find:

```tsx
import MessagesScreen from '../screens/MessagesScreen';
```

Replace with:

```tsx
import MessagesScreen2B from '../screens/MessagesScreen2B';
```

Find:

```tsx
          <Tab.Screen name="Messages" component={MessagesScreen} />
```

Replace with:

```tsx
          <Tab.Screen name="Messages" component={MessagesScreen2B} />
```

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: clean (both new screens are now referenced and typed correctly as route components).

- [ ] **Step 6: Manual verification — flag OFF (regression check)**

With `fil.refonte2b` off (default/no override), launch the app and open the Messages tab, then open a conversation. Expected: pixel-identical to before this change — you're looking at the original `MessagesScreen`/`ConversationThreadScreen`, nothing changed for these accounts.

- [ ] **Step 7: Manual verification — flag ON**

Force the flag on via the existing local dev override mechanism (`featureFlagService` override, same one used to test `fil.refonte2b` today — see `SettingsScreen.tsx:57`, `feed2BEnabled = useFlag(FLAGS.FEED_2B)`, for how the rest of the app already surfaces this flag to a dev toggle). Reload the app, open the Messages tab (bottom bar, 2B layout): confirm the paper2b palette renders (flat paper background, single accent color, no gradients), open a conversation, send a text message, send a voice message, and confirm:
  - the outgoing bubble/voice-bubble is a **flat** `paper.accent` fill (no gradient)
  - timestamps and durations render in the monospace face (`paperFonts.mono`/`monoStrong`)
  - light/dark theme both look correct (toggle OS theme, relaunch — theme is resolved once at module load per `theme/colors.ts`/`theme/paper2b.ts`)

- [ ] **Step 8: Commit**

```bash
git add -f src/navigation/MainNavigator.tsx src/navigation/BottomTabNavigator2B.tsx
git commit -m "feat: route Messages and ConversationThread to paper2b clones under fil.refonte2b"
```

---

## Notes for the executor

- Tasks 1 and 2 can run in parallel (independent new files, no shared state). Task 3 depends on both.
- If a `grep`/`find` in Step 16 of Task 2 turns up an occurrence this plan didn't anticipate, treat it as a plan gap: apply the same mapping-table logic (structural color → its paper2b equivalent, digit/timestamp font → mono, decorative gradient/media-overlay → flat/unchanged per the reasoning in the token table) rather than skipping it.
- Do not add a `ps()`-scaled dimension, a new named color, or a new font weight anywhere in these two files — every value needed already exists in `theme/paper2b.ts`'s `Paper2BPalette`/`paperFonts`, confirmed by walking every single token used in both original files.
