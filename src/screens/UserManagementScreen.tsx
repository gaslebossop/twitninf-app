import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, StatusBar, ActivityIndicator, RefreshControl } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { AppHeader, ScreenBackground, EmptyState, GlassCard, confirmAsync, promptAsync, showActionSheet } from '../components/ui';
import { toast } from '../components/ui/Toast';
import { colors, fonts, radius, statusBarStyle } from '../theme';
import { useAdminPermissions } from '../hooks/useAdminPermissions';
import { moderationService, User } from '../services/moderationService';
import Avatar from '../components/Avatar';
import VerifiedBadge from '../components/VerifiedBadge';

type Tone = 'accent' | 'gold' | 'cyan' | 'danger' | 'neutral';
const TONE_COLOR: Record<Tone, string> = {
  accent: colors.accent, gold: colors.gold, cyan: colors.cyan, danger: colors.red, neutral: colors.textMuted,
};
const TONE_SOFT: Record<Tone, string> = {
  accent: colors.accentSoft, gold: 'rgba(255,210,77,0.10)', cyan: colors.cyanSoft, danger: colors.redMuted, neutral: colors.overlaySoft,
};
const STATUS_TONE: Record<string, Tone> = { active: 'accent', suspended: 'gold', banned: 'danger' };
const STATUS_LABEL: Record<string, string> = { active: 'Actif', suspended: 'Suspendu', banned: 'Banni' };
const STATUS_ICON: Record<string, keyof typeof Ionicons.glyphMap> = { active: 'checkmark-circle', suspended: 'pause-circle', banned: 'ban' };

const FILTERS = [
  { key: 'all', label: 'Tous' },
  { key: 'active', label: 'Actifs' },
  { key: 'suspended', label: 'Suspendus' },
  { key: 'banned', label: 'Bannis' },
] as const;

const DURATIONS: { label: string; hours: number }[] = [
  { label: '24 heures', hours: 24 },
  { label: '7 jours', hours: 7 * 24 },
  { label: '30 jours', hours: 30 * 24 },
];

