import { fonts } from '../theme';
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { canUseFeature, effectiveSubscriptionTier } from '../utils/subscriptionTier';
import {
  DISPLAY_NAME_EFFECT_KEY,
  DISPLAY_NAME_FONT_KEY,
  DISPLAY_NAME_EFFECT_OPTIONS,
  DISPLAY_NAME_FONT_OPTIONS,
  isProDisplayNameTier,
} from '../utils/profileDisplayNamePrefs';
import PremiumDisplayName from './PremiumDisplayName';

interface PremiumDisplayNameSelectorProps {
  fontId: string;
  effectId: string;
  onChangeFont: (id: string) => void;
  onChangeEffect: (id: string) => void;
  isPremium: boolean;
  subscriptionTier?: string | null;
}

export default function PremiumDisplayNameSelector({
  fontId,
  effectId,
  onChangeFont,
  onChangeEffect,
  isPremium,
  subscriptionTier,
}: PremiumDisplayNameSelectorProps) {
  const tier = effectiveSubscriptionTier(!!isPremium, subscriptionTier);
  const unlocked = isProDisplayNameTier(tier);

  const persistFont = async (id: string) => {
    if (!canUseFeature(tier, 'pro')) {
      Alert.alert('Palier Pro', 'Les polices et effets sur le nom sont réservés aux membres Pro.', [{ text: 'OK' }]);
      return;
    }
    try {
      await AsyncStorage.setItem(DISPLAY_NAME_FONT_KEY, id);
      onChangeFont(id);
    } catch {
      Alert.alert('Erreur', 'Impossible d’enregistrer la police.');
    }
  };

  const persistEffect = async (id: string) => {
    if (!canUseFeature(tier, 'pro')) {
      Alert.alert('Palier Pro', 'Les effets sur le nom sont réservés aux membres Pro.', [{ text: 'OK' }]);
      return;
    }
    try {
      await AsyncStorage.setItem(DISPLAY_NAME_EFFECT_KEY, id);
      onChangeEffect(id);
    } catch {
      Alert.alert('Erreur', 'Impossible d’enregistrer l’effet.');
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.previewLabel}>Aperçu</Text>
      <View style={styles.previewBox}>
        <PremiumDisplayName
          text="Ton nom affiché"
          baseStyle={styles.previewName}
          isPremium={isPremium}
          subscriptionTierRaw={subscriptionTier}
          fontId={fontId}
          effectId={effectId}
          numberOfLines={1}
        />
      </View>

      <Text style={styles.subLabel}>Police</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
        {DISPLAY_NAME_FONT_OPTIONS.map((opt) => {
          const selected = fontId === opt.id;
          return (
            <TouchableOpacity
              key={opt.id}
              style={[styles.chip, selected && styles.chipOn, !unlocked && styles.chipDim]}
              onPress={() => persistFont(opt.id)}
              activeOpacity={0.8}
            >
              <Text style={[styles.chipTitle, selected && styles.chipTitleOn]}>{opt.label}</Text>
              <Text style={styles.chipDesc} numberOfLines={2}>{opt.description}</Text>
              {selected && <Ionicons name="checkmark-circle" size={14} color="#38bdf8" style={styles.check} />}
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      <Text style={[styles.subLabel, { marginTop: 14 }]}>Effet</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
        {DISPLAY_NAME_EFFECT_OPTIONS.map((opt) => {
          const selected = effectId === opt.id;
          return (
            <TouchableOpacity
              key={opt.id}
              style={[styles.chip, selected && styles.chipOn, !unlocked && styles.chipDim]}
              onPress={() => persistEffect(opt.id)}
              activeOpacity={0.8}
            >
              <Text style={[styles.chipTitle, selected && styles.chipTitleOn]}>{opt.label}</Text>
              <Text style={styles.chipDesc} numberOfLines={2}>{opt.description}</Text>
              {selected && <Ionicons name="checkmark-circle" size={14} color="#38bdf8" style={styles.check} />}
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {!unlocked && (
        <Text style={styles.hint}>Passe Pro pour débloquer ces options sur ton profil.</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginTop: 4 },
  previewLabel: { color: '#8899a6', fontSize: 12, marginBottom: 6, fontWeight: '600' },
  previewBox: {
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.35)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    marginBottom: 14,
    overflow: 'visible',
  },
  previewName: { fontSize: 22, letterSpacing: -0.4 },
  subLabel: { color: '#e7e9ea', fontWeight: '700', fontFamily: fonts.bold, fontSize: 13, marginBottom: 8 },
  row: { gap: 10, paddingRight: 8, paddingBottom: 4 },
  chip: {
    width: 118,
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.09)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  chipOn: { borderColor: 'rgba(56, 189, 248, 0.65)', backgroundColor: 'rgba(56, 189, 248, 0.1)' },
  chipDim: { opacity: 0.45 },
  chipTitle: { color: '#e7e9ea', fontWeight: '700', fontFamily: fonts.bold, fontSize: 13 },
  chipTitleOn: { color: '#fff' },
  chipDesc: { color: '#8899a6', fontSize: 10, marginTop: 4, lineHeight: 13 },
  check: { position: 'absolute', bottom: 6, right: 6 },
  hint: { marginTop: 10, color: '#a78bfa', fontSize: 12, lineHeight: 17 },
});
