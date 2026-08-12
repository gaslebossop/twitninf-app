import { colors, fonts, withAlpha } from '../theme';
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  Modal,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Animated,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { APP_VERSION } from '../services/clientIdentity';
import { PATCH_NOTES } from '../data/patchNotes';
import { useStartupPopupSlot } from '../contexts/StartupPopupContext';

export default function PatchNotesModal() {
  // `wanted` : cette version n'a pas encore été vue. `visible` : c'est en plus
  // notre tour dans la file des popups de démarrage (voir StartupPopupContext)
  // — sans ça, cette modale s'ouvrait par-dessus celle de la langue.
  const [wanted, setWanted] = useState(false);
  const visible = useStartupPopupSlot('patch', wanted);
  const [fadeAnim] = useState(new Animated.Value(0));
  const [slideAnim] = useState(new Animated.Value(50));

  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;

    (async () => {
      try {
        const lastSeen = await AsyncStorage.getItem('last_seen_version');
        if (!active || lastSeen === APP_VERSION) return;
        // Petit délai pour laisser l'app se charger
        timer = setTimeout(() => {
          if (active) setWanted(true);
        }, 1000);
      } catch (e) {
        console.error('Erreur check version:', e);
      }
    })();

    return () => {
      active = false;
      if (timer) clearTimeout(timer);
    };
  }, []);

  // L'animation d'entrée part quand la modale obtient réellement le créneau,
  // pas quand on le demande : sinon elle se jouait dans le vide en attendant.
  useEffect(() => {
    if (!visible) return;
    fadeAnim.setValue(0);
    slideAnim.setValue(50);
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 400, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 500, useNativeDriver: true }),
    ]).start();
  }, [visible, fadeAnim, slideAnim]);

  const handleClose = async () => {
    try {
      await AsyncStorage.setItem('last_seen_version', APP_VERSION);
    } catch (e) {
      console.error('Erreur save version:', e);
    }
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 0, duration: 300, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 50, duration: 300, useNativeDriver: true }),
      // Libère le créneau pour la popup suivante.
    ]).start(() => setWanted(false));
  };

  if (!visible) return null;

  const currentNote = PATCH_NOTES[0];

  return (
    <Modal transparent visible={visible} animationType="none" statusBarTranslucent>
      <View style={S.overlay}>
        <Animated.View
          style={[
            S.container,
            {
              opacity: fadeAnim,
              transform: [{ translateY: slideAnim }],
            },
          ]}
        >
          <View style={S.header}>
            <View style={S.iconBox}>
              <Ionicons name="sparkles" size={24} color={colors.accentBright} />
            </View>
            <View style={S.headerText}>
              <Text style={S.version}>Nouveautés</Text>
              <Text style={S.title}>{currentNote.title}</Text>
            </View>
          </View>

          <ScrollView style={S.scroll} showsVerticalScrollIndicator={false}>
            <Text style={S.intro}>Quoi de neuf dans cette version ?</Text>

            {currentNote.items.map((item, index) => (
              <View key={index} style={S.itemRow}>
                <View style={S.bullet} />
                <Text style={S.itemText}>{item}</Text>
              </View>
            ))}

            <View style={S.footerSpace} />
          </ScrollView>

          <TouchableOpacity
            style={S.button}
            onPress={handleClose}
            activeOpacity={0.85}
          >
            <Text style={S.buttonText}>C'est parti !</Text>
          </TouchableOpacity>
        </Animated.View>
      </View>
    </Modal>
  );
}

const S = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  container: {
    width: '100%',
    maxWidth: 480,
    maxHeight: '80%',
    backgroundColor: colors.surfaceElevated,
    borderRadius: 24,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderStrong,
    padding: 22,
    overflow: 'hidden',
    ...Platform.select({
      ios: {
        shadowColor: colors.black,
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.4,
        shadowRadius: 20,
      },
      android: {
        elevation: 10,
      },
    }),
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  iconBox: {
    width: 52,
    height: 52,
    borderRadius: 18,
    backgroundColor: colors.accentMuted,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: withAlpha(colors.accent, 0.45),
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  headerText: {
    flex: 1,
  },
  version: {
    color: colors.accentBright,
    fontSize: 12,
    fontFamily: fonts.bold,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  title: {
    color: colors.textPrimary,
    fontSize: 22,
    letterSpacing: -0.5,
    fontFamily: fonts.display,
    marginTop: 2,
  },
  scroll: {
    marginBottom: 20,
  },
  intro: {
    color: colors.textSecondary,
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 16,
    fontFamily: fonts.regular,
  },
  itemRow: {
    flexDirection: 'row',
    marginBottom: 14,
    paddingRight: 8,
  },
  bullet: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.accent,
    marginTop: 8,
    marginRight: 12,
  },
  itemText: {
    color: colors.textPrimary,
    fontSize: 14,
    lineHeight: 21,
    fontFamily: fonts.regular,
    flex: 1,
  },
  footerSpace: {
    height: 6,
  },
  button: {
    backgroundColor: colors.accent,
    paddingVertical: 15,
    borderRadius: 16,
    alignItems: 'center',
    width: '100%',
  },
  buttonText: {
    color: colors.onAccent,
    fontSize: 15,
    fontFamily: fonts.bold,
  },
});
