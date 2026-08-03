import { fonts } from '../theme';
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Alert,
} from 'react-native';
import { apiService } from '../services';
import { Tweet, Notification, User } from '../types/api';
import VerifiedBadge from './VerifiedBadge';

interface ApiTestComponentProps {
  onClose?: () => void;
}

export const ApiTestComponent: React.FC<ApiTestComponentProps> = ({ onClose }) => {
  const [tweets, setTweets] = useState<Tweet[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [searchResults, setSearchResults] = useState<{ users: User[]; tweets: Tweet[] }>({ users: [], tweets: [] });
  const [loading, setLoading] = useState(false);
  const [testResults, setTestResults] = useState<string[]>([]);

  const addTestResult = (result: string) => {
    setTestResults(prev => [...prev, `${new Date().toLocaleTimeString()}: ${result}`]);
  };

  const clearResults = () => {
    setTestResults([]);
  };

  // Test des tweets
  const testTweets = async () => {
    try {
      setLoading(true);
      addTestResult('🧪 Test des tweets...');
      
      // Récupérer les tweets
      const tweetsResponse = await apiService.getTweets({ limit: 5 });
      if (tweetsResponse.success && tweetsResponse.data) {
        setTweets(tweetsResponse.data.tweets);
        addTestResult(`✅ ${tweetsResponse.data.tweets.length} tweets récupérés`);
      } else {
        addTestResult(`❌ Erreur: ${tweetsResponse.message}`);
      }
    } catch (error) {
      addTestResult(`❌ Erreur: ${error instanceof Error ? error.message : 'Erreur inconnue'}`);
    } finally {
      setLoading(false);
    }
  };

  // Test des notifications
  const testNotifications = async () => {
    try {
      setLoading(true);
      addTestResult('🔔 Test des notifications...');
      
      // Récupérer les notifications
      const notificationsResponse = await apiService.getNotifications({ limit: 5 });
      if (notificationsResponse.success && notificationsResponse.data) {
        setNotifications(notificationsResponse.data.notifications);
        addTestResult(`✅ ${notificationsResponse.data.notifications.length} notifications récupérées`);
      } else {
        addTestResult(`❌ Erreur: ${notificationsResponse.message}`);
      }
    } catch (error) {
      addTestResult(`❌ Erreur: ${error instanceof Error ? error.message : 'Erreur inconnue'}`);
    } finally {
      setLoading(false);
    }
  };

  // Test de la recherche
  const testSearch = async () => {
    try {
      setLoading(true);
      addTestResult('🔍 Test de la recherche...');
      
      // Recherche globale
      const searchResponse = await apiService.search({ q: 'test', limit: 5 });
      if (searchResponse.success && searchResponse.data) {
        setSearchResults({
          users: searchResponse.data.results.users,
          tweets: searchResponse.data.results.tweets,
        });
        addTestResult(`✅ Recherche effectuée: ${searchResponse.data.results.users.length} utilisateurs, ${searchResponse.data.results.tweets.length} tweets`);
      } else {
        addTestResult(`❌ Erreur: ${searchResponse.message}`);
      }
    } catch (error) {
      addTestResult(`❌ Erreur: ${error instanceof Error ? error.message : 'Erreur inconnue'}`);
    } finally {
      setLoading(false);
    }
  };

  // Test des hashtags tendance
  const testTrending = async () => {
    try {
      setLoading(true);
      addTestResult('🔥 Test des hashtags tendance...');
      
      const trendingResponse = await apiService.getTrendingHashtags({ limit: 10, period: '24h' });
      if (trendingResponse.success && trendingResponse.data) {
        addTestResult(`✅ ${trendingResponse.data.hashtags.length} hashtags tendance récupérés`);
      } else {
        addTestResult(`❌ Erreur: ${trendingResponse.message}`);
      }
    } catch (error) {
      addTestResult(`❌ Erreur: ${error instanceof Error ? error.message : 'Erreur inconnue'}`);
    } finally {
      setLoading(false);
    }
  };

  // Test complet
  const runAllTests = async () => {
    clearResults();
    addTestResult('🚀 Démarrage des tests complets...');
    
    await testTweets();
    await testNotifications();
    await testSearch();
    await testTrending();
    
    addTestResult('🎉 Tous les tests terminés !');
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>🧪 Tests API</Text>
        {onClose && (
          <TouchableOpacity onPress={onClose} style={styles.closeButton}>
            <Text style={styles.closeButtonText}>✕</Text>
          </TouchableOpacity>
        )}
      </View>

      <ScrollView style={styles.content}>
        {/* Boutons de test */}
        <View style={styles.testButtons}>
          <TouchableOpacity 
            style={[styles.testButton, loading && styles.disabledButton]} 
            onPress={runAllTests}
            disabled={loading}
          >
            <Text style={styles.testButtonText}>🚀 Tous les tests</Text>
          </TouchableOpacity>
          
          <TouchableOpacity 
            style={[styles.testButton, loading && styles.disabledButton]} 
            onPress={testTweets}
            disabled={loading}
          >
            <Text style={styles.testButtonText}>🐦 Test Tweets</Text>
          </TouchableOpacity>
          
          <TouchableOpacity 
            style={[styles.testButton, loading && styles.disabledButton]} 
            onPress={testNotifications}
            disabled={loading}
          >
            <Text style={styles.testButtonText}>🔔 Test Notifications</Text>
          </TouchableOpacity>
          
          <TouchableOpacity 
            style={[styles.testButton, loading && styles.disabledButton]} 
            onPress={testSearch}
            disabled={loading}
          >
            <Text style={styles.testButtonText}>🔍 Test Recherche</Text>
          </TouchableOpacity>
          
          <TouchableOpacity 
            style={[styles.testButton, loading && styles.disabledButton]} 
            onPress={testTrending}
            disabled={loading}
          >
            <Text style={styles.testButtonText}>🔥 Test Trending</Text>
          </TouchableOpacity>
        </View>

        {/* Résultats des tests */}
        <View style={styles.resultsSection}>
          <View style={styles.resultsHeader}>
            <Text style={styles.resultsTitle}>📊 Résultats des tests</Text>
            <TouchableOpacity onPress={clearResults} style={styles.clearButton}>
              <Text style={styles.clearButtonText}>🗑️</Text>
            </TouchableOpacity>
          </View>
          
          <ScrollView style={styles.resultsList}>
            {testResults.map((result, index) => (
              <Text key={index} style={styles.resultItem}>
                {result}
              </Text>
            ))}
          </ScrollView>
        </View>

        {/* Données récupérées */}
        {tweets.length > 0 && (
          <View style={styles.dataSection}>
            <Text style={styles.sectionTitle}>🐦 Tweets ({tweets.length})</Text>
            {tweets.map((tweet, index) => (
              <View key={tweet.id || index} style={styles.tweetItem}>
                <Text style={styles.tweetAuthor}>@{tweet.author?.username || 'Unknown'}</Text>
                <Text style={styles.tweetContent}>{tweet.content}</Text>
              </View>
            ))}
          </View>
        )}

        {notifications.length > 0 && (
          <View style={styles.dataSection}>
            <Text style={styles.sectionTitle}>🔔 Notifications ({notifications.length})</Text>
            {notifications.map((notification, index) => (
              <View key={notification.id || index} style={styles.notificationItem}>
                <Text style={styles.notificationType}>{notification.type}</Text>
                <Text style={styles.notificationMessage}>{notification.message}</Text>
              </View>
            ))}
          </View>
        )}

        {(searchResults.users.length > 0 || searchResults.tweets.length > 0) && (
          <View style={styles.dataSection}>
            <Text style={styles.sectionTitle}>🔍 Résultats de recherche</Text>
            {searchResults.users.length > 0 && (
              <View style={styles.searchSubsection}>
                <Text style={styles.subsectionTitle}>👥 Utilisateurs ({searchResults.users.length})</Text>
                {searchResults.users.map((user, index) => (
                  <View key={user.id || index} style={styles.userItem}>
                    <View style={styles.userInfo}>
                      <Text style={styles.userName}>@{user.username}</Text>
                      <Text style={styles.userFullName}>{user.full_name}</Text>
                      {user.verified && (
                        <View style={{ marginLeft: 6 }}>
                          <VerifiedBadge 
                            verificationStyle={(user.verification_style as any) || 'default'}
                            size={16} 
                            animated={true}
                          />
                        </View>
                      )}
                    </View>
                  </View>
                ))}
              </View>
            )}
            {searchResults.tweets.length > 0 && (
              <View style={styles.searchSubsection}>
                <Text style={styles.subsectionTitle}>🐦 Tweets ({searchResults.tweets.length})</Text>
                {searchResults.tweets.map((tweet, index) => (
                  <View key={tweet.id || index} style={styles.tweetItem}>
                    <Text style={styles.tweetAuthor}>@{tweet.author?.username || 'Unknown'}</Text>
                    <Text style={styles.tweetContent}>{tweet.content}</Text>
                  </View>
                ))}
              </View>
            )}
          </View>
        )}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    paddingTop: 60,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold', fontFamily: fonts.bold,
    color: '#ffffff',
  },
  closeButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeButtonText: {
    color: '#ffffff',
    fontSize: 16,
  },
  content: {
    flex: 1,
    padding: 20,
  },
  testButtons: {
    marginBottom: 20,
  },
  testButton: {
    backgroundColor: '#4F7CFF',
    padding: 15,
    borderRadius: 10,
    marginBottom: 10,
    alignItems: 'center',
  },
  testButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600', fontFamily: fonts.semibold,
  },
  disabledButton: {
    opacity: 0.5,
  },
  resultsSection: {
    marginBottom: 20,
  },
  resultsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  resultsTitle: {
    fontSize: 18,
    fontWeight: 'bold', fontFamily: fonts.bold,
    color: '#ffffff',
  },
  clearButton: {
    padding: 5,
  },
  clearButtonText: {
    color: '#ffffff',
    fontSize: 16,
  },
  resultsList: {
    maxHeight: 200,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 10,
    padding: 15,
  },
  resultItem: {
    color: '#ffffff',
    fontSize: 14,
    marginBottom: 5,
    fontFamily: 'monospace',
  },
  userItem: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    padding: 15,
    borderRadius: 10,
    marginBottom: 10,
  },
  userInfo: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  userName: {
    color: '#4F7CFF',
    fontSize: 14,
    fontWeight: '600', fontFamily: fonts.semibold,
    marginRight: 8,
  },
  userFullName: {
    color: '#ffffff',
    fontSize: 14,
    flex: 1,
  },
  dataSection: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold', fontFamily: fonts.bold,
    color: '#ffffff',
    marginBottom: 10,
  },
  searchSubsection: {
    marginBottom: 15,
  },
  subsectionTitle: {
    fontSize: 16,
    fontWeight: '600', fontFamily: fonts.semibold,
    color: '#ffffff',
    marginBottom: 8,
  },
  tweetItem: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    padding: 15,
    borderRadius: 10,
    marginBottom: 10,
  },
  tweetAuthor: {
    color: '#4F7CFF',
    fontSize: 14,
    fontWeight: '600', fontFamily: fonts.semibold,
    marginBottom: 5,
  },
  tweetContent: {
    color: '#ffffff',
    fontSize: 14,
  },
  notificationItem: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    padding: 15,
    borderRadius: 10,
    marginBottom: 10,
  },
  notificationType: {
    color: '#4F7CFF',
    fontSize: 14,
    fontWeight: '600', fontFamily: fonts.semibold,
    marginBottom: 5,
  },
  notificationMessage: {
    color: '#ffffff',
    fontSize: 14,
  },
});

export default ApiTestComponent;
