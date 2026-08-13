import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
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
import { Ionicons } from '@expo/vector-icons';
import { colors, fonts , statusBarStyle} from '../theme';
import { ScreenBackground, BackButton, ScreenSkeleton, EmptyState } from '../components/ui';
import apiService from '../services/api';
import { API_CONFIG } from '../config/api';
import unreadService from '../services/unreadService';
import VerifiedBadge from '../components/VerifiedBadge';
import PremiumDisplayName from '../components/PremiumDisplayName';
import { certifiedNameColors, type ProfileCustomization } from '../services/profileCustomizationService';

interface FollowRequest {
  id: string;
  createdAt: string;
  follower: {
    id: string;
    username: string;
    full_name: string;
    avatar: string | null;
    verified?: boolean;
    verification_style?: string;
    premium?: boolean;
    subscription_tier?: string;
    profile_customization?: ProfileCustomization;
  };
}

function getAvatarUri(avatar: string | null | undefined): string | null {
  if (!avatar) return null;
  if (avatar.startsWith('http')) return avatar;
  return `${API_CONFIG.BASE_URL}/static/avatars/${avatar}`;
}

export default function FollowRequestsScreen({ navigation }: any) {
  const [requests, setRequests] = useState<FollowRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set());

  const loadRequests = useCallback(async () => {
    try {
      const res = await apiService.getFollowRequests();
      setRequests(res?.success ? res.data?.requests || [] : []);
    } catch {
      setRequests([]);
    }
  }, []);

  useEffect(() => {
    loadRequests().finally(() => setLoading(false));
  }, [loadRequests]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadRequests();
    setRefreshing(false);
  };

  const handleAccept = async (item: FollowRequest) => {
    setBusyIds((prev) => new Set(prev).add(item.id));
    try {
      const res = await apiService.acceptFollowRequest(item.id);
      if (res?.success) {
        setRequests((prev) => prev.filter((r) => r.id !== item.id));
        unreadService.notifyChanged();
      }
    } finally {
      setBusyIds((prev) => {
        const next = new Set(prev);
        next.delete(item.id);
        return next;
      });
    }
  };

  const handleReject = async (item: FollowRequest) => {
    setBusyIds((prev) => new Set(prev).add(item.id));
    try {
      const res = await apiService.rejectFollowRequest(item.id);
      if (res?.success) {
        setRequests((prev) => prev.filter((r) => r.id !== item.id));
      }
    } finally {
      setBusyIds((prev) => {
        const next = new Set(prev);
        next.delete(item.id);
        return next;
      });
    }
  };

  const openProfile = (userId: string, username: string) => {
    navigation.navigate('UserProfile', { userId, username });
  };

  return (
    <ScreenBackground>
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle={statusBarStyle()} backgroundColor="transparent" translucent />

        <View style={styles.header}>
          <BackButton navigation={navigation} />
          <Text style={styles.headerTitle}>Demandes d'abonnement</Text>
          <View style={{ width: 36 }} />
        </View>

        {loading ? (
          <ScreenSkeleton variant="list" />
        ) : (
          <FlatList
            data={requests}
            keyExtractor={(item) => item.id}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.textSecondary} />}
            contentContainerStyle={requests.length === 0 ? styles.emptyContent : styles.listContent}
            ListEmptyComponent={
              <EmptyState
                icon="person-add-outline"
                title="Aucune demande en attente"
                message="Ton compte est privé : les demandes d’abonnement apparaîtront ici, à accepter ou refuser une par une."
              />
            }
            renderItem={({ item }) => {
              const busy = busyIds.has(item.id);
              const avatarUri = getAvatarUri(item.follower.avatar);
              return (
                <View style={styles.row}>
                  <TouchableOpacity
                    style={styles.rowUser}
                    onPress={() => openProfile(item.follower.id, item.follower.username)}
                    activeOpacity={0.7}
                  >
                    {avatarUri ? (
                      <Image source={{ uri: avatarUri }} style={styles.avatar} />
                    ) : (
                      <View style={[styles.avatar, styles.avatarFallback]}>
                        <Ionicons name="person" size={20} color={colors.textSecondary} />
                      </View>
                    )}
                    <View style={styles.rowUserInfo}>
                      <View style={styles.rowNameLine}>
                        <PremiumDisplayName
                          text={item.follower.full_name}
                          baseStyle={styles.rowName}
                          isPremium={!!item.follower.premium}
                          subscriptionTierRaw={item.follower.subscription_tier}
                          fontId="system"
                          effectId="none"
                          numberOfLines={1}
                          customization={item.follower.profile_customization}
                          verified={!!item.follower.verified}
                          verificationStyle={item.follower.verification_style as any}
                        />
                        {item.follower.verified && (
                          <VerifiedBadge
                            verificationStyle={item.follower.verification_style as any}
                            size={13}
                            tint={
                              certifiedNameColors(
                                item.follower.verification_style as any,
                                item.follower.profile_customization,
                              ).from
                            }
                          />
                        )}
                      </View>
                      <Text style={styles.rowUsername} numberOfLines={1}>@{item.follower.username}</Text>
                    </View>
                  </TouchableOpacity>

                  <View style={styles.actions}>
                    <TouchableOpacity
                      style={[styles.actionBtn, styles.declineBtn]}
                      onPress={() => handleReject(item)}
                      disabled={busy}
                      activeOpacity={0.8}
                    >
                      {busy ? <ActivityIndicator size="small" color={colors.textSecondary} /> : <Text style={styles.declineText}>Refuser</Text>}
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.actionBtn, styles.acceptBtn]}
                      onPress={() => handleAccept(item)}
                      disabled={busy}
                      activeOpacity={0.8}
                    >
                      {busy ? <ActivityIndicator size="small" color={colors.white} /> : <Text style={styles.acceptText}>Accepter</Text>}
                    </TouchableOpacity>
                  </View>
                </View>
              );
            }}
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
  headerTitle: {
    fontFamily: fonts.bold,
    fontSize: 17,
    color: colors.textPrimary,
  },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 60, gap: 12 },
  emptyContent: { flexGrow: 1 },
  emptyText: { fontFamily: fonts.regular, fontSize: 14, color: colors.textSecondary, textAlign: 'center', paddingHorizontal: 32 },
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
  avatar: { width: 46, height: 46, borderRadius: 23 },
  avatarFallback: { backgroundColor: colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' },
  rowUserInfo: { flex: 1 },
  rowNameLine: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  rowName: { fontFamily: fonts.semibold, fontSize: 15, color: colors.textPrimary },
  rowUsername: { fontFamily: fonts.regular, fontSize: 13, color: colors.textSecondary },
  actions: { flexDirection: 'row', gap: 8 },
  actionBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 18,
    minWidth: 76,
    alignItems: 'center',
    justifyContent: 'center',
  },
  declineBtn: { backgroundColor: colors.surfaceAlt },
  acceptBtn: { backgroundColor: colors.accent },
  declineText: { fontFamily: fonts.semibold, fontSize: 13, color: colors.textPrimary },
  acceptText: { fontFamily: fonts.semibold, fontSize: 13, color: colors.white },
});
