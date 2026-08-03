import { fonts } from '../theme';
import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  effectiveSubscriptionTier,
  canUseFeature,
  type SubscriptionTier,
} from '../utils/subscriptionTier';

interface PremiumThemeSelectorProps {
  currentTheme: string;
  onThemeSelect: (theme: string) => void;
  isPremium: boolean;
  subscriptionTier?: string | null;
}

type TierRow = { free: boolean; minTier?: 'plus' | 'pro' };

function rowRequirement(row: TierRow): 'free' | 'plus' | 'pro' {
  if (row.free) return 'free';
  return row.minTier || 'plus';
}

function rowUnlocked(userTier: SubscriptionTier, row: TierRow): boolean {
  const r = rowRequirement(row);
  if (r === 'free') return true;
  return canUseFeature(userTier, r);
}

const PREMIUM_THEMES: Array<{
  id: string;
  name: string;
  description: string;
  colors: string[];
  icon: string;
  free: boolean;
  minTier?: 'plus' | 'pro';
}> = [
  {
    id: 'default',
    name: 'Défaut',
    description: 'Thème classique TwitNin',
    colors: ['#15171C', '#1B1E25', '#0f3460'],
    icon: 'home',
    free: true,
  },
  {
    id: 'dark_purple',
    name: 'Violet Sombre',
    description: 'Élégance violette',
    colors: ['#2d1b69', '#8b5cf6', '#a855f7'],
    icon: 'moon',
    free: false,
  },
  {
    id: 'neon_blue',
    name: 'Bleu Néon',
    description: 'Cyberpunk futuriste',
    colors: ['#0a0a0a', '#4F7CFF', '#3D63D9'],
    icon: 'flash',
    free: false,
  },
  {
    id: 'sunset',
    name: 'Coucher de Soleil',
    description: 'Chaleur dorée',
    colors: ['#ff6b6b', '#ff8e53', '#ffad5a'],
    icon: 'sunny',
    free: false,
  },
  {
    id: 'forest',
    name: 'Forêt Mystique',
    description: 'Nature apaisante',
    colors: ['#134e5e', '#71b280', '#95e1d3'],
    icon: 'leaf',
    free: false,
  },
  {
    id: 'galaxy',
    name: 'Galaxie',
    description: 'Cosmos infini',
    colors: ['#000000', '#1a0033', '#330066', '#660099'],
    icon: 'planet',
    free: false,
    minTier: 'pro',
  },
  {
    id: 'fire',
    name: 'Flammes',
    description: 'Passion ardente',
    colors: ['#ff4500', '#ff6b00', '#ff8c00'],
    icon: 'flame',
    free: false,
  },
  {
    id: 'ocean',
    name: 'Océan Profond',
    description: 'Sérénité aquatique',
    colors: ['#001a33', '#003366', '#0066cc', '#0099ff'],
    icon: 'water',
    free: false,
  },
  {
    id: 'rose_gold',
    name: 'Or Rose',
    description: 'Luxe moderne',
    colors: ['#ffd89b', '#19547b', '#e8cbc0'],
    icon: 'diamond',
    free: false,
    minTier: 'pro',
  },
  {
    id: 'matrix',
    name: 'Matrix',
    description: 'Code vert',
    colors: ['#000000', '#001100', '#00ff00'],
    icon: 'code-slash',
    free: false,
    minTier: 'pro',
  },
];

const BACKGROUND_TYPES = [
  { id: 'none', name: 'Aucun', icon: 'square-outline', free: true },
  { id: 'gradient', name: 'Dégradé', icon: 'color-palette', free: true },
  { id: 'animated', name: 'Animé', icon: 'play-circle', free: false, minTier: 'plus' as const },
  { id: 'particles', name: 'Particules', icon: 'sparkles', free: false, minTier: 'pro' as const },
  { id: 'waves', name: 'Vagues', icon: 'water', free: false, minTier: 'plus' as const },
  { id: 'galaxy', name: 'Galaxie', icon: 'planet', free: false, minTier: 'pro' as const },
  { id: 'matrix', name: 'Matrix', icon: 'code-slash', free: false, minTier: 'pro' as const },
  { id: 'neon', name: 'Néon', icon: 'flash', free: false, minTier: 'pro' as const },
  { id: 'cyberpunk', name: 'Cyberpunk', icon: 'hardware-chip', free: false, minTier: 'pro' as const },
  { id: 'aurora', name: 'Aurore', icon: 'rainbow', free: false, minTier: 'pro' as const },
];

const PROFILE_EFFECTS = [
  { id: 'none', name: 'Aucun', icon: 'ellipse-outline', free: true },
  { id: 'rainbow', name: 'Arc-en-ciel', icon: 'rainbow', free: false, minTier: 'plus' as const },
  { id: 'galaxy', name: 'Galaxie', icon: 'planet', free: false, minTier: 'plus' as const },
  { id: 'fire', name: 'Feu', icon: 'flame', free: false, minTier: 'plus' as const },
  { id: 'ocean', name: 'Océan', icon: 'water', free: false, minTier: 'plus' as const },
  { id: 'aurora', name: 'Aurore', icon: 'snow', free: false, minTier: 'pro' as const },
  { id: 'cosmic', name: 'Cosmique', icon: 'sparkles', free: false, minTier: 'pro' as const },
  { id: 'diamond', name: 'Diamant', icon: 'diamond', free: false, minTier: 'pro' as const },
];

