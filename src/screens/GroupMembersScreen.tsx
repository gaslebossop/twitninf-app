import { fonts , colors} from '../theme';
import { ScreenBackground, BackButton } from '../components/ui';
import React, { useEffect, useMemo, useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Image,
  Modal,
  Animated,
  Pressable,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import apiService from '../services/api';
import VerifiedBadge from '../components/VerifiedBadge';
import PremiumDisplayName from '../components/PremiumDisplayName';
import { certifiedNameColors, type ProfileCustomization } from '../services/profileCustomizationService';
import { API_CONFIG } from '../config/api';
import { toast } from '../components/ui/Toast';
import { confirmAsync } from '../components/ui/ConfirmSheet';

function getAvatarUri(avatar?: string | null): string | null {
  if (!avatar) return null;
  if (avatar.startsWith('http')) return avatar;
  return `${API_CONFIG.BASE_URL}/static/avatars/${avatar}`;
}

const ROLE_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  owner: { bg: 'rgba(251,191,36,0.12)', text: '#fbbf24', border: 'rgba(251,191,36,0.25)' },
  admin: { bg: 'rgba(29,155,240,0.10)', text: '#4F7CFF', border: 'rgba(29,155,240,0.25)' },
  member: { bg: '#111', text: '#536471', border: '#1f2937' },
};

function RolePill({ role }: { role: string }) {
  const c = ROLE_COLORS[role] || ROLE_COLORS.member;
  return (
    <View style={[styles.rolePill, { backgroundColor: c.bg, borderColor: c.border }]}>
      <Text style={[styles.rolePillText, { color: c.text }]}>
        {role.charAt(0).toUpperCase() + role.slice(1)}
      </Text>
    </View>
  );
}

function Avatar({ avatar, username }: { avatar?: string | null; username?: string }) {
  const uri = getAvatarUri(avatar);
  const initials = String(username || 'U').slice(0, 2).toUpperCase();
  if (uri) return <Image source={{ uri }} style={styles.avatar} />;
  return (
    <View style={styles.avatarFallback}>
      <Text style={styles.avatarFallbackTxt}>{initials}</Text>
    </View>
  );
}

type ActionSheetAction = { label: string; sublabel?: string; icon: string; color: string; onPress: () => void; destructive?: boolean };

function BottomActionSheet({
  visible, onClose, title, actions,
}: { visible: boolean; onClose: () => void; title?: string; actions: ActionSheetAction[] }) {
  const slide = useRef(new Animated.Value(300)).current;

  useEffect(() => {
    if (visible) // `bounciness: 0` = pas de dépassement. La feuille se pose au lieu
    // de dépasser sa position puis de revenir.
    Animated.spring(slide, { toValue: 0, useNativeDriver: true, bounciness: 0, speed: 14 }).start();
    else Animated.timing(slide, { toValue: 300, duration: 200, useNativeDriver: true }).start();
  }, [visible]);

  if (!visible) return null;
  return (
    <Modal transparent animationType="none" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        <Animated.View style={[styles.sheet, { transform: [{ translateY: slide }] }]}>
          {title && <Text style={styles.sheetTitle}>{title}</Text>}
          {actions.map((a, i) => (
            <React.Fragment key={i}>
              {i > 0 && <View style={styles.sheetDivider} />}
              <TouchableOpacity style={styles.sheetRow} onPress={() => { onClose(); a.onPress(); }}>
                <View style={[styles.sheetIcon, { backgroundColor: a.destructive ? 'rgba(239,68,68,0.12)' : 'rgba(29,155,240,0.10)' }]}>
                  <Ionicons name={a.icon as any} size={17} color={a.destructive ? '#ef4444' : a.color} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.sheetLabel, a.destructive && { color: '#ef4444' }]}>{a.label}</Text>
                  {a.sublabel ? <Text style={styles.sheetSublabel}>{a.sublabel}</Text> : null}
                </View>
                <Ionicons name="chevron-forward" size={14} color="#2f3336" />
              </TouchableOpacity>
            </React.Fragment>
          ))}
          <TouchableOpacity style={styles.sheetCancel} onPress={onClose}>
            <Text style={styles.sheetCancelTxt}>Annuler</Text>
          </TouchableOpacity>
        </Animated.View>
      </Pressable>
    </Modal>
  );
}

