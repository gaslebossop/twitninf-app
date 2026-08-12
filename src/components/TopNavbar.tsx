import { fonts , colors} from '../theme';
import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  Dimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';

const { width } = Dimensions.get('window');

interface TopNavbarProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
  onSearchPress: () => void;
  onSettingsPress: () => void;
}

export default function TopNavbar({
  activeTab,
  onTabChange,
  onSearchPress,
  onSettingsPress,
}: TopNavbarProps) {
  return (
    <View style={styles.container}>
      {/* Fond avec effet de flou et gradient */}
      <BlurView intensity={25} style={styles.background} />
      <LinearGradient
        colors={['rgba(10, 10, 26, 0.98)', 'rgba(26, 26, 58, 0.95)', 'rgba(42, 42, 74, 0.92)']}
        style={styles.gradientBackground}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      />
      
      {/* Bordure inférieure avec gradient */}
      <LinearGradient
        colors={['rgba(79, 124, 255, 0.2)', 'rgba(79, 124, 255, 0.08)', 'transparent']}
        style={styles.bottomBorder}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
      />
      
      <SafeAreaView style={styles.content}>
        {/* Barre supérieure avec logo et actions */}
        <View style={styles.topBar}>
          {/* Logo et titre */}
          <View style={styles.logoSection}>
            <LinearGradient
              colors={['#4F7CFF', '#3D63D9']}
              style={styles.logoContainer}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
            >
              <Ionicons name="flash" size={22} color="#ffffff" />
            </LinearGradient>
            <Text style={styles.appTitle}>TwitNin</Text>
          </View>
          
          {/* Boutons d'action */}
          <View style={styles.actionButtons}>
            <TouchableOpacity style={styles.actionButton} onPress={onSearchPress}>
              <BlurView intensity={30} style={styles.actionButtonBlur}>
                <Ionicons name="search" size={18} color="#9BA1AC" />
              </BlurView>
            </TouchableOpacity>
            
            <TouchableOpacity style={styles.actionButton} onPress={onSettingsPress}>
              <BlurView intensity={30} style={styles.actionButtonBlur}>
                <Ionicons name="settings-outline" size={18} color="#9BA1AC" />
              </BlurView>
            </TouchableOpacity>
          </View>
        </View>
        
        {/* Onglets de navigation */}
        <View style={styles.tabsSection}>
          <View style={styles.tabsContainer}>
            <TouchableOpacity
              style={[styles.tab, activeTab === 'for-you' && styles.activeTab]}
              onPress={() => onTabChange('for-you')}
            >
              <Text style={[styles.tabText, activeTab === 'for-you' && styles.activeTabText]}>
                Pour vous
              </Text>
              {activeTab === 'for-you' && (
                <View style={styles.activeIndicator} />
              )}
            </TouchableOpacity>
            
            <TouchableOpacity
              style={[styles.tab, activeTab === 'following' && styles.activeTab]}
              onPress={() => onTabChange('following')}
            >
              <Text style={[styles.tabText, activeTab === 'following' && styles.activeTabText]}>
                Abonnements
              </Text>
              {activeTab === 'following' && (
                <View style={styles.activeIndicator} />
              )}
            </TouchableOpacity>
          </View>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'relative',
    zIndex: 100,
  },
  background: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(10, 10, 26, 0.85)',
  },
  gradientBackground: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  bottomBorder: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 1,
  },
  content: {
    paddingHorizontal: 16,
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    marginBottom: 16,
  },
  logoSection: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  logoContainer: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
    borderWidth: 1,
    borderColor: colors.overlayStrong,
    shadowColor: '#4F7CFF',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 4,
  },
  appTitle: {
    fontSize: 22,
    fontWeight: '800', fontFamily: fonts.bold,
    color: '#ffffff',
    letterSpacing: 0.5,
  },
  actionButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  actionButton: {
    borderRadius: 18,
    overflow: 'hidden',
  },
  actionButtonBlur: {
    padding: 10,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.overlayMedium,
  },
  tabsSection: {
    marginBottom: 8,
  },
  tabsContainer: {
    flexDirection: 'row',
    backgroundColor: colors.overlaySoft,
    borderRadius: 14,
    padding: 6,
    borderWidth: 1,
    borderColor: colors.overlaySoft,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  tab: {
    flex: 1,
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 10,
    alignItems: 'center',
    position: 'relative',
  },
  activeTab: {
    backgroundColor: 'rgba(79, 124, 255, 0.12)',
  },
  tabText: {
    fontSize: 15,
    fontWeight: '600', fontFamily: fonts.semibold,
    color: '#9BA1AC',
    letterSpacing: 0.2,
  },
  activeTabText: {
    color: '#4F7CFF',
    fontWeight: '700', fontFamily: fonts.bold,
  },
  activeIndicator: {
    position: 'absolute',
    bottom: 0,
    left: '50%',
    marginLeft: -16,
    width: 32,
    height: 3,
    backgroundColor: '#4F7CFF',
    borderRadius: 1.5,
    shadowColor: '#4F7CFF',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 4,
  },
});
