import { fonts, colors, glow , statusBarStyle} from '../theme';
import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  Dimensions, RefreshControl, Animated, StatusBar,
  Image, ActivityIndicator,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../contexts/AuthContext';
import { liveService, LiveRoom } from '../services/liveService';
import { apiService } from '../services';
import { ScreenSkeleton } from '../components/ui';
import useForegroundInterval from '../hooks/useForegroundInterval';
import { LIST_TUNING } from '../utils/listTuning';

const { width, height } = Dimensions.get('window');
const TAB_BAR_HEIGHT = 49;

/**
 * 📡 LivesScreen — Liste TikTok-like des lives actifs + bouton "Go Live"
 */
export default function LivesScreen() {
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();

  const [lives, setLives] = useState<LiveRoom[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [joiningId, setJoiningId] = useState<string | null>(null);

  const cardHeight = height - insets.bottom - TAB_BAR_HEIGHT;
  const pulseAnim = useRef(new Animated.Value(1)).current;

  // Animation pulse pour le bouton LIVE
  // La boucle n'était jamais arrêtée : elle continuait de tourner après le
  // démontage de l'écran, pour le reste de la session.
  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.12, duration: 800, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
      ])
    );
    animation.start();
    return () => animation.stop();
  }, [pulseAnim]);

  const fetchLives = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    const data = await liveService.getLives();
    setLives(data);
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => {
    // Initial load
    fetchLives();

    // Socket listeners for real-time updates
    const { socket } = require('../services/liveService');
    
    const handleNewLive = (newRoom: LiveRoom) => {
      setLives(prev => {
        // Éviter les doublons
        if (prev.find(l => l.liveId === newRoom.liveId)) return prev;
        return [newRoom, ...prev];
      });
    };

    const handleLiveEnded = ({ liveId }: { liveId: string }) => {
      setLives(prev => prev.filter(l => l.liveId !== liveId));
    };

    socket.on('newLive', handleNewLive);
    socket.on('liveEnded', handleLiveEnded);

    return () => {
      socket.off('newLive', handleNewLive);
      socket.off('liveEnded', handleLiveEnded);
    };
  }, []);

  // Rafraîchissement périodique, suspendu hors avant-plan : ce sondage battait
  // toutes les 30 s même app fermée.
  const refreshLives = useCallback(() => {
    void fetchLives();
  }, [fetchLives]);
  useForegroundInterval(refreshLives, 30000, { runImmediately: false });

  const handleGoLive = () => {
    navigation.navigate('GoLive');
  };

  const handleJoinLive = useCallback((live: LiveRoom) => {
    navigation.navigate('LiveViewer', {
      liveId: live.liveId,
      playbackUrl: live.metadata.playbackUrl,
      hostName: live.metadata.hostName || live.hostId,
      hostAvatar: live.metadata.hostAvatar,
      verified: live.metadata.verified,
      verificationStyle: live.metadata.verificationStyle,
    });
  }, [navigation]);

  const keyExtractor = useCallback((item: LiveRoom) => item.liveId, []);

  const renderItem = useCallback(({ item }: { item: LiveRoom }) => (
    <LiveCard
      live={item}
      onPress={() => handleJoinLive(item)}
      joining={joiningId === item.liveId}
    />
  ), [handleJoinLive, joiningId]);

  // ── Empty State ─────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <View style={styles.container}>
        <StatusBar barStyle={statusBarStyle()} />
        <ScreenSkeleton variant="list" count={6} />
      </View>
    );
  }

  if (lives.length === 0) {
    return (
      <View style={styles.container}>
        <StatusBar barStyle={statusBarStyle()} />

        {/* Header */}
        <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
          <Text style={styles.headerTitle}>Lives</Text>
        </View>

        {/* Empty */}
        <View style={styles.emptyContainer}>
          <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
            <View style={styles.liveIconBig}>
              <Ionicons name="radio" size={48} color={colors.accent} />
            </View>
          </Animated.View>
          <Text style={styles.emptyTitle}>Aucun live en cours</Text>
          <Text style={styles.emptySubtitle}>Sois le premier à diffuser !</Text>
        </View>

        {/* Go Live button */}
         <GoLiveButton onPress={handleGoLive} insets={insets} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle={statusBarStyle()} />

      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Text style={styles.headerTitle}>Lives</Text>
        <View style={styles.liveCountBadge}>
          <View style={styles.liveDot} />
          <Text style={styles.liveCountText}>{lives.length} live{lives.length > 1 ? 's' : ''}</Text>
        </View>
      </View>

      {/* Liste TikTok-style */}
      <FlatList
        data={lives}
        {...LIST_TUNING}
        keyExtractor={keyExtractor}
        contentContainerStyle={{ paddingBottom: insets.bottom + TAB_BAR_HEIGHT + 80 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => fetchLives(true)}
            tintColor={colors.accent}
          />
        }
        renderItem={renderItem}
      />

      {/* Le bouton Go Live */}
      <GoLiveButton onPress={handleGoLive} insets={insets} />
    </View>
  );
}