export default function UserManagementScreen() {
  const navigation = useNavigation();
  const { canBanUsers, canSuspendUsers, canVerifyUsers } = useAdminPermissions();

  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<typeof FILTERS[number]['key']>('all');

  const load = useCallback(async () => {
    try {
      const data = await moderationService.getUsers();
      setUsers(data || []);
    } catch {
      toast.error('Impossible de charger les utilisateurs');
      setUsers([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const onRefresh = useCallback(() => { setRefreshing(true); load(); }, [load]);

  const filtered = users.filter((u) => {
    const q = search.trim().toLowerCase();
    const matchesSearch = !q || u.username?.toLowerCase().includes(q) || u.fullName?.toLowerCase().includes(q);
    const matchesFilter = filter === 'all' || u.status === filter;
    return matchesSearch && matchesFilter;
  });

  const run = async (user: User, label: string, action: () => Promise<boolean>) => {
    setBusyId(user.id);
    try {
      const ok = await action();
      if (ok) {
        toast.success(`@${user.username} : ${label}`);
        load();
      } else {
        toast.error('Action impossible');
      }
    } catch {
      toast.error('Une erreur est survenue');
    } finally {
      setBusyId(null);
    }
  };

  const suspendWithDuration = async (user: User, hours: number, label: string) => {
    const reason = await promptAsync({
      title: `Suspendre @${user.username}`,
      message: `Suspension de ${label}`,
      placeholder: 'Raison de la suspension',
    });
    if (reason === null) return;
    run(user, 'suspendu', () => moderationService.suspendUser(user.id, reason, hours));
  };

  const suspend = (user: User) => {
    showActionSheet({
      title: 'Durée de la suspension',
      items: DURATIONS.map((d) => ({
        label: d.label,
        icon: 'time-outline' as const,
        onPress: () => suspendWithDuration(user, d.hours, d.label),
      })),
    });
  };

  const ban = async (user: User) => {
    const ok = await confirmAsync({
      title: `Bannir @${user.username}`,
      message: 'Bannissement permanent — le compte perd tout accès.',
      confirmLabel: 'Bannir',
      destructive: true,
    });
    if (!ok) return;
    const reason = await promptAsync({
      title: `Bannir @${user.username}`,
      message: 'Raison du bannissement',
      placeholder: 'Ex : harcèlement répété',
    });
    if (reason === null) return;
    run(user, 'banni', () => moderationService.banUser(user.id, reason, undefined, true));
  };

  const openMore = (user: User) => {
    const items = [];
    if (user.status === 'suspended' && canSuspendUsers) {
      items.push({ label: 'Réactiver', icon: 'play-circle-outline' as const, onPress: () => run(user, 'réactivé', () => moderationService.unsuspendUser(user.id)) });
    }
    if (user.status === 'banned' && canBanUsers) {
      items.push({ label: 'Débannir', icon: 'refresh-outline' as const, onPress: () => run(user, 'débanni', () => moderationService.unbanUser(user.id)) });
    }
    if (user.status === 'active' && canSuspendUsers) {
      items.push({ label: 'Suspendre', icon: 'pause-circle-outline' as const, onPress: () => suspend(user) });
    }
    if (user.status === 'active' && canBanUsers) {
      items.push({ label: 'Bannir', icon: 'ban-outline' as const, destructive: true, onPress: () => ban(user) });
    }
    if (canVerifyUsers) {
      items.push(user.verified
        ? { label: 'Révoquer la vérification', icon: 'close-circle-outline' as const, destructive: true, onPress: () => run(user, 'vérification révoquée', () => moderationService.unverifyUser(user.id)) }
        : { label: 'Vérifier', icon: 'checkmark-circle-outline' as const, onPress: () => run(user, 'vérifié', () => moderationService.verifyUser(user.id)) });
    }

    showActionSheet({ title: `@${user.username}`, items });
  };

  if (!canBanUsers && !canSuspendUsers) {
    return (
      <ScreenBackground>
        <StatusBar barStyle={statusBarStyle()} backgroundColor="transparent" translucent />
        <AppHeader navigation={navigation} title="Gestion utilisateurs" />
        <View style={styles.deniedBox}>
          <Ionicons name="shield-outline" size={56} color={colors.red} />
          <Text style={styles.deniedTitle}>Accès restreint</Text>
          <Text style={styles.deniedText}>Tu n'as pas les permissions nécessaires pour accéder à cette section.</Text>
        </View>
      </ScreenBackground>
    );
  }

  return (
    <ScreenBackground>
      <StatusBar barStyle={statusBarStyle()} backgroundColor="transparent" translucent />
      <AppHeader
        navigation={navigation}
        title="Gestion utilisateurs"
        right={(
          <View style={styles.headerCount}>
            <Text style={styles.headerCountText}>{users.length}</Text>
          </View>
        )}
      />

      <View style={styles.searchRow}>
        <Ionicons name="search" size={17} color={colors.textMuted} />
        <TextInput
          style={styles.searchInput}
          placeholder="Rechercher un utilisateur..."
          placeholderTextColor={colors.textMuted}
          value={search}
          onChangeText={setSearch}
        />
        {search.length > 0 && (
          <TouchableOpacity onPress={() => setSearch('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="close-circle" size={17} color={colors.textMuted} />
          </TouchableOpacity>
        )}
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterRow} contentContainerStyle={styles.filterRowContent}>
        {FILTERS.map((f) => {
          const active = filter === f.key;
          const count = f.key === 'all' ? users.length : users.filter((u) => u.status === f.key).length;
          return (
            <TouchableOpacity key={f.key} style={[styles.filterChip, active && styles.filterChipActive]} onPress={() => setFilter(f.key)} activeOpacity={0.8}>
              <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>{f.label} ({count})</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {loading ? (
        <View style={styles.loadingBox}><ActivityIndicator color={colors.accent} /></View>
      ) : (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />}
        >
          {filtered.length === 0 ? (
            <EmptyState icon="people-outline" title="Aucun utilisateur" message="Aucun compte ne correspond à ta recherche." />
          ) : (
            filtered.map((u) => {
              const tone = STATUS_TONE[u.status] || 'neutral';
              return (
                <GlassCard key={u.id} style={styles.card}>
                  <View style={styles.cardRow}>
                    <Avatar size={44} username={u.username} uri={u.avatar} />
                    <View style={{ flex: 1 }}>
                      <View style={styles.nameRow}>
                        <Text style={styles.userName} numberOfLines={1}>{u.fullName || u.username}</Text>
                        {u.verified && <VerifiedBadge verificationStyle={(u as any).verification_style || 'default'} size={14} />}
                      </View>
                      <Text style={styles.userHandle}>@{u.username}</Text>
                      <Text style={styles.userStats}>
                        {u.followers} abonnés · {u.tweets} tweets
                        {u.reports > 0 ? ` · ${u.reports} signalement${u.reports > 1 ? 's' : ''}` : ''}
                      </Text>
                    </View>
                    <TouchableOpacity onPress={() => openMore(u)} disabled={busyId === u.id} style={styles.moreBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                      {busyId === u.id ? <ActivityIndicator size="small" color={colors.textSecondary} /> : <Ionicons name="ellipsis-horizontal" size={20} color={colors.textSecondary} />}
                    </TouchableOpacity>
                  </View>
                  <View style={[styles.statusBadge, { backgroundColor: TONE_SOFT[tone] }]}>
                    <Ionicons name={STATUS_ICON[u.status]} size={12} color={TONE_COLOR[tone]} />
                    <Text style={[styles.statusText, { color: TONE_COLOR[tone] }]}>{STATUS_LABEL[u.status] || u.status}</Text>
                  </View>
                </GlassCard>
              );
            })
          )}
          <View style={{ height: 40 }} />
        </ScrollView>
      )}
    </ScreenBackground>
  );
}

const styles = StyleSheet.create({
  headerCount: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: radius.round, backgroundColor: colors.overlaySoft },
  headerCountText: { fontSize: 12, fontFamily: fonts.semibold, color: colors.textSecondary },
  searchRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    marginHorizontal: 16, marginBottom: 10, paddingHorizontal: 12, height: 42,
    borderRadius: radius.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
  },
  searchInput: { flex: 1, fontSize: 14, color: colors.textPrimary },
  filterRow: { maxHeight: 44, flexGrow: 0, marginBottom: 6 },
  filterRowContent: { paddingHorizontal: 16, gap: 8 },
  filterChip: {
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: radius.round,
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
  },
  filterChipActive: { backgroundColor: colors.accentSoft, borderColor: colors.accentMuted },
  filterChipText: { fontSize: 12.5, fontFamily: fonts.medium, color: colors.textSecondary },
  filterChipTextActive: { color: colors.accent, fontFamily: fonts.semibold },
  loadingBox: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scroll: { flex: 1 },
  content: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 20 },
  card: { padding: 14, marginBottom: 10 },
  cardRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  userName: { fontSize: 14.5, fontFamily: fonts.semibold, color: colors.textPrimary, flexShrink: 1 },
  userHandle: { fontSize: 12.5, color: colors.textMuted, marginTop: 1 },
  userStats: { fontSize: 11.5, color: colors.textMuted, marginTop: 4 },
  moreBtn: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  statusBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start', marginTop: 10, paddingHorizontal: 9, paddingVertical: 5, borderRadius: radius.round },
  statusText: { fontSize: 10.5, fontFamily: fonts.semibold, textTransform: 'uppercase', letterSpacing: 0.3 },
  deniedBox: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, gap: 8 },
  deniedTitle: { fontSize: 20, fontFamily: fonts.bold, color: colors.textPrimary, marginTop: 8 },
  deniedText: { fontSize: 14, color: colors.textMuted, textAlign: 'center', lineHeight: 20 },
});
