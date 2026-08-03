import { fonts } from '../theme';
import { ScreenBackground, BackButton } from '../components/ui';
import { useHeaderMetrics } from '../hooks/useHeaderMetrics';
/**
 * Écran pour changer le style de certification
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  ActivityIndicator,
  StatusBar,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import VerifiedBadge from '../components/VerifiedBadge';
import VerificationStyleService, { VerificationStyle } from '../services/verificationStyleService';
import { useAuth } from '../contexts/AuthContext';

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    // paddingTop réel posé à l'appel (useHeaderMetrics), pas une valeur devinée.
    paddingBottom: 16,
    backgroundColor: 'transparent',
    borderBottomWidth: 1,
    borderBottomColor: '#23262D',
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(79, 124, 255, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(79, 124, 255, 0.25)',
  },
  headerTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: '700', fontFamily: fonts.bold,
    color: '#ffffff',
    textAlign: 'center',
    marginHorizontal: 16,
  },
  content: {
    flex: 1,
    padding: 16,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600', fontFamily: fonts.semibold,
    color: '#ffffff',
    marginBottom: 12,
  },
  styleCard: {
    backgroundColor: 'rgba(255,255,255,0.09)',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#23262D',
  },
  styleHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  styleBadge: {
    marginRight: 12,
  },
  styleInfo: {
    flex: 1,
  },
  styleName: {
    fontSize: 16,
    fontWeight: '600', fontFamily: fonts.semibold,
    color: '#ffffff',
    marginBottom: 4,
  },
  styleDescription: {
    fontSize: 14,
    color: '#9BA1AC',
    lineHeight: 20,
  },
  styleButton: {
    marginTop: 12,
    borderRadius: 8,
    overflow: 'hidden',
  },
  styleButtonGradient: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  styleButtonText: {
    color: '#ffffff',
    fontWeight: '600', fontFamily: fonts.semibold,
    marginLeft: 8,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: '#9BA1AC',
    marginTop: 12,
  },
  lockOverlay: {
    position: 'absolute',
    top: -2,
    right: -2,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    borderRadius: 8,
    padding: 2,
    borderWidth: 1,
    borderColor: '#444',
  },
});

export default function VerificationStyleScreen() {
  const navigation = useNavigation();
  const { top: headerTopInset } = useHeaderMetrics();
  const { user } = useAuth();
  const [currentStyle, setCurrentStyle] = useState<VerificationStyle>('default');
  const [loading, setLoading] = useState(true);
  const [changing, setChanging] = useState(false);
  const [canUseRoseStyle, setCanUseRoseStyle] = useState(false);
  const [canUseGrayStyle, setCanUseGrayStyle] = useState(false);
  const [canUseGoldStyle, setCanUseGoldStyle] = useState(false);

  useEffect(() => {
    loadCurrentStyle();
  }, []);

  const loadCurrentStyle = async () => {
    try {
      setLoading(true);
      const style = await VerificationStyleService.getUserVerificationStyle(user?.id || '');
      setCurrentStyle(style);
      
      // Vérifier si l'utilisateur peut utiliser le style rose
      const canUseRose = await VerificationStyleService.canUseStyle(user?.id || '', 'rose');
      setCanUseRoseStyle(canUseRose);
      
      // Vérifier si l'utilisateur peut utiliser le style gris
      const canUseGray = await VerificationStyleService.canUseStyle(user?.id || '', 'gray');
      setCanUseGrayStyle(canUseGray);
      
      // Vérifier si l'utilisateur peut utiliser le style or
      const canUseGold = await VerificationStyleService.canUseStyle(user?.id || '', 'gold');
      setCanUseGoldStyle(canUseGold);
    } catch (error) {
      console.error('Erreur lors du chargement du style:', error);
    } finally {
      setLoading(false);
    }
  };

  const changeStyle = async (newStyle: VerificationStyle) => {
    if (newStyle === currentStyle) return;

    try {
      setChanging(true);
      const success = await VerificationStyleService.changeUserVerificationStyle(
        user?.id || '',
        newStyle
      );

      if (success) {
        setCurrentStyle(newStyle);
        Alert.alert(
          'Style changé !',
          `Votre style de certification a été changé en ${newStyle === 'rose' ? 'rose' : newStyle === 'gray' ? 'gris' : newStyle === 'gold' ? 'or' : 'bleu'}.`,
          [{ text: 'OK' }]
        );
      } else {
        Alert.alert(
          'Erreur',
          'Impossible de changer le style de certification.',
          [{ text: 'OK' }]
        );
      }
    } catch (error) {
      console.error('Erreur lors du changement de style:', error);
      Alert.alert(
        'Erreur',
        'Une erreur est survenue lors du changement de style.',
        [{ text: 'OK' }]
      );
    } finally {
      setChanging(false);
    }
  };

  const canUseRose = async () => {
    try {
      return await VerificationStyleService.canUseStyle(user?.id || '', 'rose');
    } catch (error) {
      return false;
    }
  };

  if (loading) {
    return (
      <ScreenBackground>
        <View style={styles.container}>
          <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#4F7CFF" />
            <Text style={styles.loadingText}>Chargement des styles...</Text>
          </View>
        </View>
      </ScreenBackground>
    );
  }

  return (
    <ScreenBackground>
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />

      {/* En-tête */}
      <View style={[styles.header, { paddingTop: headerTopInset }]}>
        <BackButton navigation={navigation} />
        <Text style={styles.headerTitle}>Style de Certification</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Contenu */}
      <ScrollView style={styles.content}>
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Styles disponibles</Text>
          
          {/* Style par défaut */}
          <View style={styles.styleCard}>
            <View style={styles.styleHeader}>
              <View style={styles.styleBadge}>
                <VerifiedBadge
                  verificationStyle="default"
                  size={32}
                  animated={true}
                />
              </View>
              <View style={styles.styleInfo}>
                <Text style={styles.styleName}>Badge Vérifié Standard</Text>
                <Text style={styles.styleDescription}>
                  Style par défaut en bleu, disponible pour tous les comptes vérifiés
                </Text>
              </View>
            </View>
            
            {currentStyle === 'default' ? (
              <View style={styles.styleButton}>
                <LinearGradient
                  colors={['#4F7CFF', '#3D63D9']}
                  style={styles.styleButtonGradient}
                >
                  <Ionicons name="checkmark" size={20} color="white" />
                  <Text style={styles.styleButtonText}>Style actuel</Text>
                </LinearGradient>
              </View>
            ) : (
              <TouchableOpacity
                style={styles.styleButton}
                onPress={() => changeStyle('default')}
                disabled={changing}
              >
                <LinearGradient
                  colors={['#657786', '#5a6b7a']}
                  style={styles.styleButtonGradient}
                >
                  <Ionicons name="swap-horizontal" size={20} color="white" />
                  <Text style={styles.styleButtonText}>
                    {changing ? 'Changement...' : 'Utiliser ce style'}
                  </Text>
                </LinearGradient>
              </TouchableOpacity>
            )}
          </View>

          {/* Style rose */}
          <View style={styles.styleCard}>
            <View style={styles.styleHeader}>
              <View style={styles.styleBadge}>
                <VerifiedBadge
                  verificationStyle="rose"
                  size={32}
                  animated={true}
                />
                {!canUseRoseStyle && (
                  <View style={styles.lockOverlay}>
                    <Ionicons name="lock-closed" size={12} color="#888" />
                  </View>
                )}
              </View>
              <View style={styles.styleInfo}>
                <Text style={styles.styleName}>Badge Vérifié Rose</Text>
                <Text style={styles.styleDescription}>
                  Style ultra rare en rose, disponible uniquement pour les participants ayant complété tous les défis de l'événement Kospor Birthday
                </Text>
              </View>
            </View>
            
            {currentStyle === 'rose' ? (
              <View style={styles.styleButton}>
                <LinearGradient
                  colors={['#FF69B4', '#FF1493']}
                  style={styles.styleButtonGradient}
                >
                  <Ionicons name="checkmark" size={20} color="white" />
                  <Text style={styles.styleButtonText}>Style actuel</Text>
                </LinearGradient>
              </View>
            ) : !canUseRoseStyle ? (
              <View style={styles.styleButton}>
                <LinearGradient
                  colors={['#4a4a4a', '#3a3a3a']}
                  style={styles.styleButtonGradient}
                >
                  <Ionicons name="lock-closed" size={20} color="#888" />
                  <Text style={[styles.styleButtonText, { color: '#888' }]}>
                    Verrouillé
                  </Text>
                </LinearGradient>
              </View>
            ) : (
              <TouchableOpacity
                style={styles.styleButton}
                onPress={() => changeStyle('rose')}
                disabled={changing}
              >
                <LinearGradient
                  colors={['#657786', '#5a6b7a']}
                  style={styles.styleButtonGradient}
                >
                  <Ionicons name="swap-horizontal" size={20} color="white" />
                  <Text style={styles.styleButtonText}>
                    {changing ? 'Changement...' : 'Utiliser ce style'}
                  </Text>
                </LinearGradient>
              </TouchableOpacity>
            )}
          </View>

          {/* Style gris */}
          <View style={styles.styleCard}>
            <View style={styles.styleHeader}>
              <View style={styles.styleBadge}>
                <VerifiedBadge
                  verificationStyle="gray"
                  size={32}
                  animated={true}
                />
                {!canUseGrayStyle && (
                  <View style={styles.lockOverlay}>
                    <Ionicons name="lock-closed" size={12} color="#888" />
                  </View>
                )}
              </View>
              <View style={styles.styleInfo}>
                <Text style={styles.styleName}>Badge Vérifié Gris</Text>
                <Text style={styles.styleDescription}>
                  Style ultra rare en gris, disponible uniquement pour les utilisateurs possédant l'item "Badge Verifie Gris" dans leur inventaire
                </Text>
              </View>
            </View>
            
            {currentStyle === 'gray' ? (
              <View style={styles.styleButton}>
                <LinearGradient
                  colors={['#808080', '#696969']}
                  style={styles.styleButtonGradient}
                >
                  <Ionicons name="checkmark" size={20} color="white" />
                  <Text style={styles.styleButtonText}>Style actuel</Text>
                </LinearGradient>
              </View>
            ) : !canUseGrayStyle ? (
              <View style={styles.styleButton}>
                <LinearGradient
                  colors={['#4a4a4a', '#3a3a3a']}
                  style={styles.styleButtonGradient}
                >
                  <Ionicons name="lock-closed" size={20} color="#888" />
                  <Text style={[styles.styleButtonText, { color: '#888' }]}>
                    Verrouillé
                  </Text>
                </LinearGradient>
              </View>
            ) : (
              <TouchableOpacity
                style={styles.styleButton}
                onPress={() => changeStyle('gray')}
                disabled={changing}
              >
                <LinearGradient
                  colors={['#657786', '#5a6b7a']}
                  style={styles.styleButtonGradient}
                >
                  <Ionicons name="swap-horizontal" size={20} color="white" />
                  <Text style={styles.styleButtonText}>
                    {changing ? 'Changement...' : 'Utiliser ce style'}
                  </Text>
                </LinearGradient>
              </TouchableOpacity>
            )}
          </View>

          {/* Style or */}
          <View style={styles.styleCard}>
            <View style={styles.styleHeader}>
              <View style={styles.styleBadge}>
                <VerifiedBadge
                  verificationStyle="gold"
                  size={32}
                  animated={true}
                />
                {!canUseGoldStyle && (
                  <View style={styles.lockOverlay}>
                    <Ionicons name="lock-closed" size={12} color="#888" />
                  </View>
                )}
              </View>
              <View style={styles.styleInfo}>
                <Text style={styles.styleName}>Badge Vérifié Or</Text>
                <Text style={styles.styleDescription}>
                  Style légendaire en or, disponible uniquement pour les utilisateurs possédant l'item "Badge Verifie Or" dans leur inventaire
                </Text>
              </View>
            </View>
            
            {currentStyle === 'gold' ? (
              <View style={styles.styleButton}>
                <LinearGradient
                  colors={['#FFD700', '#FFA500']}
                  style={styles.styleButtonGradient}
                >
                  <Ionicons name="checkmark" size={20} color="white" />
                  <Text style={styles.styleButtonText}>Style actuel</Text>
                </LinearGradient>
              </View>
            ) : !canUseGoldStyle ? (
              <View style={styles.styleButton}>
                <LinearGradient
                  colors={['#4a4a4a', '#3a3a3a']}
                  style={styles.styleButtonGradient}
                >
                  <Ionicons name="lock-closed" size={20} color="#888" />
                  <Text style={[styles.styleButtonText, { color: '#888' }]}>
                    Verrouillé
                  </Text>
                </LinearGradient>
              </View>
            ) : (
              <TouchableOpacity
                style={styles.styleButton}
                onPress={() => changeStyle('gold')}
                disabled={changing}
              >
                <LinearGradient
                  colors={['#657786', '#5a6b7a']}
                  style={styles.styleButtonGradient}
                >
                  <Ionicons name="swap-horizontal" size={20} color="white" />
                  <Text style={styles.styleButtonText}>
                    {changing ? 'Changement...' : 'Utiliser ce style'}
                  </Text>
                </LinearGradient>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </ScrollView>
    </View>
    </ScreenBackground>
  );
}