export default function GroupMembersScreen({ navigation, route }: any) {
  const conversationId = route?.params?.conversationId as string;
  const title = route?.params?.title as string;

  const [myId, setMyId] = useState<string | null>(null);
  const [participants, setParticipants] = useState<any[]>([]);
  const [groupMeta, setGroupMeta] = useState<any>(null);
  const [query, setQuery] = useState('');
  const [defaultUsers, setDefaultUsers] = useState<any[]>([]);
  const [results, setResults] = useState<any[]>([]);
  const [selectedAddIds, setSelectedAddIds] = useState<string[]>([]);
  const [sheet, setSheet] = useState<{ visible: boolean; participant?: any }>({ visible: false });

  const load = async () => {
    const me = await apiService.getCurrentUser();
    setMyId(me?.id || null);
    const res = await apiService.get(`/api/messages/conversations/${conversationId}/participants`);
    if (res?.success) {
      setParticipants(Array.isArray(res.participants) ? res.participants : []);
      setGroupMeta(res.group || null);
    }
  };

  useEffect(() => { load(); }, [conversationId]);

  const loadDefaultUsers = async () => {
    const me = await apiService.getCurrentUser();
    if (!me?.id) return;
    const [followersRes, followingRes] = await Promise.all([
      apiService.getUserFollowers(me.id, { limit: 30, offset: 0 }),
      apiService.getUserFollowing(me.id, { limit: 30, offset: 0 }),
    ]);
    const followers = followersRes?.success ? ((followersRes as any)?.data?.followers || []) : [];
    const following = followingRes?.success ? ((followingRes as any)?.data?.following || []) : [];
    const existing = new Set(participants.map((p) => String(p.id)));
    const map = new Map<string, any>();
    [...following, ...followers].forEach((u: any) => {
      if (!u?.id || existing.has(String(u.id))) return;
      map.set(String(u.id), u);
    });
    setDefaultUsers(Array.from(map.values()).slice(0, 24));
  };

  useEffect(() => { loadDefaultUsers(); }, [participants.length]);

  const myRole = useMemo(() => {
    const me = participants.find((p) => String(p.id) === String(myId));
    return me?.role || 'member';
  }, [participants, myId]);
  const canManage = ['owner', 'admin'].includes(myRole);

  useEffect(() => {
    if (!canManage) { setResults([]); return; }
    if (query.trim().length < 2) { setResults(defaultUsers); return; }
    const t = setTimeout(async () => {
      const res = await apiService.searchUsers({ q: query.trim(), limit: 8 });
      const users = res?.success ? (res?.data?.users || []) : [];
      const existing = new Set(participants.map((p) => String(p.id)));
      setResults((Array.isArray(users) ? users : []).filter((u: any) => !existing.has(String(u?.id))));
    }, 220);
    return () => clearTimeout(t);
  }, [query, canManage, defaultUsers, participants]);

  const toggleCandidate = (id: string) =>
    setSelectedAddIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);

  const addMembers = async () => {
    const ids = selectedAddIds.filter(Boolean);
    if (!ids.length) return;
    const res = await apiService.post(`/api/messages/conversations/${conversationId}/members`, { memberIds: ids });
    if (!res?.success) { toast.error(res?.message || 'Ajout impossible'); return; }
    setQuery(''); setResults([]); setSelectedAddIds([]);
    await load();
  };

  const transferOwner = async (targetUserId: string) => {
    const res = await apiService.post(`/api/messages/conversations/${conversationId}/transfer-owner`, { targetUserId });
    if (!res?.success) return toast.error(res?.message || 'Transfert impossible');
    await load();
  };

  const toggleAdmin = async (p: any) => {
    const role = p.role === 'admin' ? 'member' : 'admin';
    const res = await apiService.post(`/api/messages/conversations/${conversationId}/members/${p.id}/role`, { role });
    if (!res?.success) return toast.error(res?.message || 'Impossible');
    await load();
  };

  const ban = async (p: any) => {
    confirmAsync({
      title: 'Bannir',
      message: `Exclure @${p.username} du groupe ?`,
      confirmLabel: 'Bannir',
      destructive: true,
    }).then((ok) => {
      if (ok) (async () => {
          const res = await apiService.post(`/api/messages/conversations/${conversationId}/members/${p.id}/ban`, {});
          if (!res?.success) return toast.error(res?.message || 'Ban impossible');
          await load();
        })();
    });
  };

  const buildActions = (p: any): ActionSheetAction[] => {
    const actions: ActionSheetAction[] = [];
    if (myRole === 'owner' && String(p.id) !== String(myId)) {
      actions.push({
        label: 'Transférer le rôle owner',
        sublabel: 'Vous perdrez vos droits owner',
        icon: 'star-outline',
        color: '#fbbf24',
        onPress: () => transferOwner(p.id),
      });
    }
    if (p.role !== 'owner') {
      actions.push({
        label: p.role === 'admin' ? 'Retirer les droits admin' : 'Rendre administrateur',
        sublabel: p.role === 'admin' ? 'Repasse en membre simple' : 'Accès à la gestion du groupe',
        icon: p.role === 'admin' ? 'shield-outline' : 'shield-checkmark-outline',
        color: '#4F7CFF',
        onPress: () => toggleAdmin(p),
      });
      actions.push({
        label: 'Bannir du groupe',
        sublabel: 'Le membre sera retiré immédiatement',
        icon: 'ban-outline',
        color: '#ef4444',
        destructive: true,
        onPress: () => ban(p),
      });
    }
    return actions;
  };

  const selectedParticipant = sheet.participant;

  return (
    <ScreenBackground>
    <SafeAreaView style={styles.container}>
      {/* ── HEADER ── */}
      <View style={styles.header}>
        <BackButton navigation={navigation} />
        <View style={styles.headerMid}>
          <Text style={styles.headerTitle} numberOfLines={1}>{title || 'Groupe'}</Text>
          <Text style={styles.headerSub}>{participants.length} membre{participants.length !== 1 ? 's' : ''}</Text>
        </View>
        <View style={{ width: 36 }} />
      </View>

      {/* ── SEARCH / ADD ── */}
      {canManage && (
        <View style={styles.searchWrap}>
          <View style={styles.searchRow}>
            <Ionicons name="search" size={15} color="#536471" style={{ marginRight: 8 }} />
            <TextInput
              style={styles.searchInput}
              value={query}
              onChangeText={setQuery}
              placeholder="Ajouter des membres…"
              placeholderTextColor="#536471"
            />
            {query.length > 0 && (
              <TouchableOpacity onPress={() => setQuery('')}>
                <Ionicons name="close-circle" size={16} color="#536471" />
              </TouchableOpacity>
            )}
          </View>

          {results.length > 0 && (
            <ScrollView style={styles.suggestions} keyboardShouldPersistTaps="handled">
              {results.map((u) => {
                const selected = selectedAddIds.includes(String(u.id));
                return (
                  <TouchableOpacity key={u.id} style={styles.suggRow} onPress={() => toggleCandidate(String(u.id))}>
                    <Avatar avatar={u?.avatar} username={u?.username} />
                    <View style={{ flex: 1, marginLeft: 10 }}>
                      <Text style={styles.suggName}>@{u.username}</Text>
                      <Text style={styles.suggSub}>{u.full_name || 'Utilisateur'}</Text>
                    </View>
                    <View style={[styles.checkCircle, selected && styles.checkCircleActive]}>
                      {selected && <Ionicons name="checkmark" size={11} color="#fff" />}
                    </View>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          )}

          {selectedAddIds.length > 0 && (
            <TouchableOpacity style={styles.addBtn} onPress={addMembers}>
              <Ionicons name="person-add-outline" size={15} color="#fff" />
              <Text style={styles.addBtnTxt}>Ajouter ({selectedAddIds.length})</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* ── MEMBERS LIST ── */}
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 24 }}>
        <Text style={styles.sectionLabel}>Membres</Text>
        {participants.map((p, idx) => {
          const isSelf = String(p.id) === String(myId);
          const isOwner = p.role === 'owner' || (groupMeta?.created_by && String(groupMeta.created_by) === String(p.id));
          const actions = canManage && !isSelf ? buildActions(p) : [];

          return (
            <View key={p.id}>
              <View style={styles.memberRow}>
                {/* Avatar */}
                <View style={{ position: 'relative' }}>
                  <Avatar avatar={p?.avatar} username={p?.username} />
                  {isOwner && (
                    <View style={styles.ownerBadge}>
                      <Ionicons name="star" size={7} color="#000" />
                    </View>
                  )}
                </View>

                {/* Info */}
                <View style={styles.memberInfo}>
                  <View style={styles.memberNameRow}>
                    <PremiumDisplayName
                      text={p.full_name || `@${p.username}`}
                      baseStyle={styles.memberName}
                      isPremium={!!p?.premium}
                      subscriptionTierRaw={p?.subscription_tier}
                      fontId="system"
                      effectId="none"
                      numberOfLines={1}
                      customization={p?.profile_customization as ProfileCustomization | undefined}
                      verified={!!p?.verified}
                      verificationStyle={p?.verification_style || 'default'}
                    />
                    {!!p?.verified && (
                      <VerifiedBadge
                        verificationStyle={p?.verification_style || 'default'}
                        size={13}
                        tint={
                          certifiedNameColors(
                            p?.verification_style || 'default',
                            p?.profile_customization as ProfileCustomization | undefined,
                          ).from
                        }
                      />
                    )}
                    {isSelf && <Text style={styles.youTag}>vous</Text>}
                  </View>
                  <Text style={styles.memberHandle}>@{p.username}</Text>
                </View>

                {/* Role pill */}
                <RolePill role={p.role} />

                {/* Actions */}
                {actions.length > 0 && (
                  <TouchableOpacity
                    style={styles.moreBtn}
                    onPress={() => setSheet({ visible: true, participant: p })}
                  >
                    <Ionicons name="ellipsis-horizontal" size={16} color="#536471" />
                  </TouchableOpacity>
                )}
              </View>
              {idx < participants.length - 1 && <View style={styles.rowDivider} />}
            </View>
          );
        })}
      </ScrollView>

      {/* ── BOTTOM SHEET ── */}
      <BottomActionSheet
        visible={sheet.visible}
        onClose={() => setSheet({ visible: false })}
        title={selectedParticipant ? `@${selectedParticipant.username}` : undefined}
        actions={selectedParticipant ? buildActions(selectedParticipant) : []}
      />
    </SafeAreaView>
    </ScreenBackground>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: 'transparent' },

  /* Header */
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 12, paddingVertical: 10,
    borderBottomWidth: 0.5, borderBottomColor: '#1f2937',
  },
  iconBtn: {
    width: 36, height: 36, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#0e1117',
  },
  headerMid: { flex: 1, alignItems: 'center' },
  headerTitle: { color: '#e7e9ea', fontSize: 16, fontWeight: '800', fontFamily: fonts.bold, letterSpacing: -0.3 },
  headerSub: { color: '#536471', fontSize: 12, marginTop: 1 },

  /* Search */
  searchWrap: { paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 0.5, borderBottomColor: '#111' },
  searchRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#0e1117', borderWidth: 0.5, borderColor: '#1f2937',
    borderRadius: 24, paddingHorizontal: 14, height: 40,
  },
  searchInput: { flex: 1, color: '#e7e9ea', fontSize: 14 },
  suggestions: { maxHeight: 200, marginTop: 10 },
  suggRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 9,
    borderBottomWidth: 0.5, borderBottomColor: '#111',
  },
  suggName: { color: '#e7e9ea', fontSize: 13, fontWeight: '700' },
  suggSub: { color: '#536471', fontSize: 12, marginTop: 1 },
  checkCircle: {
    width: 22, height: 22, borderRadius: 11,
    borderWidth: 1.5, borderColor: '#2f3336',
    alignItems: 'center', justifyContent: 'center',
  },
  checkCircleActive: { backgroundColor: '#4F7CFF', borderColor: '#4F7CFF' },
  addBtn: {
    marginTop: 10, backgroundColor: '#4F7CFF',
    borderRadius: 20, flexDirection: 'row', alignItems: 'center',
    justifyContent: 'center', gap: 6, paddingVertical: 10,
  },
  addBtnTxt: { color: '#fff', fontWeight: '800', fontFamily: fonts.bold, fontSize: 14 },

  /* Section label */
  sectionLabel: {
    color: '#536471', fontSize: 11, fontWeight: '700', fontFamily: fonts.bold,
    letterSpacing: 0.8, textTransform: 'uppercase',
    paddingHorizontal: 16, paddingTop: 16, paddingBottom: 6,
  },

  /* Member row */
  memberRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 11,
  },
  rowDivider: { height: 0.5, backgroundColor: '#111', marginLeft: 74 },

  /* Avatar */
  avatar: { width: 42, height: 42, borderRadius: 21 },
  avatarFallback: {
    width: 42, height: 42, borderRadius: 21,
    backgroundColor: '#1a2740', alignItems: 'center', justifyContent: 'center',
  },
  avatarFallbackTxt: { color: '#4F7CFF', fontSize: 14, fontWeight: '700' },
  ownerBadge: {
    position: 'absolute', bottom: -1, right: -1,
    width: 15, height: 15, borderRadius: 8,
    backgroundColor: '#fbbf24', borderWidth: 1.5, borderColor: '#000',
    alignItems: 'center', justifyContent: 'center',
  },

  /* Member info */
  memberInfo: { flex: 1, marginLeft: 12, minWidth: 0 },
  memberNameRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  memberName: { color: '#e7e9ea', fontSize: 14, fontWeight: '700', fontFamily: fonts.bold, flexShrink: 1 },
  memberHandle: { color: '#536471', fontSize: 12, marginTop: 1 },
  youTag: {
    fontSize: 10, fontWeight: '700', fontFamily: fonts.bold, color: '#536471',
    backgroundColor: '#111', borderRadius: 4, paddingHorizontal: 5, paddingVertical: 1,
  },

  /* Role pill */
  rolePill: { borderRadius: 20, borderWidth: 0.5, paddingHorizontal: 8, paddingVertical: 3, marginLeft: 8 },
  rolePillText: { fontSize: 10, fontWeight: '700', fontFamily: fonts.bold, letterSpacing: 0.3 },

  /* More button */
  moreBtn: {
    width: 32, height: 32, borderRadius: 16,
    alignItems: 'center', justifyContent: 'center', marginLeft: 4,
  },

  /* Bottom Sheet */
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: '#0e1117', borderTopLeftRadius: 20, borderTopRightRadius: 20,
    paddingHorizontal: 16, paddingBottom: 34, paddingTop: 6,
    borderTopWidth: 0.5, borderColor: '#1f2937',
  },
  sheetTitle: {
    color: '#536471', fontSize: 12, fontWeight: '700', fontFamily: fonts.bold,
    textAlign: 'center', paddingVertical: 12,
    borderBottomWidth: 0.5, borderBottomColor: '#1f2937', marginBottom: 4,
  },
  sheetRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 13, gap: 14 },
  sheetDivider: { height: 0.5, backgroundColor: '#111' },
  sheetIcon: {
    width: 36, height: 36, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center',
  },
  sheetLabel: { color: '#e7e9ea', fontSize: 14, fontWeight: '700' },
  sheetSublabel: { color: '#536471', fontSize: 12, marginTop: 2 },
  sheetCancel: {
    marginTop: 10, backgroundColor: colors.overlayMedium, borderRadius: 14,
    alignItems: 'center', paddingVertical: 14,
  },
  sheetCancelTxt: { color: '#e7e9ea', fontWeight: '700', fontFamily: fonts.bold, fontSize: 15 },
});