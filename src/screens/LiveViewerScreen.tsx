import React, { memo, useState, useRef, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  StatusBar,
  ActivityIndicator,
  TouchableOpacity,
  Dimensions,
  FlatList,
  TextInput,
  Keyboard,
  Platform,
  Animated,
  Easing,
  TouchableWithoutFeedback,
} from 'react-native';
import { Video, ResizeMode, Audio } from 'expo-av';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as ScreenOrientation from 'expo-screen-orientation';
import { socket, connectLiveSocket, disconnectLiveSocket } from '../services/liveService';
import { useAuth } from '../contexts/AuthContext';
import Avatar from '../components/Avatar';
import VerifiedBadge from '../components/VerifiedBadge';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, statusBarStyle } from '../theme';
import { LIST_TUNING_INVERTED } from '../utils/listTuning';

const { width: SW, height: SH } = Dimensions.get('window');

interface RouteParams {
  liveId: string;
  playbackUrl: string;
  hostName?: string;
  hostAvatar?: string;
  viewerCount?: number;
  verified?: boolean;
  verificationStyle?: any;
}

interface ChatMessage {
  id: string;
  text: string;
  user: string;
  avatar?: string | null;
  verified?: boolean;
  premium?: boolean;
  verification_style?: any;
  timestamp: string;
}

// ─── Floating Heart ─────────────────────────────────────────────────────────
const HEARTS = ['❤️', '🧡', '💛', '💜', '💙', '🩷'];

function FloatingHeart({ onDone }: { onDone: () => void }) {
  const y = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(1)).current;
  const scale = useRef(new Animated.Value(0)).current;
  const x = useRef(new Animated.Value((Math.random() - 0.5) * 40)).current;
  const emoji = HEARTS[Math.floor(Math.random() * HEARTS.length)];

  useEffect(() => {
    Animated.parallel([
      Animated.spring(scale, { toValue: 1, useNativeDriver: true, damping: 8 }),
      Animated.timing(y, {
        toValue: -220,
        duration: 1800,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(x, {
        toValue: (Math.random() - 0.5) * 60,
        duration: 1800,
        useNativeDriver: true,
      }),
      Animated.sequence([
        Animated.delay(1100),
        Animated.timing(opacity, { toValue: 0, duration: 700, useNativeDriver: true }),
      ]),
    ]).start(onDone);
  }, []);

  return (
    <Animated.Text
      style={{
        position: 'absolute',
        bottom: 0,
        right: 8,
        fontSize: 26,
        transform: [{ translateY: y }, { translateX: x }, { scale }],
        opacity,
      }}
    >
      {emoji}
    </Animated.Text>
  );
}

// ─── Chat Message Row (Instagram Live style) ─────────────────────────────────
/**
 * Mémoïsé : sur un live actif, un message arrive plusieurs fois par seconde et
 * re-rendait TOUTES les lignes montées du chat — en concurrence directe avec
 * la lecture du flux vidéo. `item` est la seule chose que la ligne lit, et
 * `setMessages` conserve la référence des messages déjà là (`[msg, ...prev]`),
 * donc la comparaison par défaut suffit.
 */
const ChatRow = memo(function ChatRow({ item }: { item: ChatMessage }) {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(12)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 200, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 200, useNativeDriver: true }),
    ]).start();
  }, []);

  // Instagram écrit tous les pseudos du chat en blanc légèrement voilé. Une
  // couleur tirée du pseudo faisait « chat de jeu vidéo » et rendait certains
  // noms illisibles sur une scène claire.
  const nameColor = colors.textPrimary;

  return (
    <Animated.View
      style={[
        styles.chatRow,
        { opacity: fadeAnim, transform: [{ translateY: slideAnim }] },
      ]}
    >
      <Avatar size={26} uri={item.avatar} username={item.user} style={styles.chatAvatar} />
      <View style={styles.chatBubble}>
        <View style={styles.chatHeader}>
          <Text style={[styles.chatUsername, { color: nameColor }]}>{item.user}</Text>
          {(item.verified || item.verification_style !== 'default') && (
            <VerifiedBadge verificationStyle={item.verification_style || 'default'} size={12} />
          )}
        </View>
        <Text style={styles.chatText}>{item.text}</Text>
      </View>
    </Animated.View>
  );
});

