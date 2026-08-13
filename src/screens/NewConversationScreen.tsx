import { fonts } from '../theme';
import { ScreenBackground, BackButton } from '../components/ui';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  ActivityIndicator,
  Animated,
  KeyboardAvoidingView,
  Platform,
  Dimensions,
} from 'react-native';
// La version de react-native (core) ne pose aucun inset sur Android — seule
// celle de react-native-safe-area-context protège le haut de l'écran partout.
import { SafeAreaView } from 'react-native-safe-area-context';
// `expo-image` plutôt que `Image` de React Native : cache disque et décodage
// hors du thread JS. `transition={0}` : aucune apparition en fondu, le rendu
// reste identique.
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import apiService from '../services/api';
import { API_CONFIG } from '../config/api';
import VerifiedBadge from '../components/VerifiedBadge';
import PremiumDisplayName from '../components/PremiumDisplayName';
import { certifiedNameColors, type ProfileCustomization } from '../services/profileCustomizationService';
import { toast } from '../components/ui/Toast';

const { width: SCREEN_W } = Dimensions.get('window');

interface UserCandidate {
  id: string;
  username: string;
  full_name?: string;
  avatar?: string | null;
  verified?: boolean;
  verification_style?: string;
  premium?: boolean;
  subscription_tier?: string;
  profile_customization?: ProfileCustomization;
}

function getAvatarUri(avatar?: string | null): string | null {
  if (!avatar) return null;
  if (avatar.startsWith('http')) return avatar;
  return `${API_CONFIG.BASE_URL}/static/avatars/${avatar}`;
}

const TABS = [
  { key: 'dm', label: 'Message', icon: 'chatbubble-ellipses-outline' as const },
  { key: 'group', label: 'Groupe', icon: 'people-outline' as const },
  { key: 'invites', label: 'Invitations', icon: 'mail-outline' as const },
];