// ── LiveCard ─────────────────────────────────────────────────────────────────

function LiveCard({ live, onPress, joining }: { live: LiveRoom; onPress: () => void; joining: boolean }) {
  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.85}>
      {/* Live badge */}
      <View style={styles.liveBadge}>
        <View style={styles.liveDotSmall} />
        <Text style={styles.liveBadgeText}>LIVE</Text>
      </View>

      {/* Viewer count */}
      <View style={styles.viewerBadge}>
        <Ionicons name="eye" size={12} color="#fff" />
        <Text style={styles.viewerText}>{live.viewerCount}</Text>
      </View>

      {/* Bottom info */}
      <View style={styles.cardBottom}>
        <View style={styles.hostAvatar}>
          <Ionicons name="person" size={20} color={colors.textPrimary} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.hostName} numberOfLines={1}>
            {live.metadata.hostName ? `@${live.metadata.hostName}` : `@${live.hostId.slice(0, 12)}...`}
          </Text>
          <Text style={styles.cardMeta}>
            {live.viewerCount} spectateur{live.viewerCount !== 1 ? 's' : ''}
          </Text>
        </View>
        {joining ? (
          <ActivityIndicator size="small" color={colors.textPrimary} />
        ) : (
          <TouchableOpacity style={styles.joinBtn} onPress={onPress}>
            <Text style={styles.joinBtnText}>Rejoindre</Text>
          </TouchableOpacity>
        )}
      </View>
    </TouchableOpacity>
  );
}

// ── GoLiveButton (FAB) ────────────────────────────────────────────────────────

function GoLiveButton({ onPress, insets }: { onPress: () => void; insets: any }) {
  return (
    <TouchableOpacity
      style={[styles.goLiveFab, { bottom: insets.bottom + TAB_BAR_HEIGHT + 16 }]}
      onPress={onPress}
      activeOpacity={0.85}
    >
      <View style={styles.goLiveFabFill}>
        <Ionicons name="radio" size={20} color="#fff" />
        <Text style={styles.goLiveFabText}>Lancer un live</Text>
      </View>
    </TouchableOpacity>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 12,
    gap: 10,
  },
  headerTitle: {
    fontSize: 16,
    fontFamily: fonts.heading,
    color: colors.textPrimary,
  },
  liveCountBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.redMuted,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
    gap: 5,
  },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.red },
  liveCountText: { color: colors.red, fontSize: 12, fontFamily: fonts.bold },
  loadingText: { color: colors.textMuted, marginTop: 12, fontSize: 14 },

  // Empty state
  emptyContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16 },
  liveIconBig: {
    width: 100, height: 100, borderRadius: 28,
    backgroundColor: colors.accentMuted,
    alignItems: 'center', justifyContent: 'center',
  },
  emptyTitle: { fontSize: 20, fontFamily: fonts.bold, color: colors.textPrimary },
  emptySubtitle: { fontSize: 14, color: colors.textSecondary },

  // Card
  card: {
    marginHorizontal: 16, marginBottom: 12,
    borderRadius: 18, overflow: 'hidden',
    height: 180,
    backgroundColor: colors.surface,
    borderWidth: 1, borderColor: colors.border,
  },
  liveBadge: {
    position: 'absolute', top: 14, left: 14,
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.red,
    borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3, gap: 5,
    zIndex: 2,
  },
  liveDotSmall: { width: 5, height: 5, borderRadius: 3, backgroundColor: '#fff' },
  liveBadgeText: { color: '#fff', fontSize: 11, fontFamily: fonts.bold, letterSpacing: 1 },
  viewerBadge: {
    position: 'absolute', top: 14, right: 14,
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: 20, paddingHorizontal: 8, paddingVertical: 4, gap: 4,
    zIndex: 2,
  },
  viewerText: { color: '#fff', fontSize: 12, fontFamily: fonts.semibold },
  cardBottom: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    flexDirection: 'row', alignItems: 'center',
    padding: 16, gap: 10,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  hostAvatar: {
    width: 38, height: 38, borderRadius: 12,
    backgroundColor: colors.accentMuted,
    alignItems: 'center', justifyContent: 'center',
  },
  hostName: { color: colors.textPrimary, fontSize: 14, fontFamily: fonts.bold },
  cardMeta: { color: colors.textSecondary, fontSize: 12 },
  joinBtn: {
    backgroundColor: colors.accent,
    borderRadius: 12, paddingHorizontal: 14, paddingVertical: 7,
  },
  joinBtnText: { color: colors.onAccent, fontSize: 13, fontFamily: fonts.bold },

  // FAB
  goLiveFab: {
    position: 'absolute', alignSelf: 'center',
    borderRadius: 16, overflow: 'hidden',
    ...glow(colors.accent, 18),
  },
  goLiveFabFill: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.accent,
    paddingHorizontal: 24, paddingVertical: 14, gap: 8,
  },
  goLiveFabText: { color: colors.onAccent, fontSize: 16, fontFamily: fonts.bold },
});
