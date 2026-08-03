import React from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  RefreshControl,
} from 'react-native';
import ConnectedLayout from './ConnectedLayout';

interface ConnectedPageProps {
  children: React.ReactNode;
  activeTab?: 'tweets' | 'search' | 'notifications' | 'trading' | 'profile';
  showNavbar?: boolean;
  backgroundColor?: string;
  scrollable?: boolean;
  refreshControl?: React.ReactElement<React.ComponentProps<typeof RefreshControl>>;
  contentContainerStyle?: any;
}

export default function ConnectedPage({ 
  children, 
  activeTab,
  showNavbar = true,
  backgroundColor = '#0B0C0F',
  scrollable = false,
  refreshControl,
  contentContainerStyle
}: ConnectedPageProps) {
  
  const renderContent = () => {
    if (scrollable) {
      return (
        <ScrollView
          style={styles.scrollContainer}
          contentContainerStyle={[
            styles.scrollContent,
            contentContainerStyle
          ]}
          showsVerticalScrollIndicator={false}
          refreshControl={refreshControl}
        >
          {children}
        </ScrollView>
      );
    }
    
    return (
      <View style={styles.pageContent}>
        {children}
      </View>
    );
  };

  return (
    <ConnectedLayout
      activeTab={activeTab}
      showNavbar={showNavbar}
      backgroundColor={backgroundColor}
    >
      {renderContent()}
    </ConnectedLayout>
  );
}

const styles = StyleSheet.create({
  scrollContainer: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 120, // Espace pour la navbar
  },
  pageContent: {
    flex: 1,
    paddingBottom: 120, // Espace pour la navbar
  },
});