export default function PremiumThemeSelector({ 
  currentTheme, 
  onThemeSelect, 
  isPremium,
  subscriptionTier,
}: PremiumThemeSelectorProps) {
  const [selectedBackground, setSelectedBackground] = useState('none');
  const [selectedEffect, setSelectedEffect] = useState('none');

  const userTier = effectiveSubscriptionTier(!!isPremium, subscriptionTier);

  const handleThemeSelect = async (themeId: string) => {
    const theme = PREMIUM_THEMES.find(t => t.id === themeId);
    if (!theme) return;

    if (!rowUnlocked(userTier, theme)) {
      const needPro = rowRequirement(theme) === 'pro';
      Alert.alert(
        needPro ? '⭐ Abonnement Pro requis' : '💎 Abonnement Plus requis',
        needPro
          ? 'Ce thème est réservé au palier Pro.'
          : 'Ce thème est inclus à partir du palier Plus.',
        [{ text: 'OK', style: 'cancel' }]
      );
      return;
    }

    try {
      await AsyncStorage.setItem('selectedTheme', themeId);
      onThemeSelect(themeId);
    } catch (error) {
      console.error('Erreur sauvegarde thème:', error);
    }
  };

  const handleBackgroundSelect = async (backgroundId: string) => {
    const background = BACKGROUND_TYPES.find(b => b.id === backgroundId);
    if (!background) return;

    if (!rowUnlocked(userTier, background)) {
      const needPro = rowRequirement(background) === 'pro';
      Alert.alert(
        needPro ? '⭐ Abonnement Pro requis' : '💎 Abonnement Plus requis',
        needPro
          ? 'Cet arrière-plan est réservé au palier Pro.'
          : 'Cet arrière-plan est inclus à partir du palier Plus.',
        [{ text: 'OK', style: 'cancel' }]
      );
      return;
    }

    try {
      await AsyncStorage.setItem('selectedBackground', backgroundId);
      setSelectedBackground(backgroundId);
    } catch (error) {
      console.error('Erreur sauvegarde arrière-plan:', error);
    }
  };

  const handleEffectSelect = async (effectId: string) => {
    const effect = PROFILE_EFFECTS.find(e => e.id === effectId);
    if (!effect) return;

    if (!rowUnlocked(userTier, effect)) {
      const needPro = rowRequirement(effect) === 'pro';
      Alert.alert(
        needPro ? '⭐ Abonnement Pro requis' : '💎 Abonnement Plus requis',
        needPro
          ? 'Cet effet est réservé au palier Pro.'
          : 'Cet effet est inclus à partir du palier Plus.',
        [{ text: 'OK', style: 'cancel' }]
      );
      return;
    }

    try {
      await AsyncStorage.setItem('selectedProfileEffect', effectId);
      setSelectedEffect(effectId);
    } catch (error) {
      console.error('Erreur sauvegarde effet:', error);
    }
  };

  const renderThemeCard = (theme: typeof PREMIUM_THEMES[0]) => (
    <TouchableOpacity
      key={theme.id}
      style={[
        styles.themeCard,
        currentTheme === theme.id && styles.selectedCard,
      ]}
      onPress={() => handleThemeSelect(theme.id)}
    >
      <LinearGradient
        colors={theme.colors as any}
        style={styles.themePreview}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      >
        <Ionicons name={theme.icon as any} size={24} color="#ffffff" />
        {!rowUnlocked(userTier, theme) && (
          <View style={styles.lockOverlay}>
            <Ionicons name="lock-closed" size={16} color="#ffffff" />
          </View>
        )}
      </LinearGradient>
      <Text style={styles.themeName}>{theme.name}</Text>
      <Text style={styles.themeDescription}>{theme.description}</Text>
      {!theme.free && (
        <View style={styles.premiumBadge}>
          <Ionicons name="diamond" size={12} color="#ffd700" />
          <Text style={styles.premiumText}>
            {rowRequirement(theme) === 'pro' ? 'PRO' : 'PLUS'}
          </Text>
        </View>
      )}
    </TouchableOpacity>
  );

  const renderBackgroundOption = (background: typeof BACKGROUND_TYPES[0]) => (
    <TouchableOpacity
      key={background.id}
      style={[
        styles.optionCard,
        selectedBackground === background.id && styles.selectedOption,
      ]}
      onPress={() => handleBackgroundSelect(background.id)}
    >
      <Ionicons 
        name={background.icon as any} 
        size={20} 
        color={selectedBackground === background.id ? '#4F7CFF' : '#ffffff'} 
      />
      <Text style={[
        styles.optionText,
        selectedBackground === background.id && styles.selectedOptionText,
      ]}>
        {background.name}
      </Text>
      {!rowUnlocked(userTier, background) && (
        <Ionicons name="lock-closed" size={14} color="#666666" />
      )}
    </TouchableOpacity>
  );

  const renderEffectOption = (effect: typeof PROFILE_EFFECTS[0]) => (
    <TouchableOpacity
      key={effect.id}
      style={[
        styles.optionCard,
        selectedEffect === effect.id && styles.selectedOption,
      ]}
      onPress={() => handleEffectSelect(effect.id)}
    >
      <Ionicons 
        name={effect.icon as any} 
        size={20} 
        color={selectedEffect === effect.id ? '#4F7CFF' : '#ffffff'} 
      />
      <Text style={[
        styles.optionText,
        selectedEffect === effect.id && styles.selectedOptionText,
      ]}>
        {effect.name}
      </Text>
      {!rowUnlocked(userTier, effect) && (
        <Ionicons name="lock-closed" size={14} color="#666666" />
      )}
    </TouchableOpacity>
  );

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      {/* Header Premium */}
      <LinearGradient
        colors={['#ff6b6b', '#ff8e53', '#ffad5a'] as any}
        style={styles.header}
      >
        <Ionicons name="color-palette" size={32} color="#ffffff" />
        <Text style={styles.headerTitle}>Personnalisation Premium</Text>
        <Text style={styles.headerSubtitle}>
          Transformez votre profil avec des thèmes exclusifs
        </Text>
      </LinearGradient>

      {/* Thèmes */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>🎨 Thèmes de Couleur</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={styles.horizontalContainer}>
            {PREMIUM_THEMES.map(renderThemeCard)}
          </View>
        </ScrollView>
      </View>

      {/* Arrière-plans */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>🌌 Arrière-plans Animés</Text>
        <View style={styles.optionsGrid}>
          {BACKGROUND_TYPES.map(renderBackgroundOption)}
        </View>
      </View>

      {/* Effets de Profil */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>✨ Effets de Photo de Profil</Text>
        <View style={styles.optionsGrid}>
          {PROFILE_EFFECTS.map(renderEffectOption)}
        </View>
      </View>

      {/* Call to Action Premium */}
      {userTier === 'free' && (
        <TouchableOpacity style={styles.premiumCTA}>
          <LinearGradient
            colors={['#667eea', '#764ba2'] as any}
            style={styles.ctaGradient}
          >
            <Ionicons name="diamond" size={24} color="#ffffff" />
            <Text style={styles.ctaTitle}>Abonnements Plus & Pro</Text>
            <Text style={styles.ctaSubtitle}>
              Accès aux thèmes et effets selon votre palier
            </Text>
          </LinearGradient>
        </TouchableOpacity>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  header: {
    padding: 20,
    alignItems: 'center',
    marginBottom: 20,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold', fontFamily: fonts.bold,
    color: '#ffffff',
    marginTop: 10,
  },
  headerSubtitle: {
    fontSize: 14,
    color: '#ffffff',
    opacity: 0.9,
    textAlign: 'center',
    marginTop: 5,
  },
  section: {
    marginBottom: 30,
    paddingHorizontal: 20,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold', fontFamily: fonts.bold,
    color: '#ffffff',
    marginBottom: 15,
  },
  horizontalContainer: {
    flexDirection: 'row',
    gap: 15,
    paddingRight: 20,
  },
  themeCard: {
    width: 120,
    alignItems: 'center',
  },
  selectedCard: {
    transform: [{ scale: 1.05 }],
  },
  themePreview: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    elevation: 5,
  },
  lockOverlay: {
    position: 'absolute',
    top: -5,
    right: -5,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    borderRadius: 12,
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  themeName: {
    color: '#ffffff',
    fontWeight: 'bold', fontFamily: fonts.bold,
    fontSize: 14,
    marginTop: 8,
    textAlign: 'center',
  },
  themeDescription: {
    color: '#9BA1AC',
    fontSize: 12,
    textAlign: 'center',
    marginTop: 4,
  },
  premiumBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 215, 0, 0.2)',
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginTop: 4,
    gap: 4,
  },
  premiumText: {
    color: '#ffd700',
    fontSize: 10,
    fontWeight: 'bold', fontFamily: fonts.bold,
  },
  optionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  optionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  selectedOption: {
    borderColor: '#4F7CFF',
    backgroundColor: 'rgba(0, 212, 255, 0.2)',
  },
  optionText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '500', fontFamily: fonts.medium,
  },
  selectedOptionText: {
    color: '#4F7CFF',
    fontWeight: 'bold', fontFamily: fonts.bold,
  },
  premiumCTA: {
    margin: 20,
    borderRadius: 15,
    overflow: 'hidden',
  },
  ctaGradient: {
    padding: 20,
    alignItems: 'center',
  },
  ctaTitle: {
    fontSize: 20,
    fontWeight: 'bold', fontFamily: fonts.bold,
    color: '#ffffff',
    marginTop: 10,
  },
  ctaSubtitle: {
    fontSize: 14,
    color: '#ffffff',
    opacity: 0.9,
    textAlign: 'center',
    marginTop: 5,
  },
});
