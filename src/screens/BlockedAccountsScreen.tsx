import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, fonts, statusBarStyle } from '../theme';
import { ScreenBackground, BackButton, ScreenSkeleton, EmptyState } from '../components/ui';
import Avatar from '../components/Avatar';
import apiService from '../services/api';
import { toast } from '../components/ui/Toast';
import { LIST_TUNING } from '../utils/listTuning';

interface BlockedUser {
  id: string;
  username: string;
  full_name: string;
  avatar: string | null;
  verified?: boolean;
}

export default function BlockedAccountsScreen({ navigation }: any) {
  const [users, setUsers] = useState<BlockedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    const res = await apiService.getBlockedUsers({ limit: 100 });
    setUsers(res.success ? (res.data?.users as any) || [] : []);
  }, []);

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, [load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const handleUnblock = useCallback(async (user: BlockedUser) => {
    setBusyIds((prev) => new Set(prev).add(user.id));
    try {
      const res = await apiService.unblockUser(user.id);
      if (res.success) {
        setUsers((prev) => prev.filter((u) => u.id !== user.id));
        toast.success(`@${user.username} débloqué`);
      } else {
        toast.error(res.message || 'Impossible de débloquer ce compte');
      }
    } finally {
      setBusyIds((prev) => {
        const next = new Set(prev);
        next.delete(user.id);
        return next;
      });
    }
  }, []);

  const keyExtractor = useCallback((item: BlockedUser) => item.id, []);

  const renderItem = useCallback(({ item }: { item: BlockedUser }) => {
    const busy = busyIds.has(item.id);
    return (
      <View style={styles.row}>
        <View style={styles.rowUser}>
          <Avatar size={44} username={item.username} uri={item.avatar} />
          <View style={styles.rowUserInfo}>
            <Text style={styles.rowName} numberOfLines={1}>{item.full_name}</Text>
            <Text style={styles.rowUsername} numberOfLines={1}>@{item.username}</Text>
          </View>
        </View>
        <TouchableOpacity
          style={styles.unblockBtn}
          onPress={() => handleUnblock(item)}
          disabled={busy}
          activeOpacity={0.8}
        >
          {busy ? <ActivityIndicator size="small" color={colors.textPrimary} /> : <Text style={styles.unblockText}>Débloquer</Text>}
        </TouchableOpacity>
      </View>
    );
  }, [busyIds, handleUnblock]);

  return (
    <ScreenBackground>
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle={statusBarStyle()} backgroundColor="transparent" translucent />

        <View style={styles.header}>
          <BackButton navigation={navigation} />
          <Text style={styles.headerTitle}>Comptes bloqués</Text>
          <View style={{ width: 36 }} />
        </View>

        {loading ? (
          <ScreenSkeleton variant="list" />
        ) : (
          <FlatList
            data={users}
            {...LIST_TUNING}
            keyExtractor={keyExtractor}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.textSecondary} />}
            contentContainerStyle={users.length === 0 ? styles.emptyContent : styles.listContent}
            ListEmptyComponent={
              <EmptyState
                icon="ban-outline"
                title="Aucun compte bloqué"
                message="Les comptes que vous bloquez apparaîtront ici, à débloquer un par un."
              />
            }
            renderItem={renderItem}
          />
        )}
      </SafeAreaView>
    </ScreenBackground>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  headerTitle: { fontFamily: fonts.bold, fontSize: 17, color: colors.textPrimary },
  emptyContent: { flexGrow: 1 },
  listContent: { paddingBottom: 24 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
  },
  rowUser: { flexDirection: 'row', alignItems: 'center', flex: 1, gap: 12 },
  rowUserInfo: { flex: 1 },
  rowName: { fontFamily: fonts.semibold, fontSize: 15, color: colors.textPrimary },
  rowUsername: { fontFamily: fonts.regular, fontSize: 13, color: colors.textSecondary },
  unblockBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 18,
    minWidth: 92,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceAlt,
  },
  unblockText: { fontFamily: fonts.semibold, fontSize: 13, color: colors.textPrimary },
});
