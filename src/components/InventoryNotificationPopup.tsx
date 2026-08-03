import { fonts } from '../theme';
/**
 * Popup de notification pour l'ajout d'items dans l'inventaire
 */

import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  TouchableOpacity,
  Dimensions,
  SafeAreaView,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';

interface InventoryNotificationPopupProps {
  visible: boolean;
  itemName: string;
  itemDescription?: string;
  itemRarity?: 'common' | 'rare' | 'epic' | 'legendary' | 'ultra_rare';
  onClose: () => void;
  onViewInventory?: () => void;
}

const { width: screenWidth, height: screenHeight } = Dimensions.get('window');

export default function InventoryNotificationPopup({
  visible,
  itemName,
  itemDescription,
  itemRarity = 'common',
  onClose,
  onViewInventory
}: InventoryNotificationPopupProps) {
  const slideAnim = useRef(new Animated.Value(screenHeight)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.8)).current;

  useEffect(() => {
    if (visible) {
      // Animation d'entrée
      Animated.parallel([
        Animated.timing(slideAnim, {
          toValue: 0,
          duration: 300,
          useNativeDriver: true,
        }),
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }),
        Animated.spring(scaleAnim, {
          toValue: 1,
          tension: 100,
          friction: 8,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      // Animation de sortie
      Animated.parallel([
        Animated.timing(slideAnim, {
          toValue: screenHeight,
          duration: 250,
          useNativeDriver: true,
        }),
        Animated.timing(fadeAnim, {
          toValue: 0,
          duration: 250,
          useNativeDriver: true,
        }),
        Animated.timing(scaleAnim, {
          toValue: 0.8,
          duration: 250,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [visible, slideAnim, fadeAnim, scaleAnim]);

  if (!visible) return null;

  const getRarityColors = (rarity: string) => {
    switch (rarity) {
      case 'legendary':
        return {
          primary: '#FFD700',
          secondary: '#FFA500',
          glow: '#FFD700'
        };
      case 'ultra_rare':
        return {
          primary: '#FF69B4',
          secondary: '#FF1493',
          glow: '#FF69B4'
        };
      case 'epic':
        return {
          primary: '#8B5CF6',
          secondary: '#7C3AED',
          glow: '#8B5CF6'
        };
      case 'rare':
        return {
          primary: '#3B82F6',
          secondary: '#1D4ED8',
          glow: '#3B82F6'
        };
      default:
        return {
          primary: '#6B7280',
          secondary: '#4B5563',
          glow: '#6B7280'
        };
    }
  };

  const getRarityLabel = (rarity: string) => {
    switch (rarity) {
      case 'legendary': return 'LÉGENDAIRE';
      case 'ultra_rare': return 'ULTRA RARE';
      case 'epic': return 'ÉPIQUE';
      case 'rare': return 'RARE';
      default: return 'COMMUN';
    }
  };

  const colors = getRarityColors(itemRarity);

  return (
    <View style={styles.overlay}>
      <BlurView intensity={20} style={styles.blur} />
      
      <Animated.View
        style={[
          styles.container,
          {
            transform: [
              { translateY: slideAnim },
              { scale: scaleAnim }
            ],
            opacity: fadeAnim,
          }
        ]}
      >
        <LinearGradient
          colors={[colors.primary, colors.secondary]}
          style={styles.gradientBorder}
        >
          <View style={styles.content}>
            {/* Icône de notification */}
            <View style={styles.iconContainer}>
              <Ionicons 
                name="gift" 
                size={32} 
                color="white"
                style={styles.icon}
              />
            </View>

            {/* Titre */}
            <Text style={styles.title}>Nouvel item reçu !</Text>

            {/* Nom de l'item */}
            <Text style={styles.itemName}>{itemName}</Text>

            {/* Description */}
            {itemDescription && (
              <Text style={styles.description}>{itemDescription}</Text>
            )}

            {/* Rareté */}
            <View style={styles.rarityContainer}>
              <LinearGradient
                colors={[colors.primary, colors.secondary]}
                style={styles.rarityBadge}
              >
                <Text style={styles.rarityText}>
                  {getRarityLabel(itemRarity)}
                </Text>
              </LinearGradient>
            </View>

            {/* Boutons d'action */}
            <View style={styles.buttonContainer}>
              <TouchableOpacity
                style={styles.secondaryButton}
                onPress={onClose}
              >
                <Text style={styles.secondaryButtonText}>Fermer</Text>
              </TouchableOpacity>

              {onViewInventory && (
                <TouchableOpacity
                  style={styles.primaryButton}
                  onPress={onViewInventory}
                >
                  <LinearGradient
                    colors={[colors.primary, colors.secondary]}
                    style={styles.primaryButtonGradient}
                  >
                    <Ionicons name="bag" size={16} color="white" />
                    <Text style={styles.primaryButtonText}>Voir l'inventaire</Text>
                  </LinearGradient>
                </TouchableOpacity>
              )}
            </View>
          </View>
        </LinearGradient>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000,
  },
  blur: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  container: {
    width: screenWidth * 0.85,
    maxWidth: 400,
  },
  gradientBorder: {
    borderRadius: 20,
    padding: 3,
  },
  content: {
    backgroundColor: 'rgba(10, 10, 26, 0.95)',
    borderRadius: 17,
    padding: 24,
    alignItems: 'center',
  },
  iconContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  icon: {
    shadowColor: '#FFFFFF',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 10,
  },
  title: {
    fontSize: 20,
    fontWeight: '700', fontFamily: fonts.bold,
    color: '#FFFFFF',
    textAlign: 'center',
    marginBottom: 8,
  },
  itemName: {
    fontSize: 18,
    fontWeight: '600', fontFamily: fonts.semibold,
    color: '#FFD700',
    textAlign: 'center',
    marginBottom: 8,
  },
  description: {
    fontSize: 14,
    color: '#9BA1AC',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 16,
  },
  rarityContainer: {
    marginBottom: 24,
  },
  rarityBadge: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  rarityText: {
    fontSize: 12,
    fontWeight: '700', fontFamily: fonts.bold,
    color: '#FFFFFF',
    letterSpacing: 1,
  },
  buttonContainer: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
  },
  secondaryButton: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    alignItems: 'center',
  },
  secondaryButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600', fontFamily: fonts.semibold,
  },
  primaryButton: {
    flex: 1,
    borderRadius: 12,
    overflow: 'hidden',
  },
  primaryButtonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 20,
    gap: 8,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600', fontFamily: fonts.semibold,
  },
});
