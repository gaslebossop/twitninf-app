import { fonts, colors , statusBarStyle} from '../theme';
import React, { useState, useRef, useEffect, useCallback, useContext } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  FlatList,
  TouchableOpacity,
  Platform,
  StatusBar,
  Animated,
  Image,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BottomTabBarHeightContext } from '@react-navigation/bottom-tabs';
import { apiService } from '../services';
import { Tweet } from '../types/api';
import Avatar from '../components/Avatar';
import { useFocusEffect } from '@react-navigation/native';
import { Video, ResizeMode, Audio, InterruptionModeIOS, InterruptionModeAndroid } from 'expo-av';
import { BlurView } from 'expo-blur';
import VerifiedBadge from '../components/VerifiedBadge';
import CommentSheet from '../components/CommentSheet';
import { ScreenSkeleton } from '../components/ui';

const { width, height } = Dimensions.get('window');

// ─── Helpers ──────────────────────────────────────────────────────────────────

const formatCount = (n: number) => {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
  return n.toString();
};

/**
 * Extrait un compteur depuis un objet tweet en testant plusieurs chemins
 * possibles selon ce que renvoie réellement l'API.
 */
function pickCount(tweet: any, ...keys: string[]): number {
  for (const key of keys) {
    if (key.includes('.')) {
      const [parent, child] = key.split('.');
      const val = tweet?.[parent]?.[child];
      if (typeof val === 'number') return val;
    } else {
      const val = tweet?.[key];
      if (typeof val === 'number') return val;
    }
  }
  return 0;
}

// ─── Text / font helpers ───────────────────────────────────────────────────────