// ─── Viewer Count Badge ───────────────────────────────────────────────────────
function ViewerBadge({ count }: { count: number }) {
  const fmt = (n: number) =>
    n >= 1_000_000 ? (n / 1_000_000).toFixed(1) + 'M'
      : n >= 1000 ? (n / 1000).toFixed(1) + 'K'
        : String(n);

  return (
    <View style={styles.viewerBadge}>
      <Ionicons name="eye" size={11} color={colors.textPrimary} />
      <Text style={styles.viewerBadgeText}>{fmt(count)}</Text>
    </View>
  );
}

// ─── LIVE Pill ────────────────────────────────────────────────────────────────
function LivePill({ pulse }: { pulse: Animated.Value }) {
  return (
    <View style={styles.livePill}>
      <Animated.View style={[styles.liveDot, { transform: [{ scale: pulse }] }]} />
      <Text style={styles.liveLabel}>LIVE</Text>
    </View>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function LiveViewerScreen() {
  const navigation = useNavigation();
  const route = useRoute();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();

  const socketRef = useRef<any>(null);
  const flatListRef = useRef<FlatList>(null);

  const [loading, setLoading] = useState(true);
  const [videoReady, setVideoReady] = useState(false); // Délai initial avant lecture
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [isLandscape, setIsLandscape] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [inputFocused, setInputFocused] = useState(false);
  const [hearts, setHearts] = useState<number[]>([]);
  const [viewerCount, setViewerCount] = useState(
    (route.params as RouteParams)?.viewerCount || 0
  );

  const { liveId, playbackUrl, hostName, hostAvatar, verified, verificationStyle } =
    (route.params as RouteParams) || {};

  // Délai initial : attend 12s que les segments HLS soient prêts (hls_time=6s)
  useEffect(() => {
    const t = setTimeout(() => setVideoReady(true), 12000 / 12);
    return () => clearTimeout(t);
  }, []);

  // Pulse anim
  const pulseAnim = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.6, duration: 600, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
      ])
    ).start();
  }, []);

  // Audio : nécessaire pour expo-av (mode silencieux iOS)
  useEffect(() => {
    Audio.setAudioModeAsync({
      allowsRecordingIOS: false,
      playsInSilentModeIOS: true,
      staysActiveInBackground: false,
      shouldDuckAndroid: true,
      playThroughEarpieceAndroid: false,
    }).catch(() => { });
  }, []);

  // Socket — partagé et authentifié (voir services/liveService).
  // L'écran ouvrait auparavant sa propre connexion anonyme : le serveur
  // exige désormais le jeton d'accès pour attribuer un message à son auteur.
  useEffect(() => {
    if (!playbackUrl || !liveId) return;

    socketRef.current = socket;

    const handleConnect = () => socket.emit('joinLive', liveId);
    const handleChatMessage = (msg: ChatMessage) => {
      setMessages(prev => {
        if (prev.find(m => m.id === msg.id)) return prev;
        return [msg, ...prev.slice(0, 79)];
      });
    };
    const handleViewerCount = (count: number) => setViewerCount(count);
    const handleHeart = () => setHearts(prev => [...prev, Date.now() + Math.random()]);

    socket.on('connect', handleConnect);
    socket.on('chatMessage', handleChatMessage);
    socket.on('viewerCount', handleViewerCount);
    socket.on('heart', handleHeart);

    connectLiveSocket();
    // Le socket peut déjà être connecté (onglet Live ouvert juste avant) :
    // `connect` ne serait alors jamais émis et on n'entrerait dans aucune salle.
    if (socket.connected) handleConnect();

    return () => {
      socket.off('connect', handleConnect);
      socket.off('chatMessage', handleChatMessage);
      socket.off('viewerCount', handleViewerCount);
      socket.off('heart', handleHeart);
      disconnectLiveSocket();
      ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);
    };
  }, [liveId, playbackUrl]);

  // Keyboard
  useEffect(() => {
    const show = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hide = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const s1 = Keyboard.addListener(show, e => setKeyboardHeight(e.endCoordinates.height));
    const s2 = Keyboard.addListener(hide, () => setKeyboardHeight(0));
    return () => { s1.remove(); s2.remove(); };
  }, []);

  const sendMessage = useCallback(() => {
    if (!inputText.trim() || !socketRef.current) return;
    const myMsg: ChatMessage = {
      id: Date.now().toString(),
      text: inputText.trim(),
      user: user?.username || 'Anonyme',
      avatar: user?.avatar,
      verified: user?.verified,
      premium: user?.premium,
      verification_style: user?.verification_style || 'default',
      timestamp: new Date().toISOString(),
    };
    setMessages(prev => [myMsg, ...prev.slice(0, 79)]);
    // Seuls l'identifiant du live et le texte partent : le serveur tire
    // l'identité de l'auteur du jeton du socket. Envoyer pseudo, badge et
    // avatar depuis le client permettait d'écrire sous n'importe quel nom.
    socketRef.current.emit('chatMessage', {
      liveId,
      message: inputText.trim(),
    });
    setInputText('');
    Keyboard.dismiss();
  }, [inputText, user, liveId]);

  const spawnHeart = useCallback(() => {
    if (!socketRef.current || !liveId) return;
    socketRef.current.emit('sendHeart', liveId);
  }, [liveId]);

  const removeHeart = useCallback((id: number) => {
    setHearts(prev => prev.filter(h => h !== id));
  }, []);

  /**
   * Stables, et pas des flèches anonymes : une identité neuve à chaque message
   * reçu suffirait à faire re-rendre toutes les lignes montées par le
   * `CellRenderer` de la FlatList, `ChatRow` mémoïsé ou non. Les deux
   * corrections vont ensemble.
   */
  const renderChatRow = useCallback(({ item }: { item: ChatMessage }) => <ChatRow item={item} />, []);
  const chatKeyExtractor = useCallback((item: ChatMessage) => item.id, []);

  const toggleOrientation = async () => {
    if (isLandscape) {
      await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);
      setIsLandscape(false);
    } else {
      await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE_RIGHT);
      setIsLandscape(true);
    }
  };

  const topPad = isLandscape ? 8 : insets.top + 8;
  const bottomPad = keyboardHeight > 0
    ? keyboardHeight + 85
    : Math.max(insets.bottom, 32);

  return (
    <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
      <View style={styles.root}>
        <StatusBar hidden={isLandscape} barStyle={statusBarStyle()} translucent backgroundColor="transparent" />

        {/* VIDEO */}
        <View style={StyleSheet.absoluteFill}>
          {videoReady && (
            <Video
              source={{ uri: playbackUrl }}
              style={StyleSheet.absoluteFill}
              resizeMode={isLandscape ? ResizeMode.CONTAIN : ResizeMode.COVER}
              shouldPlay
              isMuted={false}
              volume={1.0}
              onLoadStart={() => setLoading(true)}
              onLoad={() => setLoading(false)}
            />
          )}
        </View>

        {/* GRADIENTS */}
        <LinearGradient
          colors={['rgba(0,0,0,0.7)', 'transparent']}
          style={[styles.gradTop, { height: topPad + 100 }]}
          pointerEvents="none"
        />
        <LinearGradient
          colors={['transparent', 'rgba(0,0,0,0.75)']}
          style={styles.gradBottom}
          pointerEvents="none"
        />

        {/* UI OVERLAY */}
        <View style={[styles.ui, { paddingTop: topPad, paddingBottom: bottomPad }]}>
          {/* HEADER BAR */}
          <View style={styles.topBar}>
            <View style={styles.topLeft}>
              <TouchableOpacity onPress={() => navigation.goBack()} style={styles.circleBtn} hitSlop={8}>
                <Ionicons name="chevron-back" size={20} color="#fff" />
              </TouchableOpacity>

              <View style={styles.hostInfo}>
                <View style={styles.avatarWrap}>
                  <LinearGradient
                    colors={['#f09433', '#e6683c', '#dc2743', '#cc2366', '#bc1888']}
                    start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                    style={styles.avatarRing}
                  />
                  <Avatar size={36} uri={hostAvatar} username={hostName || 'Live'} />
                </View>
                <View style={styles.hostMeta}>
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <Text style={styles.hostName} numberOfLines={1}>{hostName || 'Live'}</Text>
                    {verified && (
                      <View style={{ marginLeft: 4 }}>
                        <VerifiedBadge
                          verificationStyle={verificationStyle || 'default'}
                          size={14}
                          animated={true}
                        />
                      </View>
                    )}
                  </View>
                  <Text style={styles.hostSub}>En direct</Text>
                </View>
                <View style={styles.badgeGroup}>
                  <LivePill pulse={pulseAnim} />
                  {viewerCount > 0 && <ViewerBadge count={viewerCount} />}
                </View>
              </View>
            </View>

            <View style={styles.topRight}>
              <TouchableOpacity onPress={toggleOrientation} style={styles.circleBtn} hitSlop={8}>
                <Ionicons name={isLandscape ? 'phone-portrait' : 'phone-landscape'} size={18} color="#fff" />
              </TouchableOpacity>
            </View>
          </View>

          <View style={{ flex: 1 }} />

          {/* CHAT AREA */}
          <View style={[styles.bottomArea, isLandscape && styles.bottomAreaLandscape]}>
            <View style={[styles.chatWrap, isLandscape && styles.chatWrapLandscape]}>
              <FlatList
                ref={flatListRef}
                data={messages}
                keyExtractor={chatKeyExtractor}
                renderItem={renderChatRow}
                inverted
                {...LIST_TUNING_INVERTED}
                showsVerticalScrollIndicator={false}
                contentContainerStyle={styles.chatList}
                ListEmptyComponent={
                  <View style={{ transform: [{ scaleY: -1 }] }}>
                    <Text style={styles.emptyHint}>💬 Soyez le premier à commenter</Text>
                  </View>
                }
              />
            </View>
            <View style={styles.heartsCol}>
              {hearts.map(id => (
                <FloatingHeart key={id} onDone={() => removeHeart(id)} />
              ))}
            </View>
          </View>

          {/* INPUT */}
          <View style={styles.inputRow}>
            <TouchableOpacity style={styles.heartBtn} onPress={spawnHeart} activeOpacity={0.7}>
              <Text style={styles.heartBtnEmoji}>🤍</Text>
            </TouchableOpacity>

            <View style={[styles.inputPill, inputFocused && styles.inputPillFocused]}>
              <TextInput
                style={styles.inputField}
                placeholder="Commenter..."
                placeholderTextColor={colors.textSecondary}
                value={inputText}
                onChangeText={setInputText}
                onSubmitEditing={sendMessage}
                onFocus={() => setInputFocused(true)}
                onBlur={() => setInputFocused(false)}
                blurOnSubmit={false}
                returnKeyType="send"
              />
              {inputText.trim().length > 0 && (
                <TouchableOpacity onPress={sendMessage} style={styles.sendPill}>
                  <Text style={styles.sendLabel}>Ok</Text>
                </TouchableOpacity>
              )}
            </View>

            {!inputFocused && (
              <TouchableOpacity style={styles.circleBtn} hitSlop={8}>
                <Ionicons name="paper-plane-outline" size={18} color="#fff" />
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* LOADING */}
        {loading && (
          <View style={styles.loadingLayer}>
            <ActivityIndicator color="#fff" size="large" />
            {!videoReady && (
              <Text style={styles.retryText}>Démarrage du live...</Text>
            )}
          </View>
        )}
      </View>
    </TouchableWithoutFeedback>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: 'transparent' },
  gradTop: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 1 },
  gradBottom: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 320, zIndex: 1 },
  ui: { ...StyleSheet.absoluteFillObject, zIndex: 2, paddingHorizontal: 12, justifyContent: 'space-between' },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  topLeft: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 },
  topRight: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  circleBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', alignItems: 'center' },
  hostInfo: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 24, paddingRight: 10, gap: 8 },
  avatarWrap: { position: 'relative', width: 42, height: 42, justifyContent: 'center', alignItems: 'center' },
  avatarRing: { position: 'absolute', width: '100%', height: '100%', borderRadius: 21, padding: 2 },
  hostMeta: { gap: 1 },
  hostName: { color: '#fff', fontSize: 13, fontWeight: '700' },
  hostSub: { color: colors.textSecondary, fontSize: 10 },
  badgeGroup: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  livePill: { backgroundColor: '#FF0050', borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2, flexDirection: 'row', alignItems: 'center', gap: 3 },
  liveDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: '#fff' },
  liveLabel: { color: '#fff', fontSize: 9, fontWeight: '900' },
  viewerBadge: { backgroundColor: colors.overlayMedium, borderRadius: 12, paddingHorizontal: 7, paddingVertical: 3, flexDirection: 'row', alignItems: 'center', gap: 4 },
  viewerBadgeText: { color: '#fff', fontSize: 10, fontWeight: '800' },
  bottomArea: { flexDirection: 'row', alignItems: 'flex-end', marginBottom: 12 },
  bottomAreaLandscape: { maxHeight: 100 },
  chatWrap: { flex: 1, maxHeight: SH * 0.38, marginRight: 42 },
  chatWrapLandscape: { maxHeight: 80 },
  chatList: { paddingTop: 4 },
  chatRow: { flexDirection: 'row', marginBottom: 10, gap: 8, alignSelf: 'flex-start' },
  chatAvatar: { borderRadius: 14, marginTop: 2 },
  // Pas de bulle : sur Instagram le texte est posé à même l'image, et c'est
  // l'ombre portée qui le tient lisible sur les scènes claires.
  chatBubble: { flexShrink: 1, paddingVertical: 1 },
  chatHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 1 },
  chatUsername: {
    fontSize: 13, fontWeight: '600',
    textShadowColor: 'rgba(0,0,0,0.75)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 3,
  },
  chatText: {
    color: '#fff', fontSize: 14, lineHeight: 19,
    textShadowColor: 'rgba(0,0,0,0.75)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 3,
  },
  emptyHint: { color: colors.textMuted, fontSize: 12, fontStyle: 'italic' },
  heartsCol: { position: 'absolute', right: 0, bottom: 0, width: 40, height: 260 },
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  heartBtn: { width: 46, height: 46, borderRadius: 23, backgroundColor: colors.overlayStrong, justifyContent: 'center', alignItems: 'center' },
  heartBtnEmoji: { fontSize: 24 },
  inputPill: { flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: colors.overlayStrong, borderRadius: 23, paddingHorizontal: 16, height: 48, gap: 8 },
  inputPillFocused: { backgroundColor: colors.textMuted },
  inputField: { flex: 1, color: '#fff', fontSize: 14, height: 48 },
  sendPill: { backgroundColor: '#FF0050', borderRadius: 14, paddingHorizontal: 12, paddingVertical: 6 },
  sendLabel: { color: '#fff', fontSize: 12, fontWeight: '700' },
  loadingLayer: { ...StyleSheet.absoluteFillObject, backgroundColor: 'transparent', justifyContent: 'center', alignItems: 'center' },
  retryText: { color: colors.textSecondary, fontSize: 13, marginTop: 12 },
});