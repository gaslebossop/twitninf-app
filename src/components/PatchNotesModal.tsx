import { colors, fonts } from '../theme';
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { APP_VERSION } from '../services/clientIdentity';
import { PATCH_NOTES } from '../data/patchNotes';
import { useStartupPopupSlot } from '../contexts/StartupPopupContext';
import StartupStepPage, { stepStyles } from './StartupStepPage';

export default function PatchNotesModal() {
  // `wanted` : cette version n'a pas encore été vue. `visible` : c'est en plus
  // notre tour dans la file des étapes de démarrage (voir StartupPopupContext).
  const [wanted, setWanted] = useState(false);
  const visible = useStartupPopupSlot('patch', wanted);

  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;

    (async () => {
      try {
        const lastSeen = await AsyncStorage.getItem('last_seen_version');
        if (!active || lastSeen === APP_VERSION) return;
        // Petit délai pour laisser l'app se charger. L'ordre d'affichage vient
        // de la file (REGISTRATION_WINDOW_MS), pas de ce délai.
        timer = setTimeout(() => {
          if (active) setWanted(true);
        }, 250);
      } catch (e) {
        console.error('Erreur check version:', e);
      }
    })();

    return () => {
      active = false;
      if (timer) clearTimeout(timer);
    };
  }, []);

  const handleClose = async () => {
    try {
      await AsyncStorage.setItem('last_seen_version', APP_VERSION);
    } catch (e) {
      console.error('Erreur save version:', e);
    }
    // Libère le créneau pour l'étape suivante.
    setWanted(false);
  };

  if (!visible) return null;

  const currentNote = PATCH_NOTES[0];

  return (
    <StartupStepPage
      visible={visible}
      icon="sparkles"
      title={currentNote.title}
      subtitle="Quoi de neuf dans cette version ?"
      footer={
        <TouchableOpacity style={stepStyles.primaryButton} onPress={handleClose} activeOpacity={0.85}>
          <Text style={stepStyles.primaryText}>C'est parti !</Text>
        </TouchableOpacity>
      }
    >
      {currentNote.items.map((item, index) => (
        <View key={index} style={S.itemRow}>
          <View style={S.bullet} />
          <Text style={S.itemText}>{item}</Text>
        </View>
      ))}
    </StartupStepPage>
  );
}

const S = StyleSheet.create({
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
});
