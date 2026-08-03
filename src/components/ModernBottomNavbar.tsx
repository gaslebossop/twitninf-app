import { fonts } from '../theme';
import React from 'react';
import {
  View,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  Text,
  Platform,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { RootStackParamList } from '../navigation/AppNavigator';

const { width } = Dimensions.get('window');

type NavigationProp = StackNavigationProp<RootStackParamList>;

interface ModernBottomNavbarProps {
  activeTab: 'tweets' | 'search' | 'notifications' | 'messages' | 'profile';
  showLabels?: boolean;
  variant?: 'compact' | 'full';
}

export default function ModernBottomNavbar({ 
  activeTab, 
  showLabels = true, 
  variant = 'full' 
}: ModernBottomNavbarProps) {
  const navigation = useNavigation<NavigationProp>();

  const navigateToTweets = () => {
    navigation.navigate('Tweets');
  };

  const navigateToProfile = () => {
    navigation.navigate('Profile');
  };

  const navigateToSearch = () => {
    console.log('Navigation vers la recherche');
  };

  const navigateToNotifications = () => {
    console.log('Navigation vers les notifications');
  };

  const navigateToMessages = () => {
    console.log('Navigation vers les messages');
  };

  const getTabConfig = (tabName: string) => {
    const configs = {
      tweets: {
        icon: activeTab === 'tweets' ? 'home' : 'home-outline',
        label: 'Accueil',
        onPress: navigateToTweets,
      },
      search: {
        icon: activeTab === 'search' ? 'search' : 'search-outline',
        label: 'Rechercher',
        onPress: navigateToSearch,
      },
      notifications: {
        icon: activeTab === 'notifications' ? 'notifications' : 'notifications-outline',
        label: 'Notifications',
        onPress: navigateToNotifications,
      },
      messages: {
        icon: activeTab === 'messages' ? 'mail' : 'mail-outline',
        label: 'Messages',
        onPress: navigateToMessages,
      },
      profile: {
        icon: activeTab === 'profile' ? 'person' : 'person-outline',
        label: 'Profil',
        onPress: navigateToProfile,
      },
    };
    return configs[tabName as keyof typeof configs];
  };

  const isCompact = variant === 'compact';
  const height = isCompact ? 70 : 85;
  const iconSize = isCompact ? 22 : 24;
  const fontSize = isCompact ? 10 : 11;

  return (
    <View style={[styles.container, { height }]}>
      {/* Fond avec effet de flou Twitter-like */}
      <BlurView intensity={65} style={styles.background} />
      
      {/* Bordure supérieure subtile */}
      <View style={styles.topBorder} />
      
      {/* Contenu de la navigation */}
      <View style={styles.content}>
        {/* Onglet Accueil */}
        <TouchableOpacity
          style={[styles.tab, activeTab === 'tweets' && styles.activeTab]}
          onPress={getTabConfig('tweets').onPress}
          activeOpacity={0.7}
        >
          <View style={styles.tabContent}>
            <Ionicons
              name={getTabConfig('tweets').icon as any}
              size={iconSize}
              color={activeTab === 'tweets' ? '#4F7CFF' : '#9BA1AC'}
              style={styles.tabIcon}
            />
            {showLabels && (
              <Text 
                style={[
                  styles.tabLabel,
                  { fontSize },
                  activeTab === 'tweets' && styles.activeTabLabel
                ]}
                numberOfLines={1}
              >
                {getTabConfig('tweets').label}
              </Text>
            )}
          </View>
        </TouchableOpacity>

        {/* Onglet Rechercher */}
        <TouchableOpacity
          style={[styles.tab, activeTab === 'search' && styles.activeTab]}
          onPress={getTabConfig('search').onPress}
          activeOpacity={0.7}
        >
          <View style={styles.tabContent}>
            <Ionicons
              name={getTabConfig('search').icon as any}
              size={iconSize}
              color={activeTab === 'search' ? '#4F7CFF' : '#9BA1AC'}
              style={styles.tabIcon}
            />
            {showLabels && (
              <Text 
                style={[
                  styles.tabLabel,
                  { fontSize },
                  activeTab === 'search' && styles.activeTabLabel
                ]}
                numberOfLines={1}
              >
                {getTabConfig('search').label}
              </Text>
            )}
          </View>
        </TouchableOpacity>

        {/* Onglet Notifications */}
        <TouchableOpacity
          style={[styles.tab, activeTab === 'notifications' && styles.activeTab]}
          onPress={getTabConfig('notifications').onPress}
          activeOpacity={0.7}
        >
          <View style={styles.tabContent}>
            <Ionicons
              name={getTabConfig('notifications').icon as any}
              size={iconSize}
              color={activeTab === 'notifications' ? '#4F7CFF' : '#9BA1AC'}
              style={styles.tabIcon}
            />
            {showLabels && (
              <Text 
                style={[
                  styles.tabLabel,
                  { fontSize },
                  activeTab === 'notifications' && styles.activeTabLabel
                ]}
                numberOfLines={1}
              >
                {getTabConfig('notifications').label}
              </Text>
            )}
          </View>
        </TouchableOpacity>

        {/* Onglet Messages */}
        <TouchableOpacity
          style={[styles.tab, activeTab === 'messages' && styles.activeTab]}
          onPress={getTabConfig('messages').onPress}
          activeOpacity={0.7}
        >
          <View style={styles.tabContent}>
            <Ionicons
              name={getTabConfig('messages').icon as any}
              size={iconSize}
              color={activeTab === 'messages' ? '#4F7CFF' : '#9BA1AC'}
              style={styles.tabIcon}
            />
            {showLabels && (
              <Text 
                style={[
                  styles.tabLabel,
                  { fontSize },
                  activeTab === 'messages' && styles.activeTabLabel
                ]}
                numberOfLines={1}
              >
                {getTabConfig('messages').label}
              </Text>
            )}
          </View>
        </TouchableOpacity>

        {/* Onglet Profil */}
        <TouchableOpacity
          style={[styles.tab, activeTab === 'profile' && styles.activeTab]}
          onPress={getTabConfig('profile').onPress}
          activeOpacity={0.7}
        >
          <View style={styles.tabContent}>
            <Ionicons
              name={getTabConfig('profile').icon as any}
              size={iconSize}
              color={activeTab === 'profile' ? '#4F7CFF' : '#9BA1AC'}
              style={styles.tabIcon}
            />
            {showLabels && (
              <Text 
                style={[
                  styles.tabLabel,
                  { fontSize },
                  activeTab === 'profile' && styles.activeTabLabel
                ]}
                numberOfLines={1}
              >
                {getTabConfig('profile').label}
              </Text>
            )}
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
    zIndex: 1000,
    paddingBottom: Platform.OS === 'ios' ? 20 : 16,
  },
  background: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(10, 10, 26, 0.88)',
  },
  topBorder: {
    height: 0.5,
    width: '100%',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
  },
  content: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    paddingHorizontal: 12,
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
    fontWeight: '500', fontFamily: fonts.medium,
    color: '#9BA1AC',
    letterSpacing: 0.1,
    textAlign: 'center',
    maxWidth: '100%',
  },
  activeTabLabel: {
    color: '#4F7CFF',
    fontWeight: '600', fontFamily: fonts.semibold,
  },
});
