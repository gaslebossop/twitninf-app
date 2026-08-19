import { fonts } from '../theme';
import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import apiService from '../services/api';
import VerifiedBadge from './VerifiedBadge';
import PremiumDisplayName from './PremiumDisplayName';
import { certifiedNameColors, type ProfileCustomization } from '../services/profileCustomizationService';

interface AdTweetCardProps {
  tweet: {
    id: string;
    content: string;
    created_at: string;
    author: {
      id: string;
      username: string;
      full_name: string;
      avatar?: string;
      verified: boolean;
      verification_style?: string;
      premium?: boolean;
      subscription_tier?: string;
      profile_customization?: ProfileCustomization;
    };
    stats: {
      likes: number;
      retweets: number;
      replies: number;
      views: number;
    };
    is_advertisement: boolean;
    advertisement_id: string;
    advertisement_title: string;
    advertisement_budget: number;
  };
  onLike?: (tweetId: string) => void;
  onRetweet?: (tweetId: string) => void;
  onReply?: (tweetId: string) => void;
  onViewProfile?: (userId: string) => void;
}

export default function AdTweetCard({
  tweet,
  onLike,
  onRetweet,
  onReply,
  onViewProfile,
}: AdTweetCardProps) {
  const [liked, setLiked] = useState(false);
  const [retweeted, setRetweeted] = useState(false);
  const [likesCount, setLikesCount] = useState(tweet.stats.likes);
  const [retweetsCount, setRetweetsCount] = useState(tweet.stats.retweets);

  const handleLike = async () => {
    try {
      if (!liked) {
        // Enregistrer l'engagement publicitaire
        await apiService.post(`/api/ads/advertisements/${tweet.advertisement_id}/engagement`, {
          engagement_type: 'like',
          context: { source: 'feed' }
        });
        
        setLiked(true);
        setLikesCount(prev => prev + 1);
        onLike?.(tweet.id);
      }
    } catch (error) {
      console.error('Erreur lors de l\'enregistrement du like:', error);
    }
  };

  const handleRetweet = async () => {
    try {
      if (!retweeted) {
        // Enregistrer l'engagement publicitaire
        await apiService.post(`/api/ads/advertisements/${tweet.advertisement_id}/engagement`, {
          engagement_type: 'retweet',
          context: { source: 'feed' }
        });
        
        setRetweeted(true);
        setRetweetsCount(prev => prev + 1);
        onRetweet?.(tweet.id);
      }
    } catch (error) {
      console.error('Erreur lors de l\'enregistrement du retweet:', error);
    }
  };

  const handleClick = async () => {
    try {
      // Enregistrer le clic publicitaire
      await apiService.post(`/api/ads/advertisements/${tweet.advertisement_id}/click`, {
        context: { source: 'feed' }
      });
    } catch (error) {
      console.error('Erreur lors de l\'enregistrement du clic:', error);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffInHours = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60));
    
    if (diffInHours < 1) return 'À l\'instant';
    if (diffInHours < 24) return `Il y a ${diffInHours}h`;
    if (diffInHours < 48) return 'Hier';
    return date.toLocaleDateString('fr-FR');
  };

  return (
    <TouchableOpacity
      style={styles.container}
      onPress={handleClick}
      activeOpacity={0.7}
    >
      {/* Indicateur publicitaire */}
      <View style={styles.adIndicator}>
        <View style={styles.adBadge}>
          <Ionicons name="megaphone" size={12} color="white" />
          <Text style={styles.adBadgeText}>PUB</Text>
        </View>
        <Text style={styles.adTitle}>{tweet.advertisement_title}</Text>
        <Text style={styles.adBudget}>{tweet.advertisement_budget} TWC</Text>
      </View>

      {/* Contenu du tweet */}
      <View style={styles.tweetContent}>
        {/* Header avec avatar et infos utilisateur */}
        <View style={styles.tweetHeader}>
          <TouchableOpacity
            style={styles.avatarContainer}
            onPress={() => onViewProfile?.(tweet.author.id)}
          >
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>
                {tweet.author.full_name.charAt(0).toUpperCase()}
              </Text>
            </View>
          </TouchableOpacity>
          
          <View style={styles.userInfo}>
            <View style={styles.userNameRow}>
              <PremiumDisplayName
                text={tweet.author.full_name}
                baseStyle={styles.fullName}
                isPremium={!!(tweet.author as any)?.premium}
                subscriptionTierRaw={(tweet.author as any)?.subscription_tier}
                fontId="system"
                effectId="none"
                numberOfLines={1}
                customization={(tweet.author as any)?.profile_customization as ProfileCustomization | undefined}
                verified={!!tweet.author.verified}
                verificationStyle={(tweet.author.verification_style as any) || 'default'}
              />
              {tweet.author.verified && (
                <View style={{ marginLeft: 6 }}>
                  <VerifiedBadge
                    verificationStyle={(tweet.author.verification_style as any) || 'default'}
                    size={16}
                    tint={
                      certifiedNameColors(
                        (tweet.author.verification_style as any) || 'default',
                        (tweet.author as any)?.profile_customization as ProfileCustomization | undefined,
                      ).from
                    }
                  />
                </View>
              )}
              <Text style={styles.username}>@{tweet.author.username}</Text>
              <Text style={styles.separator}>·</Text>
              <Text style={styles.timestamp}>{formatDate(tweet.created_at)}</Text>
            </View>
          </View>
        </View>

        {/* Contenu du tweet */}
        <Text style={styles.tweetText}>{tweet.content}</Text>

        {/* Actions du tweet */}
        <View style={styles.tweetActions}>
          <TouchableOpacity
            style={styles.actionButton}
            onPress={() => onReply?.(tweet.id)}
          >
            <Ionicons name="chatbubble-outline" size={18} color="#657786" />
            <Text style={styles.actionText}>{tweet.stats.replies}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionButton, retweeted && styles.actionButtonActive]}
            onPress={handleRetweet}
          >
            <Ionicons
              name={retweeted ? "repeat" : "repeat-outline"}
              size={18}
              color={retweeted ? "#17BF63" : "#657786"}
            />
            <Text style={[styles.actionText, retweeted && styles.actionTextActive]}>
              {retweetsCount}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionButton, liked && styles.actionButtonActive]}
            onPress={handleLike}
          >
            <Ionicons
              name={liked ? "heart" : "heart-outline"}
              size={18}
              color={liked ? "#E91E63" : "#657786"}
            />
            <Text style={[styles.actionText, liked && styles.actionTextActive]}>
              {likesCount}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.actionButton}>
            <Ionicons name="share-outline" size={18} color="#657786" />
          </TouchableOpacity>
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: 'white',
    marginHorizontal: 16,
    marginVertical: 8,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
    borderLeftWidth: 4,
    borderLeftColor: '#4F7CFF',
  },
  adIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f0f8ff',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
  },
  adBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#4F7CFF',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    marginRight: 8,
  },
  adBadgeText: {
    color: 'white',
    fontSize: 10,
    fontWeight: 'bold', fontFamily: fonts.bold,
    marginLeft: 2,
  },
  adTitle: {
    flex: 1,
    fontSize: 12,
    fontWeight: '600', fontFamily: fonts.semibold,
    color: '#4F7CFF',
  },
  adBudget: {
    fontSize: 12,
    fontWeight: 'bold', fontFamily: fonts.bold,
    color: '#4F7CFF',
  },
  tweetContent: {
    padding: 16,
  },
  tweetHeader: {
    flexDirection: 'row',
    marginBottom: 12,
  },
  avatarContainer: {
    marginRight: 12,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#4F7CFF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold', fontFamily: fonts.bold,
  },
  userInfo: {
    flex: 1,
  },
  userNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  fullName: {
    fontSize: 16,
    fontWeight: 'bold', fontFamily: fonts.bold,
    color: '#14171a',
    marginRight: 4,
  },
  username: {
    fontSize: 14,
    color: '#657786',
    marginLeft: 4,
  },
  separator: {
    fontSize: 14,
    color: '#657786',
    marginHorizontal: 4,
  },
  timestamp: {
    fontSize: 14,
    color: '#657786',
  },
  tweetText: {
    fontSize: 16,
    color: '#14171a',
    lineHeight: 22,
    marginBottom: 12,
  },
  tweetActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#f1f3f4',
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  actionButtonActive: {
    // Styles pour les actions actives
  },
  actionText: {
    fontSize: 14,
    color: '#657786',
    marginLeft: 4,
  },
  actionTextActive: {
    color: '#4F7CFF',
  },
});
