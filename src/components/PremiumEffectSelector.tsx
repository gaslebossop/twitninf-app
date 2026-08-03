import { fonts } from '../theme';
import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  Modal,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import AsyncStorage from '@react-native-async-storage/async-storage';
import PremiumProfileEffects, { PREMIUM_PROFILE_RING } from './PremiumProfileEffects';
import Avatar from './Avatar';
import {
  effectiveSubscriptionTier,
  canUseFeature,
  type SubscriptionTier,
} from '../utils/subscriptionTier';

interface PremiumEffectSelectorProps {
  currentEffect: string;
  onEffectChange: (effect: string) => void;
  isPremium: boolean;
  /** Palier API ; optionnel (rétrocompat : seulement isPremium) */
  subscriptionTier?: string | null;
  username: string;
  avatarUri?: string;
}

const effects: Array<{
  key: string;
  name: string;
  description: string;
  icon: string;
  premium: boolean;
  minTier?: 'plus' | 'pro';
  colors: string[];
}> = [
  {
    key: 'none',
    name: 'Aucun',
    description: 'Profil standard sans effet',
    icon: 'remove-circle-outline',
    premium: false,
    colors: ['#666666', '#999999'],
  },
  {
    key: 'flow',
    name: 'Flux animé',
    description: 'Dégradé multicolore en mouvement',
    icon: 'sync',
    premium: true,
    minTier: 'plus',
    colors: ['#ff006e', '#ffbe0b', '#06ffa5', '#3a86ff', '#c084fc'],
  },
  {
    key: 'rainbow',
    name: 'Arc-en-ciel',
    description: 'Dégradé multicolore animé',
    icon: 'color-palette',
    premium: true,
    minTier: 'plus',
    colors: ['#ff0000', '#ff8000', '#ffff00', '#00ff00', '#0080ff', '#8000ff'],
  },
  {
    key: 'galaxy',
    name: 'Galaxie',
    description: 'Effet spatial violet avec particules',
    icon: 'planet',
    premium: true,
    minTier: 'plus',
    colors: ['#1a0033', '#4d0099', '#8000ff', '#b300ff'],
  },
  {
    key: 'fire',
    name: 'Feu',
    description: 'Flammes orange et rouge ardentes',
    icon: 'flame',
    premium: true,
    minTier: 'plus',
    colors: ['#ff4500', '#ff6b00', '#ff8c00', '#ffa500'],
  },
  {
    key: 'ocean',
    name: 'Océan',
    description: 'Vagues bleues apaisantes',
    icon: 'water',
    premium: true,
    minTier: 'plus',
    colors: ['#001a33', '#003366', '#0066cc', '#0099ff'],
  },
  {
    key: 'aurora',
    name: 'Aurore',
    description: 'Lueurs vertes mystiques',
    icon: 'flash',
    premium: true,
    minTier: 'pro',
    colors: ['#00ff80', '#40ff80', '#80ff80', '#80ffbf'],
  },
  {
    key: 'cosmic',
    name: 'Cosmique',
    description: 'Énergie violette de l\'espace',
    icon: 'nuclear',
    premium: true,
    minTier: 'pro',
    colors: ['#0d0d26', '#1a1a4d', '#2d2d73', '#4040a6'],
  },
  {
    key: 'diamond',
    name: 'Diamant',
    description: 'Éclat cristallin blanc pur',
    icon: 'diamond',
    premium: true,
    minTier: 'pro',
    colors: ['#ffffff', '#e6e6ff', '#ccccff', '#b3b3ff'],
  },
  {
    key: 'ember',
    name: 'Braise',
    description: 'Contour chaud rouille & ambre',
    icon: 'flame-outline',
    premium: true,
    minTier: 'plus',
    colors: ['#7f1d1d', '#ea580c', '#fcd34d'],
  },
  {
    key: 'mint',
    name: 'Verte',
    description: 'Anneau menthe & jade',
    icon: 'leaf-outline',
    premium: true,
    minTier: 'plus',
    colors: ['#064e3b', '#14b8a6', '#99f6e4'],
  },
  {
    key: 'lavender',
    name: 'Mauve',
    description: 'Violet doux & lilas',
    icon: 'color-filter-outline',
    premium: true,
    minTier: 'plus',
    colors: ['#4c1d95', '#a78bfa', '#f5d0fe'],
  },
  {
    key: 'noir',
    name: 'Chrome',
    description: 'Gris métal & blanc',
    icon: 'contrast-outline',
    premium: true,
    minTier: 'plus',
    colors: ['#171717', '#525252', '#d4d4d4'],
  },
  {
    key: 'gold',
    name: 'Or brut',
    description: 'Doré profond & sable',
    icon: 'sunny-outline',
    premium: true,
    minTier: 'plus',
    colors: ['#78350f', '#eab308', '#fef08a'],
  },
  {
    key: 'sunset',
    name: 'Crépuscule',
    description: 'Rose corail & pêche',
    icon: 'partly-sunny-outline',
    premium: true,
    minTier: 'plus',
    colors: ['#be123c', '#fb7185', '#fdba74'],
  },
  {
    key: 'ice',
    name: 'Glace',
    description: 'Bleu polair & blanc',
    icon: 'snow-outline',
    premium: true,
    minTier: 'pro',
    colors: ['#0c4a6e', '#38bdf8', '#e0f2fe'],
  },
];

