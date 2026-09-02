/**
 * Rétrospective annuelle : la vidéo rendue, habillée en stories.
 *
 * Ce n'est pas une reconstruction de la vidéo à l'écran — c'est le fichier
 * lui-même (rendu à 120 i/s puis fusionné à 30, d'où le flou de mouvement) qui
 * est diffusé plein écran. L'app n'ajoute que la grammaire des stories :
 *
 *   - une barre segmentée en haut, **un trait par tranche de 20 s** ;
 *   - appui à droite pour sauter à la tranche suivante, à gauche pour revenir ;
 *   - appui maintenu pour figer ;
 *   - glissement vers le bas pour sortir.
 *
 * La bande-son est DANS la vidéo : surtout ne pas rejouer la musique à côté,
 * on l'entendrait deux fois.
 */
import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  PanResponder,
  Pressable,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ResizeMode, Video, type AVPlaybackStatus } from 'expo-av';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../theme/colors';
import { fonts } from '../theme/fonts';
import { feedback } from '../utils/feedback';
import { API_CONFIG } from '../config/api';
import {
  fetchRetrospective,
  Retrospective,
  retrospectiveYear,
} from '../services/retrospectiveService';

/** Une tranche de story. C'est la seule constante qui fixe le découpage. */
const SEGMENT_MS = 20000;

