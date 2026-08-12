import { fonts , colors, statusBarStyle} from '../theme';
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  SafeAreaView,
  StatusBar,
  Dimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { BackButton } from '../components/ui';
import { toast } from '../components/ui/Toast';

const { width, height } = Dimensions.get('window');

interface EligibleTweet {
  id: string;
  content: string;
  likes: number;
  rpm?: number;
  eligibleClicks?: number;
  avatar?: string;
}

interface MonetizationScreenProps {
  navigation: any;
}

const MonetizationScreen: React.FC<MonetizationScreenProps> = ({ navigation }) => {
  const [eligibleTweets, setEligibleTweets] = useState<EligibleTweet[]>([
    {
      id: '1',
      content: 'test de contenu de twee...',
      likes: 129000,
      rpm: undefined,
      eligibleClicks: undefined,
    }
  ]);

  const formatNumber = (num: number): string => {
    if (num >= 1000000) {
      return `${(num / 1000000).toFixed(1)}M`;
    } else if (num >= 1000) {
      return `${(num / 1000).toFixed(0)}k`;
    }
    return num.toString();
  };

  const handlePayment = () => {
    toast.info('Paiement', {
      description: 'Fonctionnalité de paiement en cours de développement',
    });
  };

  const handleBack = () => {
    navigation.goBack();
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle={statusBarStyle()} backgroundColor="#0B0C0F" />
      
      {/* Header */}
      <View style={styles.header}>
        <BackButton navigation={navigation} />
        
        <Text style={styles.title}>Monétisation</Text>
        
        <View style={styles.placeholder} />
      </View>

      <ScrollView 
        style={styles.content}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.contentContainer}
      >
        {/* Section Tweets éligibles */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            Tweets éligibles ({eligibleTweets.length}):
          </Text>
          
          {eligibleTweets.map((tweet) => (
            <View key={tweet.id} style={styles.tweetCard}>
              <View style={styles.tweetHeader}>
                <View style={styles.avatarContainer}>
                  <View style={styles.avatar} />
                </View>
                
                <View style={styles.tweetContent}>
                  <Text style={styles.tweetText} numberOfLines={2}>
                    {tweet.content}
                  </Text>
                  
                  <View style={styles.engagementRow}>
                    <View style={styles.likesContainer}>
                      <Ionicons name="heart" size={16} color="#ff6b9d" />
                      <Text style={styles.likesText}>
                        {formatNumber(tweet.likes)}
                      </Text>
                    </View>
                  </View>
                </View>
              </View>
              
              <View style={styles.metricsRow}>
                <View style={styles.metric}>
                  <Text style={styles.metricLabel}>RPM :</Text>
                  <Text style={styles.metricValue}>
                    {tweet.rpm ? `$${tweet.rpm}` : '?'}
                  </Text>
                </View>
                
                <View style={styles.metric}>
                  <Text style={styles.metricLabel}>Clicks eligible :</Text>
                  <Text style={styles.metricValue}>
                    {tweet.eligibleClicks ? tweet.eligibleClicks.toString() : '?'}
                  </Text>
                </View>
              </View>
            </View>
          ))}
        </View>
      </ScrollView>

      {/* Bouton de paiement */}
      <View style={styles.paymentContainer}>
        <TouchableOpacity 
          style={styles.paymentButton}
          onPress={handlePayment}
          activeOpacity={0.8}
        >
          <LinearGradient
            colors={['#4F7CFF', '#8b5cf6']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.gradient}
          >
            <Text style={styles.paymentButtonText}>Paiement</Text>
          </LinearGradient>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: 0.5,
    borderBottomColor: colors.overlayMedium,
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 20,
  },
  title: {
    fontSize: 22,
    fontWeight: '800', fontFamily: fonts.bold,
    color: '#ffffff',
    letterSpacing: -0.5,
  },
  placeholder: {
    width: 40,
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    paddingHorizontal: 16,
    paddingTop: 24,
    paddingBottom: 120,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700', fontFamily: fonts.bold,
    color: '#ffffff',
    marginBottom: 20,
  },
  tweetCard: {
    backgroundColor: '#ffffff',
    borderRadius: 20,
    padding: 20,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  tweetHeader: {
    flexDirection: 'row',
    marginBottom: 20,
  },
  avatarContainer: {
    marginRight: 16,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#e1e8ed',
  },
  tweetContent: {
    flex: 1,
  },
  tweetText: {
    fontSize: 18,
    color: '#14171a',
    lineHeight: 24,
    marginBottom: 12,
    fontWeight: '500', fontFamily: fonts.medium,
  },
  engagementRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  likesContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  likesText: {
    fontSize: 16,
    color: '#657786',
    marginLeft: 6,
    fontWeight: '600', fontFamily: fonts.semibold,
  },
  metricsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#e1e8ed',
  },
  metric: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  metricLabel: {
    fontSize: 16,
    color: '#657786',
    marginRight: 6,
    fontWeight: '500', fontFamily: fonts.medium,
  },
  metricValue: {
    fontSize: 16,
    color: '#14171a',
    fontWeight: '700', fontFamily: fonts.bold,
  },
  paymentContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 16,
    paddingVertical: 24,
    backgroundColor: 'transparent',
    borderTopWidth: 0.5,
    borderTopColor: colors.overlayMedium,
  },
  paymentButton: {
    borderRadius: 28,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  gradient: {
    paddingVertical: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  paymentButtonText: {
    fontSize: 18,
    fontWeight: '800', fontFamily: fonts.bold,
    color: '#ffffff',
    letterSpacing: -0.3,
  },
});

export default MonetizationScreen;