function effectAllowed(userTier: SubscriptionTier, effect: (typeof effects)[number]): boolean {
  if (!effect.premium) return true;
  const req = effect.minTier || 'plus';
  return canUseFeature(userTier, req);
}

export default function PremiumEffectSelector({
  currentEffect,
  onEffectChange,
  isPremium,
  subscriptionTier,
  username,
  avatarUri,
}: PremiumEffectSelectorProps) {
  const [showPreview, setShowPreview] = useState(false);
  const [previewEffect, setPreviewEffect] = useState('flow');

  const userTier = effectiveSubscriptionTier(!!isPremium, subscriptionTier);

  const handleEffectSelect = async (effectKey: string) => {
    const selectedEffect = effects.find(e => e.key === effectKey);
    
    if (!selectedEffect) return;

    if (!effectAllowed(userTier, selectedEffect)) {
      const needPro = selectedEffect.minTier === 'pro';
      Alert.alert(
        needPro ? 'Palier Pro' : 'Palier Plus',
        needPro
          ? `« ${selectedEffect.name} » : réservé au Pro.`
          : `« ${selectedEffect.name} » : inclus avec Plus.`,
        [{ text: 'OK', style: 'cancel' }]
      );
      return;
    }

    try {
      await AsyncStorage.setItem('selectedProfileEffect', effectKey);
      onEffectChange(effectKey);
      
      Alert.alert('Effet enregistré', `« ${selectedEffect.name} » est actif sur ton profil.`, [{ text: 'OK' }]);
    } catch (error) {
      console.error('Erreur lors de la sauvegarde de l\'effet:', error);
      Alert.alert('❌ Erreur', 'Impossible de sauvegarder l\'effet sélectionné.');
    }
  };

  const showEffectPreview = (effectKey: string) => {
    setPreviewEffect(effectKey);
    setShowPreview(true);
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Ionicons name="sparkles" size={24} color="#ff6b6b" />
        <Text style={styles.headerTitle}>Contours profil</Text>
      </View>
      
      <Text style={styles.description}>
        {userTier !== 'free'
          ? 'Choisis un contour pour ta photo de profil.'
          : 'Plus ou Pro pour débloquer les contours.'}
      </Text>

      <ScrollView 
        horizontal 
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.effectsContainer}
      >
        {effects.map((effect) => {
          const isSelected = currentEffect === effect.key;
          const canUse = effectAllowed(userTier, effect);
          
          return (
            <TouchableOpacity
              key={effect.key}
              style={[
                styles.effectCard,
                isSelected && styles.selectedCard,
                !canUse && styles.lockedCard,
              ]}
              onPress={() => handleEffectSelect(effect.key)}
              onLongPress={() => showEffectPreview(effect.key)}
              activeOpacity={0.7}
            >
              {/* Badge Premium */}
              {effect.premium && (
                <View style={[styles.premiumBadge, { backgroundColor: canUse ? '#2f3336' : '#1a1a1a' }]}>
                  <Ionicons
                    name={effect.minTier === 'pro' ? 'star' : 'diamond'}
                    size={11}
                    color={canUse ? (effect.minTier === 'pro' ? '#FFC107' : '#f97316') : '#536471'}
                  />
                </View>
              )}

              {/* Aperçu de l'effet */}
              <View style={styles.effectPreview}>
                <PremiumProfileEffects
                  effectType={effect.key as any}
                  isPremium={true}
                  subscriptionTier={userTier}
                  size={60}
                >
                  <Avatar size={60 - PREMIUM_PROFILE_RING * 2} username="Preview" uri={null} />
                </PremiumProfileEffects>
              </View>

              {/* Informations */}
              <Text style={[styles.effectName, !canUse && styles.lockedText]}>
                {effect.name}
              </Text>
              
              <Text style={[styles.effectDescription, !canUse && styles.lockedText]}>
                {effect.description}
              </Text>

              {/* Indicateur de sélection */}
              {isSelected && (
                <View style={styles.selectedIndicator}>
                  <Ionicons name="checkmark-circle" size={20} color="#4F7CFF" />
                  <Text style={styles.selectedText}>Actif</Text>
                </View>
              )}

              {/* Indicateur verrouillé */}
              {!canUse && (
                <View style={styles.lockedIndicator}>
                  <Ionicons name="lock-closed" size={20} color="#666666" />
                </View>
              )}
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* Aperçu en grand */}
      <Modal
        visible={showPreview}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowPreview(false)}
      >
        <View style={styles.previewModal}>
          <TouchableOpacity
            style={styles.previewBackdrop}
            onPress={() => setShowPreview(false)}
          />
          
          <View style={styles.previewContainer}>
            <Text style={styles.previewTitle}>Aperçu de l'effet</Text>
            
            <View style={styles.previewContent}>
              <PremiumProfileEffects
                effectType={previewEffect as any}
                isPremium={true}
                subscriptionTier={userTier}
                size={120}
              >
                <Avatar size={120 - PREMIUM_PROFILE_RING * 2} username={username} uri={avatarUri} />
              </PremiumProfileEffects>
            </View>

            <Text style={styles.previewEffectName}>
              {effects.find(e => e.key === previewEffect)?.name}
            </Text>
            
            <Text style={styles.previewEffectDescription}>
              {effects.find(e => e.key === previewEffect)?.description}
            </Text>

            <TouchableOpacity
              style={styles.previewCloseButton}
              onPress={() => setShowPreview(false)}
            >
              <Text style={styles.previewCloseText}>Fermer</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 15,
    padding: 20,
    marginVertical: 15,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700', fontFamily: fonts.bold,
    color: '#ffffff',
    marginLeft: 10,
  },
  description: {
    fontSize: 14,
    color: '#9BA1AC',
    marginBottom: 20,
    lineHeight: 20,
  },
  effectsContainer: {
    paddingHorizontal: 5,
  },
  effectCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 15,
    padding: 15,
    marginHorizontal: 5,
    width: 140,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    position: 'relative',
  },
  selectedCard: {
    borderColor: '#4F7CFF',
    backgroundColor: 'rgba(0, 212, 255, 0.15)',
  },
  lockedCard: {
    opacity: 0.6,
    borderColor: 'rgba(102, 102, 102, 0.3)',
  },
  premiumBadge: {
    position: 'absolute',
    top: -6,
    right: -6,
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  effectPreview: {
    marginBottom: 15,
  },
  effectName: {
    fontSize: 14,
    fontWeight: '600', fontFamily: fonts.semibold,
    color: '#ffffff',
    textAlign: 'center',
    marginBottom: 5,
  },
  effectDescription: {
    fontSize: 11,
    color: '#9BA1AC',
    textAlign: 'center',
    lineHeight: 14,
    marginBottom: 10,
  },
  lockedText: {
    color: '#666666',
  },
  selectedIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 5,
  },
  selectedText: {
    fontSize: 12,
    fontWeight: '600', fontFamily: fonts.semibold,
    color: '#4F7CFF',
    marginLeft: 5,
  },
  lockedIndicator: {
    marginTop: 5,
  },
  previewModal: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewBackdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  previewContainer: {
    backgroundColor: 'rgba(16,18,25,0.98)',
    borderRadius: 20,
    padding: 30,
    alignItems: 'center',
    maxWidth: 300,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  previewTitle: {
    fontSize: 18,
    fontWeight: '700', fontFamily: fonts.bold,
    color: '#ffffff',
    marginBottom: 20,
  },
  previewContent: {
    marginBottom: 20,
  },
  previewEffectName: {
    fontSize: 16,
    fontWeight: '600', fontFamily: fonts.semibold,
    color: '#ffffff',
    marginBottom: 5,
  },
  previewEffectDescription: {
    fontSize: 14,
    color: '#9BA1AC',
    textAlign: 'center',
    marginBottom: 20,
    lineHeight: 18,
  },
  previewCloseButton: {
    backgroundColor: '#4F7CFF',
    paddingHorizontal: 25,
    paddingVertical: 10,
    borderRadius: 20,
  },
  previewCloseText: {
    color: '#ffffff',
    fontWeight: '600', fontFamily: fonts.semibold,
    fontSize: 14,
  },
});
