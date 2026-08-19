import { colors, fonts, glow , statusBarStyle} from '../theme';
import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
  StatusBar,
  ActivityIndicator,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useNavigation } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import * as ImagePicker from 'expo-image-picker';
import { Video, ResizeMode } from 'expo-av';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { toast } from '../components/ui/Toast';

export default function CreateVideoScreen() {
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const videoRef = useRef<Video>(null);

  const [videoUri, setVideoUri] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);

  // ── Import galerie ──
  // Filmer passe par `RecordVideo` (caméra de l'app) : il ne reste ici que
  // l'import, d'où la disparition de la branche caméra.
  const pickVideo = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) { toast.error('Permission requise'); return; }
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Videos,
      allowsEditing: true,
      videoMaxDuration: 60,
      quality: 1,
    });
    if (!res.canceled && res.assets?.[0]) setVideoUri(res.assets[0].uri);
  };

  // ── Next / export ──
  const goNext = async () => {
    if (!videoUri) return;
    setProcessing(true);
    setProcessing(false);
    navigation.navigate('VideoCaption', { videoUri });
  };

  // ════════════════════════════════════════════════════════════
  //  SCREEN 1 — Video picker
  // ════════════════════════════════════════════════════════════
  if (!videoUri) {
    return (
      <View style={styles.root}>
        <StatusBar barStyle={statusBarStyle()} />
        <View style={[StyleSheet.absoluteFillObject, { backgroundColor: colors.bg }]} />

        <View style={[styles.topBar, { paddingTop: insets.top + 10 }]}>
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <Ionicons name="close" size={30} color={colors.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.topTitle}>Créer</Text>
          <View style={{ width: 30 }} />
        </View>

        <View style={styles.pickerCenter}>
          <View style={[styles.bigIcon, { backgroundColor: colors.accent }, glow(colors.accent, 18)]}>
            <Ionicons name="videocam" size={50} color={colors.white} />
          </View>
          <Text style={styles.selTitle}>Publier une vidéo</Text>
          <Text style={styles.selSub}>Filmez ou choisissez depuis votre galerie{'\n'}Durée max : 60 secondes</Text>
          <View style={styles.selBtns}>
            {/* Caméra de l'app, plus celle du système : segments, limite de
                durée par palier et encodage 720p/1080p à la source. */}
            <TouchableOpacity style={[styles.selBtn, styles.selBtnFilled, { backgroundColor: colors.accent }]} onPress={() => navigation.navigate('RecordVideo')} activeOpacity={0.8}>
              <Ionicons name="camera" size={22} color={colors.white} />
              <Text style={styles.selBtnText}>Filmer</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.selBtn, styles.selBtnFilled, { backgroundColor: colors.surfaceAlt }]} onPress={pickVideo} activeOpacity={0.8}>
              <Ionicons name="images" size={22} color={colors.textPrimary} />
              <Text style={styles.selBtnText}>Galerie</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  }

  // ════════════════════════════════════════════════════════════
  //  SCREEN 2 — Preview
  // ════════════════════════════════════════════════════════════
  return (
    <View style={styles.root}>
      <StatusBar barStyle={statusBarStyle()} />

      {/* Full-screen video */}
      <Video
        ref={videoRef}
        source={{ uri: videoUri }}
        style={StyleSheet.absoluteFillObject}
        resizeMode={ResizeMode.COVER}
        isLooping
        shouldPlay={!processing}
        isMuted={false}
      />

      <LinearGradient colors={['rgba(0,0,0,0.55)', 'transparent']} style={styles.topGrad} />
      <LinearGradient colors={['transparent', 'rgba(0,0,0,0.75)']} style={styles.bottomGrad} />

      <View style={[styles.topBar, { paddingTop: insets.top + 10 }]}>
        <TouchableOpacity onPress={() => setVideoUri(null)}>
          <Ionicons name="chevron-back" size={30} color="white" />
        </TouchableOpacity>
        <Text style={styles.topTitle}>Aperçu</Text>
        <View style={{ width: 30 }} />
      </View>

      {/* Side toolbar */}
      <View style={styles.sideBar}>
        <TouchableOpacity style={styles.sideBtn} onPress={() => setVideoUri(null)}>
          <View style={styles.sideBtnCircle}>
            <Ionicons name="refresh" size={22} color="white" />
          </View>
          <Text style={styles.sideBtnLbl}>Changer</Text>
        </TouchableOpacity>
      </View>

      {/* Bottom next button */}
      <View style={[styles.bottomBar, { paddingBottom: insets.bottom + 15 }]}>
        <TouchableOpacity style={[styles.nextBtn, { backgroundColor: colors.accent }, glow(colors.accent, 14)]} onPress={goNext} activeOpacity={0.85}>
          <Text style={styles.nextTxt}>Suivant</Text>
          <Ionicons name="arrow-forward" size={20} color={colors.white} />
        </TouchableOpacity>
      </View>

      {/* ══════════════════════════════════════════
          PROCESSING OVERLAY
      ══════════════════════════════════════════ */}
      {processing && (
        <View style={styles.processingOverlay}>
          <View style={styles.processingCard}>
            <ActivityIndicator size="large" color={colors.accent} />
            <Text style={styles.processingTitle}>Finalisation…</Text>
            <Text style={styles.processingSubtitle}>Préparation de la vidéo</Text>
          </View>
        </View>
      )}
    </View>
  );
}