export default function NewConversationScreen({ navigation, route }: any) {
  const initialTab = route?.params?.initialTab;
  const [mode, setMode] = useState<'dm' | 'group' | 'invites'>(
    initialTab === 'group' || initialTab === 'invites' ? initialTab : 'dm'
  );
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [defaultUsers, setDefaultUsers] = useState<UserCandidate[]>([]);
  const [results, setResults] = useState<UserCandidate[]>([]);
  const [loadingDefaults, setLoadingDefaults] = useState(false);
  const [selectedDmUser, setSelectedDmUser] = useState<UserCandidate | null>(null);
  const [groupMembers, setGroupMembers] = useState<UserCandidate[]>([]);
  const [dmMessage, setDmMessage] = useState('');
  const [groupTitle, setGroupTitle] = useState('');
  const [groupMessage, setGroupMessage] = useState('');
  const [invitations, setInvitations] = useState<any[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Animation for tab indicator
  const tabAnim = useRef(new Animated.Value(0)).current;
  const msgFadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    loadDefaultUsers();
    loadInvitations();
  }, []);

  useEffect(() => {
    const idx = TABS.findIndex((t) => t.key === mode);
    // 2·√80 ≈ 18 : le curseur d'onglet glisse et s'arrête net.
    Animated.spring(tabAnim, { toValue: idx, useNativeDriver: false, tension: 80, friction: 18 }).start();
  }, [mode]);

  useEffect(() => {
    if (selectedDmUser) {
      Animated.timing(msgFadeAnim, { toValue: 1, duration: 220, useNativeDriver: true }).start();
    } else {
      msgFadeAnim.setValue(0);
    }
  }, [selectedDmUser]);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) { setResults([]); return; }
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await apiService.searchUsers({ q, limit: 10 });
        const users = res?.success ? (res?.data?.users || []) : [];
        setResults(Array.isArray(users) ? users : []);
      } catch { setResults([]); }
      finally { setSearching(false); }
    }, 220);
    return () => clearTimeout(timer);
  }, [query]);

  const displayUsers = useMemo(() => {
    if (query.trim().length >= 2) return results;
    return defaultUsers;
  }, [query, results, defaultUsers]);

  const loadDefaultUsers = async () => {
    setLoadingDefaults(true);
    try {
      const me = await apiService.getCurrentUser();
      if (!me?.id) return;
      const [followersRes, followingRes] = await Promise.all([
        apiService.getUserFollowers(me.id, { limit: 35, offset: 0 }),
        apiService.getUserFollowing(me.id, { limit: 35, offset: 0 }),
      ]);
      const followers = followersRes?.success ? ((followersRes as any)?.data?.followers || []) : [];
      const following = followingRes?.success ? ((followingRes as any)?.data?.following || []) : [];
      const followerIds = new Set(followers.map((u: any) => u?.id).filter(Boolean));
      const followingIds = new Set(following.map((u: any) => u?.id).filter(Boolean));
      const map = new Map<string, UserCandidate & { score: number }>();
      const merge = (u: any, base: number) => {
        if (!u?.id || !u?.username) return;
        const mutual = followerIds.has(u.id) && followingIds.has(u.id);
        const score = mutual ? 3 : base;
        const prev = map.get(u.id);
        const row = { id: u.id, username: u.username, full_name: u.full_name || u.username, avatar: u.avatar || null, verified: !!u.verified, verification_style: u.verification_style || 'default', premium: !!u.premium, subscription_tier: u.subscription_tier, profile_customization: u.profile_customization, score };
        if (!prev || row.score > prev.score) map.set(u.id, row);
      };
      following.forEach((u: any) => merge(u, 2));
      followers.forEach((u: any) => merge(u, 1));
      const ordered = Array.from(map.values())
        .sort((a, b) => (b.score - a.score) || (a.full_name || '').localeCompare(b.full_name || ''))
        .slice(0, 30).map(({ score, ...rest }) => rest);
      setDefaultUsers(ordered);
    } finally { setLoadingDefaults(false); }
  };

  const loadInvitations = async () => {
    try {
      const res = await apiService.get('/api/messages/invitations');
      setInvitations(res?.success ? res.invitations || [] : []);
    } catch { setInvitations([]); }
  };

  const isInGroup = (id: string) => groupMembers.some((u) => u.id === id);
  const toggleGroupMember = (u: UserCandidate) => {
    setGroupMembers((prev) => isInGroup(u.id) ? prev.filter((x) => x.id !== u.id) : [...prev, u]);
  };

  const sendDM = async () => {
    if (!selectedDmUser || !dmMessage.trim()) return;
    setIsSubmitting(true);
    try {
      const res = await apiService.post(`/api/messages/direct/${selectedDmUser.id}`, { content: dmMessage.trim() });
      if (!res?.success) { toast.error(res?.message || 'Échec envoi'); return; }
      toast.info('✓', {
        description: res?.invitation_required ? 'Invitation envoyée' : 'Message envoyé',
      });
      navigation.goBack();
    } finally { setIsSubmitting(false); }
  };

  const createGroup = async () => {
    if (!groupTitle.trim() || groupMembers.length === 0) return;
    setIsSubmitting(true);
    try {
      const res = await apiService.post('/api/messages/groups', { title: groupTitle.trim(), participantIds: groupMembers.map((u) => u.id) });
      if (!res?.success) { toast.error(res?.message || 'Échec création'); return; }
      if (groupMessage.trim() && res?.conversation?.id) {
        await apiService.post(`/api/messages/conversations/${res.conversation.id}/messages`, { content: groupMessage.trim() });
      }
      toast.success('✓', {
        description: 'Groupe créé',
      });
      navigation.goBack();
    } finally { setIsSubmitting(false); }
  };

  const respondInvite = async (conversationId: string, action: 'accept' | 'decline') => {
    const res = await apiService.post(`/api/messages/conversations/${conversationId}/invitation/respond`, { action });
    if (!res?.success) { toast.error(res?.message || 'Impossible de traiter'); return; }
    await loadInvitations();
  };

  // Avatar component
  const Avatar = ({ user, size = 46 }: { user: UserCandidate; size?: number }) => {
    const uri = getAvatarUri(user.avatar);
    const initials = (user.full_name || user.username).slice(0, 2).toUpperCase();
    const colors = ['#1d4ed8', '#7c3aed', '#db2777', '#059669', '#d97706'];
    const colorIdx = user.id.charCodeAt(0) % colors.length;
    if (uri) return <Image source={{ uri }} style={{ width: size, height: size, borderRadius: size / 2 }} contentFit="cover" cachePolicy="memory-disk" transition={0} recyclingKey={uri} />;
    return (
      <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: colors[colorIdx], alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: '#fff', fontWeight: '800', fontFamily: fonts.bold, fontSize: size * 0.32 }}>{initials}</Text>
      </View>
    );
  };

  const renderUserRow = (u: UserCandidate) => {
    const selected = mode === 'group' ? isInGroup(u.id) : selectedDmUser?.id === u.id;
    return (
      <TouchableOpacity
        key={u.id}
        style={[styles.userRow, selected && styles.userRowSelected]}
        onPress={() => mode === 'group' ? toggleGroupMember(u) : setSelectedDmUser(u === selectedDmUser ? null : u)}
        activeOpacity={0.7}
      >
        <View style={styles.avatarWrap}>
          <Avatar user={u} size={46} />
          {selected && (
            <View style={styles.selectedDot}>
              <Ionicons name="checkmark" size={10} color="#fff" />
            </View>
          )}
        </View>
        <View style={{ flex: 1 }}>
          <View style={styles.nameLine}>
            <PremiumDisplayName
              text={u.full_name || u.username}
              baseStyle={styles.nameTxt}
              isPremium={!!u.premium}
              subscriptionTierRaw={u.subscription_tier}
              fontId="system"
              effectId="none"
              numberOfLines={1}
              customization={u.profile_customization}
              verified={!!u.verified}
              verificationStyle={(u.verification_style as any) || 'default'}
            />
            {u.verified && (
              <VerifiedBadge
                verificationStyle={(u.verification_style as any) || 'default'}
                size={14}
                tint={certifiedNameColors((u.verification_style as any) || 'default', u.profile_customization).from}
              />
            )}
          </View>
          <Text style={styles.userHandleTxt}>@{u.username}</Text>
        </View>
        {selected ? (
          <View style={styles.selectedBadge}><Text style={styles.selectedBadgeTxt}>Sélectionné</Text></View>
        ) : (
          <View style={styles.selectBtn}><Text style={styles.selectBtnTxt}>+</Text></View>
        )}
      </TouchableOpacity>
    );
  };

  const tabIndicatorLeft = tabAnim.interpolate({
    inputRange: [0, 1, 2],
    outputRange: [4, (SCREEN_W - 32) / 3 + 4, ((SCREEN_W - 32) / 3) * 2 + 4],
  });

  const canSendDM = !!selectedDmUser && dmMessage.trim().length > 0;
  const canCreateGroup = groupTitle.trim().length > 0 && groupMembers.length > 0;

  return (
    <ScreenBackground>
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>

        {/* ── HEADER ── */}
        <View style={styles.header}>
          <BackButton navigation={navigation} />
          <View>
            <Text style={styles.headerTitle}>Nouveau message</Text>
            {mode === 'group' && groupMembers.length > 0 && (
              <Text style={styles.headerSub}>{groupMembers.length} membre{groupMembers.length > 1 ? 's' : ''} sélectionné{groupMembers.length > 1 ? 's' : ''}</Text>
            )}
          </View>
          <View style={{ width: 36 }} />
        </View>

        {/* ── TABS ── */}
        <View style={styles.tabsContainer}>
          <View style={styles.tabsTrack}>
            <Animated.View style={[styles.tabIndicator, { left: tabIndicatorLeft, width: (SCREEN_W - 32) / 3 - 8 }]} />
            {TABS.map((tab) => (
              <TouchableOpacity key={tab.key} style={styles.tab} onPress={() => setMode(tab.key as any)} activeOpacity={0.8}>
                <Ionicons name={tab.icon} size={15} color={mode === tab.key ? '#fff' : '#6b7280'} />
                <Text style={[styles.tabTxt, mode === tab.key && styles.tabTxtActive]}>{tab.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* ── INVITATIONS MODE ── */}
        {mode === 'invites' ? (
          <ScrollView contentContainerStyle={styles.invitesList} showsVerticalScrollIndicator={false}>
            {invitations.length === 0 ? (
              <View style={styles.emptyState}>
                <View style={styles.emptyIcon}><Ionicons name="mail-open-outline" size={32} color="#374151" /></View>
                <Text style={styles.emptyTitle}>Pas d'invitation</Text>
                <Text style={styles.emptyBody}>Les demandes de message apparaîtront ici</Text>
              </View>
            ) : invitations.map((inv) => {
              const sender = inv?.participants?.find((p: any) => p?.id === inv?.from_user_id);
              const isGroupInvite = inv?.type === 'group';
              return (
                <View key={inv.conversation_id} style={styles.inviteCard}>
                  <View style={styles.inviteTop}>
                    {sender ? <Avatar user={sender} size={40} /> : <View style={[styles.avatarWrap, { width: 40, height: 40, borderRadius: 20, backgroundColor: '#1f2937' }]} />}
                    <View style={{ flex: 1, marginLeft: 10 }}>
                      <View style={styles.inviteLine}>
                        <Text style={styles.inviteSender}>@{sender?.username || 'utilisateur'}</Text>
                        {isGroupInvite && (
                          <View style={styles.groupInviteBadge}>
                            <Ionicons name="people" size={11} color="#93c5fd" />
                            <Text style={styles.groupInviteBadgeTxt}>GROUPE</Text>
                          </View>
                        )}
                      </View>
                      <Text style={styles.inviteTime}>
                        {isGroupInvite ? (inv?.message || 'Invitation au groupe') : 'souhaite vous envoyer un message'}
                      </Text>
                    </View>
                  </View>
                  {!isGroupInvite && inv?.message && <Text style={styles.inviteMsg}>"{inv.message}"</Text>}
                  <View style={styles.inviteActions}>
                    <TouchableOpacity style={styles.declineBtn} onPress={() => respondInvite(inv.conversation_id, 'decline')}>
                      <Text style={styles.declineTxt}>Refuser</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.acceptBtn} onPress={() => respondInvite(inv.conversation_id, 'accept')}>
                      <Text style={styles.acceptTxt}>Accepter</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })}
          </ScrollView>

        ) : (
          <>
            {/* ── SEARCH BAR ── */}
            <View style={styles.searchWrap}>
              <Ionicons name="search-outline" size={16} color="#6b7280" style={styles.searchIcon} />
              <TextInput
                style={styles.searchInput}
                placeholder={mode === 'dm' ? 'Rechercher une personne…' : 'Ajouter des membres…'}
                placeholderTextColor="#4b5563"
                value={query}
                onChangeText={setQuery}
                returnKeyType="search"
              />
              {query.length > 0 && (
                <TouchableOpacity onPress={() => setQuery('')}>
                  <Ionicons name="close-circle" size={16} color="#4b5563" />
                </TouchableOpacity>
              )}
            </View>

            {/* ── GROUP MEMBERS CHIPS ── */}
            {mode === 'group' && groupMembers.length > 0 && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipsScroll} contentContainerStyle={{ paddingHorizontal: 16, gap: 8 }}>
                {groupMembers.map((u) => (
                  <TouchableOpacity key={u.id} style={styles.chip} onPress={() => toggleGroupMember(u)} activeOpacity={0.8}>
                    <Avatar user={u} size={22} />
                    <Text style={styles.chipTxt}>@{u.username}</Text>
                    <Ionicons name="close" size={12} color="#93c5fd" />
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}

            {/* ── DM SELECTED BANNER ── */}
            {mode === 'dm' && selectedDmUser && (
              <Animated.View style={[styles.selectedBanner, { opacity: msgFadeAnim }]}>
                <Avatar user={selectedDmUser} size={32} />
                <View style={{ flex: 1, marginLeft: 10 }}>
                  <Text style={styles.selectedBannerName}>{selectedDmUser.full_name || selectedDmUser.username}</Text>
                  <Text style={styles.selectedBannerHandle}>@{selectedDmUser.username}</Text>
                </View>
                <TouchableOpacity onPress={() => setSelectedDmUser(null)}>
                  <Ionicons name="close-circle-outline" size={20} color="#6b7280" />
                </TouchableOpacity>
              </Animated.View>
            )}

            {/* ── USER LIST ── */}
            <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.userList} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              {loadingDefaults && query.trim().length < 2 ? (
                <View style={styles.loaderWrap}><ActivityIndicator color="#4F7CFF" size="small" /></View>
              ) : searching ? (
                <View style={styles.loaderWrap}><ActivityIndicator color="#4F7CFF" size="small" /></View>
              ) : displayUsers.length === 0 ? (
                <View style={styles.emptyState}>
                  <View style={styles.emptyIcon}><Ionicons name="person-outline" size={28} color="#374151" /></View>
                  <Text style={styles.emptyTitle}>{query.trim().length >= 2 ? 'Aucun résultat' : 'Aucun contact'}</Text>
                  <Text style={styles.emptyBody}>{query.trim().length >= 2 ? `Rien pour "${query}"` : 'Suivez des personnes pour les retrouver ici'}</Text>
                </View>
              ) : (
                displayUsers.map(renderUserRow)
              )}
            </ScrollView>

            {/* ── FOOTER ── */}
            <View style={styles.footer}>
              {mode === 'dm' ? (
                <>
                  <View style={[styles.msgInputRow, !selectedDmUser && styles.msgInputRowDisabled]}>
                    <TextInput
                      style={styles.msgInput}
                      placeholder={selectedDmUser ? `Message à @${selectedDmUser.username}…` : 'Sélectionnez d\'abord un destinataire'}
                      placeholderTextColor="#4b5563"
                      value={dmMessage}
                      onChangeText={setDmMessage}
                      multiline
                      maxLength={1000}
                      editable={!!selectedDmUser}
                    />
                    <TouchableOpacity
                      style={[styles.sendBtn, canSendDM && styles.sendBtnActive]}
                      onPress={sendDM}
                      disabled={!canSendDM || isSubmitting}
                      activeOpacity={0.8}
                    >
                      {isSubmitting
                        ? <ActivityIndicator color="#fff" size="small" />
                        : <Ionicons name="send" size={17} color={canSendDM ? '#fff' : '#374151'} />}
                    </TouchableOpacity>
                  </View>
                </>
              ) : (
                <>
                  <TextInput
                    style={styles.titleInput}
                    placeholder="Nom du groupe"
                    placeholderTextColor="#4b5563"
                    value={groupTitle}
                    onChangeText={setGroupTitle}
                  />
                  <View style={styles.msgInputRow}>
                    <TextInput
                      style={styles.msgInput}
                      placeholder="Message de bienvenue (optionnel)…"
                      placeholderTextColor="#4b5563"
                      value={groupMessage}
                      onChangeText={setGroupMessage}
                      multiline
                    />
                  </View>
                  <TouchableOpacity
                    style={[styles.createGroupBtn, canCreateGroup && styles.createGroupBtnActive]}
                    onPress={createGroup}
                    disabled={!canCreateGroup || isSubmitting}
                    activeOpacity={0.8}
                  >
                    {isSubmitting
                      ? <ActivityIndicator color="#fff" size="small" />
                      : <><Ionicons name="people" size={16} color={canCreateGroup ? '#fff' : '#374151'} /><Text style={[styles.createGroupTxt, canCreateGroup && styles.createGroupTxtActive]}>Créer le groupe</Text></>}
                  </TouchableOpacity>
                </>
              )}
            </View>
          </>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
    </ScreenBackground>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'transparent',
  },

  // ── HEADER
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#1f2937',
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#111827',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    color: '#f9fafb',
    fontSize: 17,
    fontWeight: '800', fontFamily: fonts.bold,
    letterSpacing: -0.3,
  },
  headerSub: {
    color: '#4F7CFF',
    fontSize: 12,
    fontWeight: '600', fontFamily: fonts.semibold,
    textAlign: 'center',
    marginTop: 1,
  },

  // ── TABS
  tabsContainer: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  tabsTrack: {
    flexDirection: 'row',
    backgroundColor: '#111827',
    borderRadius: 14,
    padding: 4,
    position: 'relative',
  },
  tabIndicator: {
    position: 'absolute',
    top: 4,
    height: '100%',
    backgroundColor: '#4F7CFF',
    borderRadius: 11,
    zIndex: 0,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: 9,
    zIndex: 1,
  },
  tabTxt: {
    color: '#6b7280',
    fontWeight: '700', fontFamily: fonts.bold,
    fontSize: 13,
  },
  tabTxtActive: {
    color: '#fff',
  },

  // ── SEARCH
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginBottom: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#0d1117',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#1f2937',
    gap: 8,
  },
  searchIcon: { flexShrink: 0 },
  searchInput: {
    flex: 1,
    color: '#f9fafb',
    fontSize: 15,
    padding: 0,
  },

  // ── GROUP CHIPS
  chipsScroll: {
    maxHeight: 44,
    marginBottom: 8,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(29,155,240,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(29,155,240,0.3)',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  chipTxt: {
    color: '#93c5fd',
    fontWeight: '700', fontFamily: fonts.bold,
    fontSize: 12,
  },

  // ── DM SELECTED BANNER
  selectedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginBottom: 10,
    padding: 10,
    backgroundColor: 'rgba(29,155,240,0.07)',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(29,155,240,0.2)',
  },
  selectedBannerName: {
    color: '#f9fafb',
    fontWeight: '700', fontFamily: fonts.bold,
    fontSize: 14,
  },
  selectedBannerHandle: {
    color: '#6b7280',
    fontSize: 12,
    marginTop: 1,
  },

  // ── USER LIST
  userList: {
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  loaderWrap: {
    paddingVertical: 40,
    alignItems: 'center',
  },
  userRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 11,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#0d1117',
  },
  userRowSelected: {
    backgroundColor: 'rgba(29,155,240,0.05)',
    borderRadius: 12,
    paddingHorizontal: 8,
    marginHorizontal: -8,
  },
  avatarWrap: {
    position: 'relative',
  },
  selectedDot: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#4F7CFF',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#000',
  },
  nameLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  nameTxt: {
    color: '#f9fafb',
    fontWeight: '700', fontFamily: fonts.bold,
    fontSize: 14,
    maxWidth: '80%',
  },
  userHandleTxt: {
    color: '#6b7280',
    fontSize: 13,
    marginTop: 1,
  },
  selectedBadge: {
    backgroundColor: 'rgba(29,155,240,0.15)',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  selectedBadgeTxt: {
    color: '#4F7CFF',
    fontWeight: '700', fontFamily: fonts.bold,
    fontSize: 11,
  },
  selectBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#374151',
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectBtnTxt: {
    color: '#6b7280',
    fontWeight: '700', fontFamily: fonts.bold,
    fontSize: 16,
    lineHeight: 18,
  },

  // ── EMPTY STATE
  emptyState: {
    alignItems: 'center',
    paddingVertical: 48,
    gap: 8,
  },
  emptyIcon: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#0d1117',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  emptyTitle: {
    color: '#f9fafb',
    fontWeight: '800', fontFamily: fonts.bold,
    fontSize: 17,
  },
  emptyBody: {
    color: '#6b7280',
    fontSize: 14,
    textAlign: 'center',
    maxWidth: 220,
    lineHeight: 20,
  },

  // ── FOOTER
  footer: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#1f2937',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 8,
    backgroundColor: 'transparent',
  },
  msgInputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    backgroundColor: '#0d1117',
    borderWidth: 1,
    borderColor: '#1f2937',
    borderRadius: 16,
    paddingLeft: 14,
    paddingRight: 6,
    paddingVertical: 6,
    gap: 6,
  },
  msgInputRowDisabled: {
    opacity: 0.45,
  },
  msgInput: {
    flex: 1,
    color: '#f9fafb',
    fontSize: 15,
    minHeight: 38,
    maxHeight: 100,
    paddingTop: 6,
    paddingBottom: 6,
  },
  sendBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#1f2937',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    alignSelf: 'flex-end',
    marginBottom: 1,
  },
  sendBtnActive: {
    backgroundColor: '#4F7CFF',
  },
  titleInput: {
    backgroundColor: '#0d1117',
    borderWidth: 1,
    borderColor: '#1f2937',
    borderRadius: 14,
    color: '#f9fafb',
    fontSize: 15,
    paddingHorizontal: 14,
    paddingVertical: 11,
    fontWeight: '600', fontFamily: fonts.semibold,
  },
  createGroupBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 14,
    backgroundColor: '#111827',
    paddingVertical: 13,
  },
  createGroupBtnActive: {
    backgroundColor: '#4F7CFF',
  },
  createGroupTxt: {
    color: '#374151',
    fontWeight: '800', fontFamily: fonts.bold,
    fontSize: 15,
  },
  createGroupTxtActive: {
    color: '#fff',
  },

  // ── INVITATIONS
  invitesList: {
    padding: 16,
    gap: 10,
  },
  inviteCard: {
    backgroundColor: '#0a0e14',
    borderWidth: 1,
    borderColor: '#1f2937',
    borderRadius: 18,
    padding: 14,
    gap: 10,
  },
  inviteTop: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  inviteSender: {
    color: '#f9fafb',
    fontWeight: '700', fontFamily: fonts.bold,
    fontSize: 14,
  },
  inviteLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  groupInviteBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: 'rgba(29,155,240,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(29,155,240,0.3)',
  },
  groupInviteBadgeTxt: {
    color: '#93c5fd',
    fontSize: 10,
    fontWeight: '800', fontFamily: fonts.bold,
    letterSpacing: 0.3,
  },
  inviteTime: {
    color: '#6b7280',
    fontSize: 12,
    marginTop: 2,
  },
  inviteMsg: {
    color: '#9ca3af',
    fontSize: 13,
    fontStyle: 'italic',
    lineHeight: 18,
    paddingHorizontal: 2,
  },
  inviteActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 2,
  },
  declineBtn: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 9,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#374151',
    backgroundColor: '#0d1117',
  },
  declineTxt: {
    color: '#9ca3af',
    fontWeight: '700', fontFamily: fonts.bold,
    fontSize: 13,
  },
  acceptBtn: {
    flex: 2,
    alignItems: 'center',
    paddingVertical: 9,
    borderRadius: 10,
    backgroundColor: '#4F7CFF',
  },
  acceptTxt: {
    color: '#fff',
    fontWeight: '800', fontFamily: fonts.bold,
    fontSize: 13,
  },
});