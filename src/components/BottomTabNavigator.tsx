import { fonts , colors} from '../theme';
import React from 'react';
import {
  View,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  Text,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';

const { width } = Dimensions.get('window');

type NavigationProp = any;

interface BottomTabNavigatorProps {
  activeTab: 'tweets' | 'profile';
}

export default function BottomTabNavigator({ activeTab }: BottomTabNavigatorProps) {
  const navigation = useNavigation<NavigationProp>();

  const navigateToTweets = () => {
    navigation.navigate('Tweets');
  };

  const navigateToProfile = () => {
    navigation.navigate('Profile');
  };

  return (
    <View style={styles.container}>
      {/* Fond avec effet de flou Twitter-like */}
      <BlurView intensity={60} style={styles.background} />
      
      {/* Bordure supérieure subtile */}
      <View style={styles.topBorder} />
      
      {/* Contenu de la navigation */}
      <View style={styles.content}>
        {/* Onglet Tweets */}
        <TouchableOpacity
          style={[styles.tab, activeTab === 'tweets' && styles.activeTab]}
          onPress={navigateToTweets}
        >
          <View style={styles.tabContent}>
            <Ionicons
              name={activeTab === 'tweets' ? 'home' : 'home-outline'}
              size={24}
              color={activeTab === 'tweets' ? '#4F7CFF' : '#9BA1AC'}
              style={styles.tabIcon}
            />
            <Text style={[
              styles.tabLabel,
              activeTab === 'tweets' && styles.activeTabLabel
            ]}>
              Accueil
            </Text>
          </View>
        </TouchableOpacity>

        {/* Onglet Profil */}
        <TouchableOpacity
          style={[styles.tab, activeTab === 'profile' && styles.activeTab]}
          onPress={navigateToProfile}
        >
          <View style={styles.tabContent}>
            <Ionicons
              name={activeTab === 'profile' ? 'person' : 'person-outline'}
              size={24}
              color={activeTab === 'profile' ? '#4F7CFF' : '#9BA1AC'}
              style={styles.tabIcon}
            />
            <Text style={[
              styles.tabLabel,
              activeTab === 'profile' && styles.activeTabLabel
            ]}>
              Profil
            </Text>
          </View>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 85,
    paddingBottom: 20,
    zIndex: 1000,
  },
  background: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(10, 10, 26, 0.85)',
  },
  topBorder: {
    height: 0.5,
    width: '100%',
    backgroundColor: colors.overlayMedium,
  },
  content: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    minHeight: 50,
  },
  activeTab: {
    // L'onglet actif est mis en évidence par l'icône et le label
  },
  tabContent: {
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
  },
  tabIcon: {
    marginBottom: 4,
  },
  tabLabel: {
    fontSize: 12,
    fontWeight: '500', fontFamily: fonts.medium,
    color: '#9BA1AC',
    letterSpacing: 0.1,
    textAlign: 'center',
  },
  activeTabLabel: {
    color: '#4F7CFF',
    fontWeight: '600', fontFamily: fonts.semibold,
  },
});
