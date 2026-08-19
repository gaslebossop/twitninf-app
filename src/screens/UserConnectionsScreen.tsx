import React, { useCallback, useEffect, useRef, useState } from 'react';
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
// La version de react-native (core) ne pose aucun inset sur Android — seule
// celle de react-native-safe-area-context protège le haut de l'écran partout.
import { SafeAreaView } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { ScreenBackground, BackButton, ScreenSkeleton } from '../components/ui';
import Avatar from '../components/Avatar';
import VerifiedBadge from '../components/VerifiedBadge';
import PremiumDisplayName from '../components/PremiumDisplayName';
import { certifiedNameColors, type ProfileCustomization } from '../services/profileCustomizationService';
import apiService from '../services/api';
import { User } from '../types/api';
import { colors, fonts , statusBarStyle} from '../theme';

type ConnectionTab = 'followers' | 'following';

interface UserConnectionsParams {
  userId: string;
  username?: string;
  initialTab?: ConnectionTab;
}

const PAGE_SIZE = 30;

export default function UserConnectionsScreen({ navigation, route }: any) {
  const params = (route?.params || {}) as UserConnectionsParams;
  const [activeTab, setActiveTab] = useState<ConnectionTab>(params.initialTab || 'followers');
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const requestId = useRef(0);

  const loadConnections = useCallback(async (reset = true) => {
    if (!params.userId) return;
    const currentRequest = ++requestId.current;
    const offset = reset ? 0 : users.length;

    try {
      if (reset) setLoading(true);
      else setLoadingMore(true);

      const response = activeTab === 'followers'
        ? await apiService.getUserFollowers(params.userId, { limit: PAGE_SIZE, offset })
        : await apiService.getUserFollowing(params.userId, { limit: PAGE_SIZE, offset });

      if (currentRequest !== requestId.current) return;
      const responseData = response.data as {
        followers?: User[];
        following?: User[];
        pagination?: { hasMore?: boolean };
      } | undefined;
      const nextUsers = response?.success
        ? (activeTab === 'followers' ? responseData?.followers : responseData?.following) || []
        : [];
      setUsers((previous) => reset ? nextUsers : [...previous, ...nextUsers]);
      setHasMore(!!responseData?.pagination?.hasMore);
    } catch {
      if (currentRequest === requestId.current && reset) {
        setUsers([]);
        setHasMore(false);
      }
    } finally {
      if (currentRequest === requestId.current) {
        setLoading(false);
        setRefreshing(false);
        setLoadingMore(false);
      }
    }
  }, [activeTab, params.userId, users.length]);

  useEffect(() => {
    setUsers([]);
    void loadConnections(true);
  }, [activeTab, params.userId]);

  const onRefresh = () => {
    setRefreshing(true);
    void loadConnections(true);
  };

  const loadMore = () => {
    if (!loading && !loadingMore && hasMore) void loadConnections(false);
  };

  const openProfile = useCallback((item: User) => {
    navigation.push('UserProfile', { userId: item.id, username: item.username });
  }, [navigation]);

  const keyExtractor = useCallback((item: User) => item.id, []);

  const renderItem = useCallback(({ item }: { item: User }) => (
    <TouchableOpacity style={styles.row} onPress={() => openProfile(item)} activeOpacity={0.72}>
      <Avatar size={48} username={item.username} uri={item.avatar} />
      <View style={styles.identity}>
        <View style={styles.nameLine}>
          <PremiumDisplayName
            text={item.full_name || item.username}
            baseStyle={styles.name}
            isPremium={!!(item as any)?.premium}
            subscriptionTierRaw={(item as any)?.subscription_tier}
            fontId="system"
            effectId="none"
            numberOfLines={1}
            customization={(item as any)?.profile_customization as ProfileCustomization | undefined}
            verified={!!item.verified}
            verificationStyle={(item.verification_style as any) || 'default'}
          />
          {item.verified && (
            <VerifiedBadge
              verificationStyle={(item.verification_style as any) || 'default'}
              size={14}
              tint={
                certifiedNameColors(
                  (item.verification_style as any) || 'default',
                  (item as any)?.profile_customization as ProfileCustomization | undefined,
                ).from
              }
            />
          )}
        </View>
        <Text style={styles.username} numberOfLines={1}>@{item.username}</Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
    </TouchableOpacity>
  ), [openProfile]);

  return (
    <ScreenBackground>
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle={statusBarStyle()} backgroundColor="transparent" translucent />

        <View style={styles.header}>
          <BackButton navigation={navigation} />
          <View style={styles.headerText}>
            <Text style={styles.headerTitle}>Réseau</Text>
            {!!params.username && <Text style={styles.headerSubtitle}>@{params.username}</Text>}
          </View>
          <View style={{ width: 28 }} />
        </View>

        <View style={styles.tabs}>
          {([
            { key: 'followers', label: 'Abonnés' },
            { key: 'following', label: 'Abonnements' },
          ] as const).map((tab) => (
            <TouchableOpacity
              key={tab.key}
              style={styles.tab}
              onPress={() => setActiveTab(tab.key)}
              activeOpacity={0.75}
            >
              <Text style={[styles.tabText, activeTab === tab.key && styles.tabTextActive]}>
                {tab.label}
              </Text>
              {activeTab === tab.key && <View style={styles.tabUnderline} />}
            </TouchableOpacity>
          ))}
        </View>

        {loading && users.length === 0 ? (
          <ScreenSkeleton variant="list" />
        ) : (
          <FlatList
            data={users}
            keyExtractor={keyExtractor}
            renderItem={renderItem}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.textSecondary} />
            }
            onEndReached={loadMore}
            onEndReachedThreshold={0.35}
            ListFooterComponent={loadingMore ? <ActivityIndicator style={styles.footer} color={colors.accent} /> : null}
            ListEmptyComponent={
              <View style={styles.empty}>
                <Ionicons name="people-outline" size={46} color={colors.textMuted} />
                <Text style={styles.emptyTitle}>
                  {activeTab === 'followers' ? 'Aucun abonné' : 'Aucun abonnement'}
                </Text>
              </View>
            }
            contentContainerStyle={users.length === 0 ? styles.emptyContent : styles.listContent}
          />
        )}
      </SafeAreaView>
    </ScreenBackground>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    minHeight: 58,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerText: { alignItems: 'center' },
  headerTitle: { color: colors.textPrimary, fontFamily: fonts.bold, fontSize: 17 },
  headerSubtitle: { color: colors.textSecondary, fontFamily: fonts.regular, fontSize: 12, marginTop: 1 },
  tabs: { flexDirection: 'row', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.borderSubtle },
  tab: { flex: 1, height: 48, alignItems: 'center', justifyContent: 'center' },
  tabText: { color: colors.textSecondary, fontFamily: fonts.semibold, fontSize: 14 },
  tabTextActive: { color: colors.textPrimary },
  tabUnderline: { position: 'absolute', bottom: 0, height: 3, width: 62, borderRadius: 2, backgroundColor: colors.accent },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  listContent: { paddingBottom: 28 },
  emptyContent: { flexGrow: 1 },
  row: {
    minHeight: 70,
    paddingHorizontal: 16,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.borderSubtle,
  },
  identity: { flex: 1 },
  nameLine: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  name: { flexShrink: 1, color: colors.textPrimary, fontFamily: fonts.semibold, fontSize: 15 },
  username: { color: colors.textSecondary, fontFamily: fonts.regular, fontSize: 13, marginTop: 2 },
  footer: { paddingVertical: 18 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, paddingHorizontal: 28 },
  emptyTitle: { color: colors.textSecondary, fontFamily: fonts.semibold, fontSize: 15 },
});