const RetrospectiveScreen: React.FC<any> = ({ navigation, route }) => {
  const insets = useSafeAreaInsets();
  const year = route?.params?.year ?? retrospectiveYear();

  const [data, setData] = useState<Retrospective | null>(null);
  const [failed, setFailed] = useState(false);
  const [duration, setDuration] = useState(0);
  const [position, setPosition] = useState(0);
  const [ready, setReady] = useState(false);

  const video = useRef<Video>(null);
  const paused = useRef(false);

  React.useEffect(() => {
    let alive = true;
    fetchRetrospective(year).then((result) => {
      if (!alive) return;
      if (result?.video?.url) setData(result);
      else setFailed(true);
    });
    return () => {
      alive = false;
    };
  }, [year]);

  const uri = useMemo(() => {
    if (!data?.video?.url) return null;
    const url = data.video.url;
    return url.startsWith('http') ? url : `${API_CONFIG.BASE_URL}${url}`;
  }, [data]);

  const segments = Math.max(1, Math.ceil(duration / SEGMENT_MS));
  const index = Math.min(segments - 1, Math.floor(position / SEGMENT_MS));

  const close = useCallback(() => navigation.goBack(), [navigation]);

  const onStatus = useCallback(
    (status: AVPlaybackStatus) => {
      if (!status.isLoaded) return;
      if (status.durationMillis && status.durationMillis !== duration) {
        setDuration(status.durationMillis);
      }
      setPosition(status.positionMillis || 0);
      if (!ready && status.isPlaying) setReady(true);
      if (status.didJustFinish) close();
    },
    [close, duration, ready]
  );

  /** Saute au début de la tranche demandée ; au-delà de la dernière, on sort. */
  const goToSegment = useCallback(
    (next: number) => {
      if (next < 0) {
        video.current?.setPositionAsync(0).catch(() => {});
        return;
      }
      if (next >= segments) {
        close();
        return;
      }
      video.current?.setPositionAsync(next * SEGMENT_MS).catch(() => {});
    },
    [close, segments]
  );

  const hold = useCallback(() => {
    paused.current = true;
    video.current?.pauseAsync().catch(() => {});
  }, []);

  const release = useCallback(() => {
    if (!paused.current) return;
    paused.current = false;
    video.current?.playAsync().catch(() => {});
  }, []);

  const pan = useRef(
    PanResponder.create({
      // Seul un vrai geste vertical est intercepté : sinon les zones d'appui
      // gauche/droite ne répondraient plus.
      onMoveShouldSetPanResponder: (_, g) =>
        g.dy > 14 && Math.abs(g.dy) > Math.abs(g.dx) * 1.6,
      onPanResponderGrant: () => hold(),
      onPanResponderRelease: (_, g) => {
        if (g.dy > 90 || g.vy > 0.8) close();
        else release();
      },
      onPanResponderTerminate: () => release(),
    })
  ).current;

  if (failed) {
    return (
      <View style={[s.root, s.center]}>
        <StatusBar barStyle="light-content" />
        <Text style={s.message}>Ta rétrospective n’est pas encore prête.</Text>
        <Pressable onPress={close} style={s.messageBtn}>
          <Text style={s.messageBtnText}>Retour</Text>
        </Pressable>
      </View>
    );
  }

  if (!uri) {
    return (
      <View style={[s.root, s.center]}>
        <StatusBar barStyle="light-content" />
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  return (
    <View style={s.root} {...pan.panHandlers}>
      <StatusBar barStyle="light-content" />

      <Video
        ref={video}
        style={StyleSheet.absoluteFill}
        source={{ uri }}
        // CONTAIN et pas COVER : l'ecran est plus allonge que le 9:16 de la
        // video, donc COVER la rognait sur les cotes — d'ou l'impression de
        // zoom, et une typographie qui touchait les bords se faisait couper.
        resizeMode={ResizeMode.CONTAIN}
        shouldPlay
        isLooping={false}
        // 100 ms : assez fin pour que la barre avance sans à-coups, assez
        // large pour ne pas inonder le fil JS.
        progressUpdateIntervalMillis={100}
        onPlaybackStatusUpdate={onStatus}
      />

      {!ready && (
        <View style={[StyleSheet.absoluteFill, s.center]}>
          <ActivityIndicator color={colors.accent} />
        </View>
      )}

      <View style={[s.bars, { paddingTop: insets.top + 10 }]}>
        {Array.from({ length: segments }).map((_, i) => {
          const start = i * SEGMENT_MS;
          const end = Math.min(start + SEGMENT_MS, duration || start + SEGMENT_MS);
          const span = Math.max(1, end - start);
          const fill =
            i < index ? 1 : i > index ? 0 : Math.min(1, Math.max(0, (position - start) / span));
          return (
            <View key={i} style={s.track}>
              <View style={[s.fill, { width: `${fill * 100}%` }]} />
            </View>
          );
        })}
      </View>

      <View style={s.header}>
        <Text style={s.headerTitle}>Rétrospective {data?.year ?? year}</Text>
        <Pressable
          onPress={close}
          hitSlop={14}
          accessibilityRole="button"
          accessibilityLabel="Fermer la rétrospective"
        >
          <Ionicons name="close" size={26} color="#FFFFFF" />
        </Pressable>
      </View>

      <View style={s.touchLayer} pointerEvents="box-none">
        <Pressable
          style={s.touchLeft}
          onPress={() => {
            feedback.tap();
            goToSegment(index - 1);
          }}
          onLongPress={hold}
          delayLongPress={180}
          onPressOut={release}
        />
        <Pressable
          style={s.touchRight}
          onPress={() => {
            feedback.tap();
            goToSegment(index + 1);
          }}
          onLongPress={hold}
          delayLongPress={180}
          onPressOut={release}
        />
      </View>
    </View>
  );
};

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000000' },
  center: { alignItems: 'center', justifyContent: 'center' },

  bars: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    gap: 4,
    zIndex: 3,
  },
  track: {
    flex: 1,
    height: 3,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.28)',
    overflow: 'hidden',
  },
  fill: { height: '100%', backgroundColor: '#FFFFFF' },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingTop: 14,
    zIndex: 3,
  },
  headerTitle: {
    color: '#FFFFFF',
    fontFamily: fonts.semibold,
    fontSize: 15,
    letterSpacing: 0.3,
    // Le texte passe sur l'image : une ombre courte le garde lisible quel que
    // soit le plan derrière.
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },

  touchLayer: { ...StyleSheet.absoluteFillObject, flexDirection: 'row', zIndex: 1 },
  touchLeft: { width: '32%', height: '100%' },
  touchRight: { flex: 1, height: '100%' },

  message: {
    color: colors.textSecondary,
    fontFamily: fonts.regular,
    fontSize: 16,
    marginBottom: 18,
  },
  messageBtn: {
    paddingHorizontal: 22,
    paddingVertical: 12,
    backgroundColor: colors.accent,
  },
  messageBtnText: { color: colors.bg, fontFamily: fonts.bold, fontSize: 15 },
});

export default RetrospectiveScreen;
