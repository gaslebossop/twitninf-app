import { fonts } from '../theme';
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Animated,
  ActivityIndicator,
  Dimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { apiService } from '../services';
import { UserSuggestion } from '../types/api';
import Avatar from './Avatar';
import VerifiedBadge from './VerifiedBadge';
import PremiumDisplayName from './PremiumDisplayName';
import { certifiedNameColors, type ProfileCustomization } from '../services/profileCustomizationService';
import { formatCompactCount } from '../utils/format';

const { width: WINDOW_WIDTH } = Dimensions.get('window');
const CARD_WIDTH = WINDOW_WIDTH * 0.72;

export default function UserSuggestions() {
  const navigation = useNavigation();
  const [suggestions, setSuggestions] = useState<UserSuggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [followingMap, setFollowingMap] = useState<{ [key: string]: boolean }>({});
  const [followLoading, setFollowLoading] = useState<{ [key: string]: boolean }>({});

  useEffect(() => {
    fetchSuggestions();
  }, []);

  const fetchSuggestions = async () => {
    try {
      setLoading(true);
      const response = await apiService.getUserSuggestions(10);
      if (response.success && Array.isArray(response.data)) {
        setSuggestions(response.data);
      }
    } catch (error) {
      console.error('[UserSuggestions] Error fetching suggestions:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleFollow = async (userId: string) => {
    if (followLoading[userId]) return;

    setFollowLoading(prev => ({ ...prev, [userId]: true }));
    try {
      const isFollowing = followingMap[userId];
      if (isFollowing) {
        const res = await apiService.unfollowUser(userId);
        if (res.success) {
          setFollowingMap(prev => ({ ...prev, [userId]: false }));
        }
      } else {
        const res = await apiService.followUser(userId);
        if (res.success) {
          setFollowingMap(prev => ({ ...prev, [userId]: true }));
        }
      }
    } catch (error) {
      console.error('[UserSuggestions] Error toggling follow:', error);
    } finally {
      setFollowLoading(prev => ({ ...prev, [userId]: false }));
    }
  };

  if (loading && suggestions.length === 0) {
    return (
      <View style={S.loadingContainer}>
        <ActivityIndicator size="small" color="#4F7CFF" />
      </View>
    );
  }

  if (!loading && suggestions.length === 0) {
    return null;
  }

  return (
    <View style={S.container}>
      <View style={S.header}>
        <View style={S.titleRow}>
          <Text style={S.title}>Suggestions</Text>
        </View>
        <TouchableOpacity onPress={fetchSuggestions}>
          <Text style={S.seeAll}>Actualiser</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={S.scrollContent}
        decelerationRate="fast"
        snapToInterval={CARD_WIDTH + 12}
      >
        {suggestions.map((user, index) => (
          <TouchableOpacity
            key={user.id}
            activeOpacity={0.9}
            onPress={() => (navigation as any).navigate('UserProfile', { userId: user.id, username: user.username })}
            style={S.card}
          >
            <LinearGradient
              colors={['rgba(255,255,255,0.09)', 'rgba(255,255,255,0.02)']}
              style={S.cardGradient}
            >
              <View style={S.cardHeader}>
                <Avatar size={54} username={user.username} uri={user.avatar} />
                <View style={S.userInfo}>
                  <View style={S.nameRow}>
                    <PremiumDisplayName
                      text={user.full_name}
                      baseStyle={S.fullName}
                      isPremium={!!(user as any)?.premium}
                      subscriptionTierRaw={(user as any)?.subscription_tier}
                      fontId="system"
                      effectId="none"
                      numberOfLines={1}
                      customization={(user as any)?.profile_customization as ProfileCustomization | undefined}
                      verified={!!user.verified}
                      verificationStyle={user.verification_style as any}
                    />
                    {user.verified && (
                      <VerifiedBadge
                        verificationStyle={user.verification_style as any}
                        size={14}
                        tint={
                          certifiedNameColors(
                            user.verification_style as any,
                            (user as any)?.profile_customization as ProfileCustomization | undefined,
                          ).from
                        }
                      />
                    )}
                  </View>
                  <Text style={S.username} numberOfLines={1}>@{user.username}</Text>
                </View>
              </View>

              {user.bio ? (
                <Text style={S.bio} numberOfLines={2}>{user.bio}</Text>
              ) : (
                <View style={S.bioPlaceholder} />
              )}

              <View style={S.reasonsContainer}>
                {user.suggestion_reasons.slice(0, 2).map((reason, i) => (
                  <View key={i} style={S.reasonPill}>
                    <Ionicons 
                        name={reason.includes('intérêt') ? 'sparkles' : (reason.includes('publications') ? 'heart' : 'people')} 
                        size={10} 
                        color="#4F7CFF" 
                    />
                    <Text style={S.reasonText}>{reason}</Text>
                  </View>
                ))}
              </View>

              <View style={S.footer}>
                <View style={S.statsContainer}>
                  <Text style={S.statsNum}>{formatCompactCount(user.followers_count)}</Text>
                  <Text style={S.statsLabel}> abonnés</Text>
                </View>

                <TouchableOpacity
                  style={[
                    S.followBtn,
                    followingMap[user.id] && S.followingBtn
                  ]}
                  onPress={() => handleFollow(user.id)}
                  disabled={followLoading[user.id]}
                >
                  {followLoading[user.id] ? (
                    <ActivityIndicator size="small" color={followingMap[user.id] ? "#71767b" : "#000"} />
                  ) : (
                    <Text style={[
                      S.followBtnText,
                      followingMap[user.id] && S.followingBtnText
                    ]}>
                      {followingMap[user.id] ? 'Suivi' : 'Suivre'}
                    </Text>
                  )}
                </TouchableOpacity>
              </View>
            </LinearGradient>
          </TouchableOpacity>
        ))}
        
        {/* Card finale "Voir plus" */}
        <TouchableOpacity 
          style={[S.card, S.moreCard]}
          onPress={() => (navigation as any).navigate('Search', { focus: 'users' })}
        >
           <Ionicons name="add-circle-outline" size={40} color="#71767b" />
           <Text style={S.moreText}>Voir plus</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const S = StyleSheet.create({
  container: {
    marginVertical: 12,
    backgroundColor: 'rgba(29, 155, 240, 0.03)',
    paddingVertical: 16,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: 'rgba(47, 51, 54, 0.5)',
  },
  loadingContainer: {
    height: 180,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    marginBottom: 14,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  titleIconGradient: {
    width: 28,
    height: 28,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontSize: 17,
    fontWeight: '800', fontFamily: fonts.bold,
    color: '#e7e9ea',
    letterSpacing: 0.3,
  },
  seeAll: {
    fontSize: 14,
    color: '#4F7CFF',
    fontWeight: '600', fontFamily: fonts.semibold,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingBottom: 4,
    gap: 12,
  },
  card: {
    width: CARD_WIDTH,
    height: 190,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.09)',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  cardGradient: {
    flex: 1,
    padding: 16,
    justifyContent: 'space-between',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  userInfo: {
    flex: 1,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  fullName: {
    fontSize: 16,
    fontWeight: '700', fontFamily: fonts.bold,
    color: '#e7e9ea',
  },
  username: {
    fontSize: 14,
    color: '#71767b',
    marginTop: 1,
  },
  bio: {
    fontSize: 13,
    color: '#71767b',
    marginTop: 10,
    lineHeight: 18,
  },
  bioPlaceholder: {
    height: 18,
    marginTop: 10,
  },
  reasonsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 8,
  },
  reasonPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(29, 155, 240, 0.1)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    gap: 4,
  },
  reasonText: {
    fontSize: 10,
    color: '#4F7CFF',
    fontWeight: '600', fontFamily: fonts.semibold,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 12,
  },
  statsContainer: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  statsNum: {
    fontSize: 14,
    fontWeight: '700', fontFamily: fonts.bold,
    color: '#e7e9ea',
  },
  statsLabel: {
    fontSize: 12,
    color: '#71767b',
  },
  followBtn: {
    backgroundColor: '#eff3f4',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    minWidth: 90,
    alignItems: 'center',
  },
  followingBtn: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: '#536471',
  },
  followBtnText: {
    color: '#0B0C0F',
    fontSize: 14,
    fontWeight: '700', fontFamily: fonts.bold,
  },
  followingBtnText: {
    color: '#e7e9ea',
  },
  moreCard: {
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.02)',
    borderStyle: 'dashed',
    borderColor: '#2f3336',
  },
  moreText: {
    color: '#71767b',
    fontSize: 14,
    fontWeight: '600', fontFamily: fonts.semibold,
    marginTop: 8,
  }
});
