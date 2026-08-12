import React from 'react';
import {
  View,
  StyleSheet,
  SafeAreaView,
  StatusBar,
} from 'react-native';
import { useRoute } from '@react-navigation/native';
import UnifiedBottomNavbar from './UnifiedBottomNavbar';
import { statusBarStyle } from '../theme';

interface ConnectedLayoutProps {
  children: React.ReactNode;
  activeTab?: 'tweets' | 'search' | 'notifications' | 'trading' | 'profile';
  showNavbar?: boolean;
  backgroundColor?: string;
}

export default function ConnectedLayout({ 
  children, 
  activeTab = 'tweets',
  showNavbar = true,
  backgroundColor = '#0B0C0F'
}: ConnectedLayoutProps) {
  const route = useRoute();
  
  // Pages qui ne doivent PAS avoir la navbar
  const excludedPages = [
    'Intro',
    'Login', 
    'Register',
    'ForgotPassword',
    'Carousel',
    'Onboarding'
  ];
  
  // Détermine automatiquement si la navbar doit être affichée
  const shouldShowNavbar = showNavbar && !excludedPages.includes(route.name);
  
  // Détermine automatiquement l'onglet actif basé sur la route
  const getActiveTab = (): 'tweets' | 'search' | 'notifications' | 'trading' | 'profile' => {
    if (activeTab) return activeTab;
    
    const routeName = route.name;
    switch (routeName) {
      case 'Tweets':
        return 'tweets';
      case 'Profile':
        return 'profile';
      case 'Search':
        return 'search';
      case 'Notifications':
        return 'notifications';
      case 'Trading':
        return 'trading';
      default:
        return 'tweets';
    }
  };

  return (
    <View style={[styles.container, { backgroundColor }]}>
      <StatusBar barStyle={statusBarStyle()} backgroundColor={backgroundColor} />
      
      {/* Contenu principal */}
      <View style={styles.content}>
        {children}
      </View>
      
      {/* Navbar automatique si nécessaire */}
      {shouldShowNavbar && (
        <UnifiedBottomNavbar 
          activeTab={getActiveTab()} 
          variant="full" 
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
  },
});
