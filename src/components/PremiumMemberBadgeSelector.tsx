import { fonts, colors } from '../theme';
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import AsyncStorage from '@react-native-async-storage/async-storage';
import PremiumBadge from './PremiumBadge';
import { MEMBER_BADGE_OPTIONS, MEMBER_BADGE_STORAGE_KEY, badgeAllowedForTier } from '../utils/profileMemberBadges';
import { effectiveSubscriptionTier } from '../utils/subscriptionTier';
import { toast } from './ui/Toast';

interface PremiumMemberBadgeSelectorProps {
  currentBadgeId: string;
  onBadgeChange: (id: string) => void;
  isPremium: boolean;
  subscriptionTier?: string | null;
}

export default function PremiumMemberBadgeSelector({
  currentBadgeId,
  onBadgeChange,
  isPremium,
  subscriptionTier,
}: PremiumMemberBadgeSelectorProps) {
  const userTier = effectiveSubscriptionTier(!!isPremium, subscriptionTier);

  const handleSelect = async (id: string) => {
    const def = MEMBER_BADGE_OPTIONS.find((b) => b.id === id);
    if (!def) return;
    if (!badgeAllowedForTier(userTier, def)) {
      toast.info(def.minTier === 'pro' ? 'Palier Pro' : 'Palier Plus', {
        description: def.minTier === 'pro'
          ? `« ${def.label} » est réservé aux membres Pro.`
          : `« ${def.label} » nécessite au moins Plus.`,
      });
      return;
    }
    try {
      await AsyncStorage.setItem(MEMBER_BADGE_STORAGE_KEY, id);
      onBadgeChange(id);
    } catch {
      toast.error('Impossible d’enregistrer le badge.');
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.description}>
        {userTier !== 'free'
          ? 'Choisis l’icône affichée à côté de ton nom sur ton profil.'
          : 'Avec Plus ou Pro tu débloques les badges personnalisés.'}
      </Text>

      <View style={styles.previewRow}>
        <Text style={styles.previewLabel}>Aperçu</Text>
        <PremiumBadge
          type="medium"
          animated
          subscriptionTier={userTier}
          memberBadgeId={currentBadgeId}
        />
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
        {MEMBER_BADGE_OPTIONS.map((b) => {
          const allowed = badgeAllowedForTier(userTier, b);
          const selected = currentBadgeId === b.id;
          return (
            <TouchableOpacity
              key={b.id}
              style={[styles.chip, selected && styles.chipSelected, !allowed && styles.chipLocked]}
              onPress={() => handleSelect(b.id)}
              activeOpacity={0.75}
            >
              <LinearGradient colors={b.colors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.chipIcon}>
                <Ionicons name={b.icon as any} size={18} color="#fff" />
              </LinearGradient>
              <Text style={[styles.chipLabel, !allowed && styles.chipLabelMuted]} numberOfLines={1}>
                {b.label}
              </Text>
              {b.minTier === 'pro' && (
                <View style={styles.tierTag}>
                  <Ionicons name="star" size={9} color="#fbbf24" />
                </View>
              )}
              {selected && <Ionicons name="checkmark-circle" size={16} color="#38bdf8" style={styles.check} />}
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginTop: 4 },
  description: { color: '#8899a6', fontSize: 13, lineHeight: 19, marginBottom: 12 },
  previewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 14,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: colors.overlaySoft,
    borderWidth: 1,
    borderColor: colors.overlayMedium,
  },
  previewLabel: { color: '#e7e9ea', fontWeight: '700', fontFamily: fonts.bold, fontSize: 14 },
  row: { gap: 10, paddingRight: 8, paddingBottom: 4 },
  chip: {
    width: 92,
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 14,
    backgroundColor: colors.overlayMedium,
    borderWidth: 1,
    borderColor: colors.overlayMedium,
  },
  chipSelected: {
    borderColor: 'rgba(56, 189, 248, 0.65)',
    backgroundColor: 'rgba(56, 189, 248, 0.1)',
  },
  chipLocked: { opacity: 0.45 },
  chipIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  chipLabel: { color: '#e7e9ea', fontSize: 11, fontWeight: '600', fontFamily: fonts.semibold, textAlign: 'center' },
  chipLabelMuted: { color: '#536471' },
  tierTag: {
    position: 'absolute',
    top: 6,
    right: 6,
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderRadius: 8,
    padding: 2,
  },
  check: { position: 'absolute', bottom: 4, right: 4 },
});