const FONTS = [
  { id: 'classic', label: 'Aa', style: { fontWeight: '600' as const } },
  { id: 'bold', label: 'Aa', style: { fontWeight: '900' as const, letterSpacing: 2 } },
  { id: 'serif', label: 'Aa', style: { fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif' } },
  { id: 'mono', label: 'Aa', style: { fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace', fontWeight: '700' as const } },
  { id: 'script', label: 'Aa', style: { fontFamily: Platform.OS === 'ios' ? 'Noteworthy-Bold' : 'cursive', fontStyle: 'italic' as const } },
];
const getFont = (id: string) => FONTS.find(f => f.id === id) ?? FONTS[0];

const getBgStyle = (bgMode: string, color: string) => {
  if (bgMode === 'solid') return { backgroundColor: color === '#FFFFFF' ? '#000' : '#FFF', paddingHorizontal: 12, paddingVertical: 5, borderRadius: 8 };
  if (bgMode === 'semi') return { backgroundColor: 'rgba(0,0,0,0.6)', paddingHorizontal: 12, paddingVertical: 5, borderRadius: 8 };
  return {};
};

const OutlinedText = ({
  text, color, outline, outlineColor, style,
}: {
  text: string; color: string; outline: boolean; outlineColor: string; style: any;
}) => {
  if (!outline) return <Text style={[style, { color }]}>{text}</Text>;

  const d = 2;
  const offsets = [[-d, -d], [0, -d], [d, -d], [-d, 0], [d, 0], [-d, d], [0, d], [d, d]];

  return (
    <View style={{ alignSelf: 'flex-start' }}>
      {offsets.map(([dx, dy], i) => (
        <Text key={i} style={[style, { color: outlineColor, position: 'absolute', left: dx, top: dy }]} pointerEvents="none">
          {text}
        </Text>
      ))}
      <Text style={[style, { color }]}>{text}</Text>
    </View>
  );
};

// ─── VideoCard ─────────────────────────────────────────────────────────────────

interface VideoCardProps {
  tweet: Tweet;
  isActive: boolean;
  onSheetToggle: (isVisible: boolean) => void;
  cardHeight: number; // ✅ hauteur responsive passée par le parent
}

// `React.memo` (comparaison par défaut, référence des props) : sans lui, le
// `CellRenderer` de la `FlatList` (une `PureComponent`) propage à TOUTES les
// cartes montées le moindre re-rendu de l'écran — dont `activeVideoId`, qui
// change à CHAQUE glissé. Une carte porte un `<Video>` expo-av monté en
// permanence dès que `videoUrl` existe : c'est le re-rendu le plus coûteux du
// dépôt. `setVideos` préserve les références des tweets déjà chargés
// (`[...prev, ...newTweets]`), donc `tweet` reste stable d'un rendu à l'autre
// pour une carte qui n'a pas changé — la comparaison par défaut est donc
// suffisante ici, contrairement à `TweetRow` qui a besoin d'un comparateur
// dédié.
const VideoCard: React.FC<VideoCardProps> = React.memo(function VideoCard({ tweet, isActive, onSheetToggle, cardHeight }) {
  const [liked, setLiked] = useState<boolean>(
    tweet.user_interaction?.is_liked ?? false
  );
  const [saved, setSaved] = useState<boolean>(
    (tweet.user_interaction as any)?.is_bookmarked ?? false
  );
  const [followed, setFollowed] = useState(false);
  const [showComments, setShowComments] = useState(false);

  useEffect(() => {
    onSheetToggle(showComments);
  }, [showComments]);

  const [likeCount, setLikeCount] = useState<number>(
    pickCount(tweet, 'stats.likes', 'stats.likes_count', 'likes_count', 'likes')
  );
  const [retweeted, setRetweeted] = useState<boolean>(
    tweet.user_interaction?.is_retweeted ?? false
  );
  const [retweetCount, setRetweetCount] = useState<number>(
    pickCount(tweet, 'stats.retweets', 'stats.retweets_count', 'retweets_count', 'retweets')
  );
  const [replyCount] = useState<number>(
    pickCount(tweet, 'stats.replies', 'stats.replies_count', 'replies_count', 'replies')
  );

  // ── Video setup ───────────────────────────────────────────────────────────────
  const videoRef = useRef<Video>(null);
  const [videoReady, setVideoReady] = useState(false);

  const baseURL = apiService.getConnectionStatus().baseURL;

  const resolveUrl = (raw?: string) =>
    raw ? (raw.startsWith('http') ? raw : `${baseURL}${raw}`) : null;

  const videoUrl = resolveUrl(tweet.media_urls?.[0]);
  const thumbUrl = resolveUrl(tweet.media_urls?.[1]) ?? undefined;

  let overlays: any[] = [];
  try {
    const rawOverlays = (tweet.metadata as any)?.overlay_texts;
    if (rawOverlays) overlays = Array.isArray(rawOverlays) ? rawOverlays : JSON.parse(rawOverlays);
  } catch (e) {
    console.error('overlay_texts parse error', e);
  }

  // ── Engagement Tracking ──────────────────────────────────────────────────────
  const watchTimeRef = useRef(0);
  const lastUpdateRef = useRef(Date.now());
  const hasSentViewRef = useRef(false);

  const reportEngagement = async (timeMs: number) => {
    if (timeMs < 100) return;
    try {
      await apiService.post('/api/behavior/engagement', {
        content_id: tweet.id,
        content_type: 'tweet',
        time_spent: timeMs
      });
    } catch (e) {
      console.warn('[Engagement] Failed to report time', e);
    }
  };

  const reportView = async () => {
    if (hasSentViewRef.current) return;
    hasSentViewRef.current = true;
    try {
      await apiService.post('/api/behavior/tweet-interaction', {
        tweet_id: tweet.id,
        interaction_type: 'media_view'
      });
    } catch (e) {
      console.warn('[Engagement] Failed to report view', e);
    }
  };

  const onPlaybackStatusUpdate = (status: any) => {
    if (!status.isLoaded) return;

    if (status.isPlaying) {
      const now = Date.now();
      const delta = now - lastUpdateRef.current;
      if (delta > 100 && delta < 5000) {
        watchTimeRef.current += delta;
      }
      lastUpdateRef.current = now;

      if (!hasSentViewRef.current && watchTimeRef.current > 500) {
        reportView();
      }

      if (watchTimeRef.current > 5000) {
        const toReport = watchTimeRef.current;
        watchTimeRef.current = 0;
        reportEngagement(toReport);
      }
    } else {
      lastUpdateRef.current = Date.now();
    }

    if (status.didJustFinish && status.isLooping) {
      if (watchTimeRef.current > 0) {
        reportEngagement(watchTimeRef.current);
        watchTimeRef.current = 0;
      }
      hasSentViewRef.current = false;
    }
  };

  useEffect(() => {
    if (!videoRef.current) return;
    if (isActive) {
      lastUpdateRef.current = Date.now();
      // ✅ Reset: chaque nouvelle session de visionnage compte comme une vue
      hasSentViewRef.current = false;
      videoRef.current.playAsync();
    } else {
      videoRef.current.pauseAsync();
      videoRef.current.setPositionAsync(0);
      setVideoReady(false);

      if (watchTimeRef.current > 0) {
        reportEngagement(watchTimeRef.current);
        watchTimeRef.current = 0;
      }
      hasSentViewRef.current = false;
    }
  }, [isActive]);

  // ── Actions ───────────────────────────────────────────────────────────────────
  const handleLike = async () => {
    const newLiked = !liked;
    setLiked(newLiked);
    setLikeCount(c => newLiked ? c + 1 : c - 1);
    try {
      await apiService.likeTweet(tweet.id);
    } catch {
      setLiked(!newLiked);
      setLikeCount(c => newLiked ? c - 1 : c + 1);
    }
  };

  const handleRetweet = async () => {
    const newRetweeted = !retweeted;
    setRetweeted(newRetweeted);
    setRetweetCount(c => newRetweeted ? c + 1 : c - 1);
    try {
      await apiService.retweet(tweet.id);
    } catch {
      setRetweeted(!newRetweeted);
      setRetweetCount(c => newRetweeted ? c - 1 : c + 1);
    }
  };

  return (
    // ✅ On utilise cardHeight au lieu du calcul hardcodé
    <View style={[styles.card, { height: cardHeight }]}>
      <LinearGradient colors={['#161616', colors.bg]} style={StyleSheet.absoluteFillObject} />

      {videoUrl ? (
        <View style={StyleSheet.absoluteFillObject}>
          {thumbUrl && !videoReady && (
            <Image source={{ uri: thumbUrl }} style={[StyleSheet.absoluteFillObject, { resizeMode: 'cover' }]} />
          )}
          <Video
            ref={videoRef}
            source={{ uri: videoUrl }}
            style={StyleSheet.absoluteFillObject}
            resizeMode={ResizeMode.COVER}
            isLooping
            isMuted={false}
            shouldPlay={isActive}
            onReadyForDisplay={() => setVideoReady(true)}
            onPlaybackStatusUpdate={onPlaybackStatusUpdate}
          />
          {overlays.map((item: any, idx: number) => {
            const font = getFont(item.fontId);
            return (
              <View key={item.id || idx} style={{ position: 'absolute', top: item.y, left: item.x }} pointerEvents="none">
                <View style={getBgStyle(item.bgMode, item.color)}>
                  <OutlinedText
                    text={item.text}
                    color={item.color}
                    outline={item.outline}
                    outlineColor={item.outlineColor}
                    style={[{ fontSize: item.size, textAlign: item.align }, font.style]}
                  />
                </View>
              </View>
            );
          })}
        </View>
      ) : (
        <View style={styles.emojiContainer}>
          <Text style={[styles.emojiText, { opacity: isActive ? 0.35 : 0.12 }]}>🎥</Text>
        </View>
      )}

      <LinearGradient colors={['transparent', 'rgba(0,0,0,0.85)']} style={styles.bottomGradient} />

      {/* Actions rail (droite) */}
      <View style={styles.actionsContainer}>
        <View style={styles.avatarContainer}>
          <Avatar size={50} username={tweet.author?.username || 'user'} uri={tweet.author?.avatar} />
          <TouchableOpacity style={styles.followBtn} onPress={() => setFollowed(f => !f)}>
            <Ionicons
              name={followed ? 'checkmark-circle' : 'add-circle'}
              size={22}
              color={followed ? colors.success : colors.accent}
            />
          </TouchableOpacity>
        </View>

        <TouchableOpacity style={styles.actionItem} onPress={handleLike}>
          <Ionicons name="heart" size={38} color={liked ? colors.accent : 'white'} />
          <Text style={styles.actionText}>{formatCount(likeCount)}</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.actionItem} onPress={() => setShowComments(true)}>
          <Ionicons name="chatbubble-ellipses" size={34} color="white" />
          <Text style={styles.actionText}>{formatCount(replyCount)}</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.actionItem} onPress={() => setSaved(s => !s)}>
          <Ionicons name="bookmark" size={32} color={saved ? colors.gold : 'white'} />
          <Text style={styles.actionText}>{formatCount(0)}</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.actionItem} onPress={handleRetweet}>
          <Ionicons name="repeat" size={34} color={retweeted ? colors.cyan : 'white'} />
          <Text style={styles.actionText}>{formatCount(retweetCount)}</Text>
        </TouchableOpacity>

        <View style={styles.discContainer}>
          <LinearGradient colors={['#2a2a2a', '#0f0f0f']} style={styles.disc}>
            <View style={styles.discCenter} />
          </LinearGradient>
        </View>
      </View>

      {/* Info bas de page */}
      <View style={[styles.infoContainer, { bottom: 30 }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
          <Text style={styles.usernameText}>@{tweet.author?.username}</Text>
          {tweet.author?.verified && (
            <View style={{ marginLeft: 6 }}>
              <VerifiedBadge
                verificationStyle={tweet.author?.verification_style as any}
                size={16}
                premium={tweet.author?.premium}
              />
            </View>
          )}
        </View>
        <Text style={styles.descText} numberOfLines={3}>{tweet.content}</Text>
        <View style={styles.audioContainer}>
          <Ionicons name="musical-notes" size={14} color="white" />
          <Text style={styles.audioText} numberOfLines={1}>Son original – {tweet.author?.username}</Text>
        </View>
      </View>

      <CommentSheet
        visible={showComments}
        totalCount={replyCount}
        tweetId={tweet.id}
        onClose={() => setShowComments(false)}
        tweetAuthorUsername={tweet.author?.username}
      />
    </View>
  );
});

// ─── Screen ────────────────────────────────────────────────────────────────────

const PAGE_SIZE = 2;
const PREFETCH_THRESHOLD = 1;

const TwitNinfVideo: React.FC = () => {
  const [videos, setVideos] = useState<Tweet[]>([]);
  const [activeIdx, setActiveIdx] = useState(0);
  const [activeVideoId, setActiveVideoId] = useState<string | null>(null);
  const [initialLoading, setInitialLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [isFocused, setIsFocused] = useState(true);
  const [isScrollEnabled, setIsScrollEnabled] = useState(true);

  const isFetchingRef = useRef(false);
  const offsetRef = useRef(0);
  const hasMoreRef = useRef(true);
  const videosLengthRef = useRef(0);

  const insets = useSafeAreaInsets();
  // `BottomTabBarHeightContext` vaut `undefined` hors navigateur d'onglets
  // (voir CasinoScreen) — et TwitNinfVideo est AUSSI poussé hors des onglets,
  // en écran plein depuis Réglages > Vidéos (MainNavigator.tsx, route
  // "Video" du MainStack, distincte de l'onglet du même nom). Dans ce cas
  // il n'y a pas de tab bar du tout : le seul espace à réserver en bas est
  // la zone de sécurité de l'appareil (encoche/gestures), via insets.bottom.
  // Dans l'onglet, `tabBarHeight` (83 iOS / 85 Android, safe area incluse)
  // est la valeur RÉELLEMENT rendue par la tab bar, contrairement à l'ancien
  // `TAB_BAR_HEIGHT = 49` codé en dur qui ne correspondait à aucune des deux.
  const tabBarHeight = useContext(BottomTabBarHeightContext);
  const bottomReserve = tabBarHeight ?? insets.bottom;

  // ✅ Hauteur responsive : écran - (tab bar ou safe area, selon le contexte)
  // Fonctionne sur tous les devices iOS & Android (encoche, Dynamic Island, barre Android...)
  const cardHeight = height - bottomReserve;

  useEffect(() => {
    videosLengthRef.current = videos.length;
  }, [videos.length]);

  useEffect(() => {
    Audio.setAudioModeAsync({
      playsInSilentModeIOS: true,
      staysActiveInBackground: false,
      interruptionModeIOS: InterruptionModeIOS.DoNotMix,
      shouldDuckAndroid: false,
      interruptionModeAndroid: InterruptionModeAndroid.DoNotMix,
      playThroughEarpieceAndroid: false,
    });
  }, []);

  const fetchVideos = useCallback(async (isRefresh = false) => {
    if (isFetchingRef.current) return;
    if (!isRefresh && !hasMoreRef.current) return;

    isFetchingRef.current = true;

    try {
      if (isRefresh) {
        setRefreshing(true);
        offsetRef.current = 0;
        hasMoreRef.current = true;
      }

      const currentOffset = offsetRef.current;
      console.log(`📡 [VideoFeed] fetch offset=${currentOffset} isRefresh=${isRefresh}`);

      const response = await apiService.get('/api/tweets', {
        type: 'video',
        sort: 'recommended',
        limit: PAGE_SIZE,
        offset: currentOffset,
      });

      if (response.success && response.data?.tweets) {
        const newTweets: Tweet[] = response.data.tweets;
        const more = response.data.pagination?.hasMore ?? newTweets.length === PAGE_SIZE;

        console.log(`✅ [VideoFeed] reçu ${newTweets.length} vidéos. hasMore=${more}`);

        if (newTweets.length > 0) {
          console.log('[VideoFeed] tweet[0] stats:', JSON.stringify({
            stats: (newTweets[0] as any).stats,
            likes: (newTweets[0] as any).likes,
            likes_count: (newTweets[0] as any).likes_count,
            retweets: (newTweets[0] as any).retweets,
            retweets_count: (newTweets[0] as any).retweets_count,
          }, null, 2));
        }

        offsetRef.current = currentOffset + newTweets.length;
        hasMoreRef.current = more;

        if (isRefresh) {
          setVideos(newTweets);
          setActiveIdx(0);
          if (newTweets.length > 0) setActiveVideoId(newTweets[0].id);
        } else {
          setVideos(prev => [...prev, ...newTweets]);
        }
      }
    } catch (err) {
      console.error('❌ [VideoFeed] Error:', err);
    } finally {
      isFetchingRef.current = false;
      setInitialLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      setIsFocused(true);
      fetchVideos(true);
      return () => setIsFocused(false);
    }, [fetchVideos])
  );

  const onViewableItemsChanged = useRef(({ viewableItems }: any) => {
    if (!viewableItems?.length) return;

    const idx: number = viewableItems[0].index ?? 0;
    setActiveIdx(idx);
    setActiveVideoId(viewableItems[0].item.id);

    const remaining = videosLengthRef.current - 1 - idx;

    if (remaining <= PREFETCH_THRESHOLD && hasMoreRef.current && !isFetchingRef.current) {
      console.log(`🔄 [VideoFeed] prefetch déclenché idx=${idx} remaining=${remaining} offset=${offsetRef.current}`);
      fetchVideos(false);
    }
  });

  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 50 });

  // Trois références stables : sans elles, le `React.memo` de `VideoCard`
  // ci-dessus ne sert à rien — `renderItem` change d'identité à chaque rendu
  // de l'écran (donc à chaque glissé, `activeVideoId` changeant), et le
  // `CellRenderer` de la `FlatList` re-rend TOUTES les cartes montées, avec
  // leur lecteur vidéo, qu'elles aient changé ou non.
  const handleSheetToggle = useCallback((isVisible: boolean) => setIsScrollEnabled(!isVisible), []);
  const videoKeyExtractor = useCallback((item: Tweet) => item.id, []);
  const renderVideo = useCallback(
    ({ item }: { item: Tweet }) => (
      <VideoCard
        tweet={item}
        isActive={activeVideoId === item.id && isFocused}
        onSheetToggle={handleSheetToggle}
        cardHeight={cardHeight}
      />
    ),
    [activeVideoId, isFocused, handleSheetToggle, cardHeight],
  );

  if (initialLoading) {
    return (
      <View style={styles.container}>
        <ScreenSkeleton variant="grid" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle={statusBarStyle()} />

      {videos.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="videocam-outline" size={60} color={colors.textMuted} />
          <Text style={styles.emptyText}>Aucune vidéo trouvée</Text>
          <Text style={styles.emptySubtext}>Soyez le premier à publier une vidéo !</Text>
        </View>
      ) : (
        <FlatList
          data={videos}
          keyExtractor={videoKeyExtractor}
          pagingEnabled
          showsVerticalScrollIndicator={false}
          // ✅ snapToInterval utilise cardHeight (responsive) et non height (brut)
          snapToInterval={cardHeight}
          snapToAlignment="start"
          decelerationRate="fast"
          scrollEnabled={isScrollEnabled}
          onViewableItemsChanged={onViewableItemsChanged.current}
          viewabilityConfig={viewabilityConfig.current}
          renderItem={renderVideo}
          disableIntervalMomentum
          /**
           * Réglage de virtualisation. Sans lui, la liste tournait sur les
           * défauts de React Native — `initialNumToRender: 10`,
           * `windowSize: 21` — calibrés pour des lignes de fil, pas pour des
           * pages plein écran : l'ouverture de l'onglet demandait au système
           * d'instancier une dizaine de lecteurs `<Video>` pour en afficher
           * UN. Sur un appareil modeste, le nombre de décodeurs matériels est
           * limité à quelques flux : au-delà, la vidéo saccade ou reste noire.
           *
           * On ne recopie PAS le réglage maison des quatre listes de contenu
           * (`initialNumToRender={6}` / `windowSize={7}`) : il vise des lignes,
           * pas des écrans. Ici, le strict nécessaire est la carte active et
           * une voisine de chaque côté.
           *
           * `windowSize={3}` réduit le préchargement de la vidéo suivante ;
           * si un glissé très rapide tombait sur une carte pas encore prête,
           * `5` (deux de chaque côté) reste très loin des 21 d'origine. Ne pas
           * descendre en dessous de 3.
           */
          initialNumToRender={2}
          maxToRenderPerBatch={2}
          updateCellsBatchingPeriod={50}
          windowSize={3}
          removeClippedSubviews={Platform.OS === 'android'}
          // Gratuit et exact : toutes les cartes font `cardHeight`, la valeur
          // est déjà celle du `snapToInterval`. Évite de mesurer les cellules
          // à la volée et fiabilise le calage de la pagination.
          getItemLayout={(_, i) => ({ length: cardHeight, offset: cardHeight * i, index: i })}
          onRefresh={() => fetchVideos(true)}
          refreshing={refreshing}
          // ✅ padding dynamique = ce qui est "caché" sous la tab bar (ou,
          // hors onglets, la zone de sécurité basse de l'appareil)
          contentContainerStyle={{ paddingBottom: bottomReserve }}
        />
      )}

      {/* `insets.top` seul suffit sur les deux plateformes : pas de +20
          Android à deviner, la StatusBar de l'app n'est pas translucide sur
          Android (voir App.tsx), le système réserve déjà cet espace. */}
      <View style={[styles.header, { paddingTop: insets.top }]}>
        <View style={styles.headerTab}>
          <Text style={styles.headerTitle}>Vidéos</Text>
          <View style={styles.headerUnderline} />
        </View>
      </View>
    </View>
  );
};

// ─── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: 'transparent' },
  card: { width },
  emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 10 },
  emptyText: { color: 'white', fontSize: 20, fontWeight: 'bold' },
  emptySubtext: { color: '#888', fontSize: 14 },
  emojiContainer: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emojiText: { fontSize: 140, color: 'white' },
  bottomGradient: { position: 'absolute', left: 0, right: 0, bottom: 0, height: '45%' },
  header: { position: 'absolute', top: 0, left: 0, right: 0, alignItems: 'center', zIndex: 10 },
  headerTab: { alignItems: 'center' },
  headerTitle: { color: 'white', fontSize: 17, fontWeight: '800', fontFamily: fonts.bold, textShadowColor: 'rgba(0,0,0,0.5)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 3, letterSpacing: 0.5 },
  headerUnderline: { width: 25, height: 3, backgroundColor: colors.accent, borderRadius: 2, marginTop: 5 },
  actionsContainer: { position: 'absolute', right: 12, bottom: 30, alignItems: 'center', gap: 22 },
  avatarContainer: { marginBottom: 8, alignItems: 'center' },
  followBtn: { position: 'absolute', bottom: -10, backgroundColor: 'transparent', borderRadius: 11 },
  actionItem: { alignItems: 'center', gap: 4 },
  actionText: { color: 'white', fontSize: 12.5, fontWeight: '700', fontFamily: fonts.bold, textShadowColor: 'rgba(0,0,0,0.8)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 3 },
  discContainer: { marginTop: 8 },
  disc: { width: 46, height: 46, borderRadius: 23, borderWidth: 8, borderColor: '#222', alignItems: 'center', justifyContent: 'center' },
  discCenter: { width: 14, height: 14, borderRadius: 7, backgroundColor: colors.textPrimary },
  infoContainer: { position: 'absolute', left: 14, right: 80, gap: 8 },
  usernameText: { color: 'white', fontSize: 16, fontWeight: '800', fontFamily: fonts.bold, textShadowColor: 'rgba(0,0,0,0.5)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 3 },
  descText: { color: colors.textPrimary, fontSize: 14, lineHeight: 20, textShadowColor: 'rgba(0,0,0,0.5)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 3 },
  audioContainer: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 },
  audioText: { color: colors.textPrimary, fontSize: 13, flex: 1 },
});

export default TwitNinfVideo;