// ─────────────────────────── STYLES ─────────────────────────────────
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: 'transparent' },

  // ── Gradients ──
  topGrad: {
    position: 'absolute', top: 0, left: 0, right: 0, height: 140, zIndex: 5,
  },
  bottomGrad: {
    position: 'absolute', bottom: 0, left: 0, right: 0, height: 200, zIndex: 5,
  },

  // ── Shared top bar ──
  topBar: {
    position: 'absolute', top: 0, left: 0, right: 0, zIndex: 20,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16,
  },
  topTitle: { color: colors.textPrimary, fontSize: 17, fontFamily: fonts.bold },

  // ── Picker screen ──
  pickerCenter: {
    flex: 1, justifyContent: 'center', alignItems: 'center', gap: 18, paddingHorizontal: 36,
  },
  bigIcon: {
    width: 96, height: 96, borderRadius: 48,
    justifyContent: 'center', alignItems: 'center', marginBottom: 8,
  },
  selTitle: { color: colors.textPrimary, fontSize: 24, fontFamily: fonts.displayHeavy, textAlign: 'center' },
  selSub: { color: colors.textSecondary, fontSize: 14, textAlign: 'center', lineHeight: 20 },
  selBtns: { flexDirection: 'row', gap: 14, marginTop: 18, width: '100%' },
  selBtn: { flex: 1 },
  selBtnFilled: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, paddingVertical: 15, borderRadius: 14,
  },
  selBtnText: { color: colors.white, fontSize: 15, fontFamily: fonts.bold },

  // ── Side toolbar ──
  sideBar: {
    position: 'absolute', right: 12, top: '32%',
    alignItems: 'center', gap: 16, zIndex: 10,
  },
  sideBtn: { alignItems: 'center', gap: 4 },
  sideBtnCircle: {
    width: 48, height: 48, borderRadius: 24,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center', alignItems: 'center',
    borderWidth: 1, borderColor: colors.overlayStrong,
  },
  sideBtnLbl: { color: '#fff', fontSize: 11, fontWeight: '600' },

  // ── Bottom bar ──
  bottomBar: {
    position: 'absolute', bottom: 0, left: 0, right: 0, paddingHorizontal: 20, zIndex: 10,
  },
  nextBtn: {
    borderRadius: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, paddingVertical: 16,
  },
  nextTxt: { color: colors.white, fontSize: 17, fontFamily: fonts.bold },

  // ── Processing ──
  processingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 99,
  },
  processingCard: {
    backgroundColor: colors.surface,
    borderRadius: 20,
    padding: 32,
    alignItems: 'center',
    gap: 14,
    minWidth: 220,
  },
  processingTitle: {
    color: colors.textPrimary, fontSize: 18, fontFamily: fonts.bold,
  },
  processingSubtitle: {
    color: colors.textSecondary, fontSize: 13, textAlign: 'center',
  },
});