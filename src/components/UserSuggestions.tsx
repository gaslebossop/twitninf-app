import { colors, fonts, radius } from '../theme';
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Dimensions,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
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
        <ActivityIndicator size="small" color={colors.accent} />
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
            <View style={S.cardBody}>
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
                        color={colors.accent}
                    
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
                    <ActivityIndicator size="small" color={followingMap[user.id] ? colors.textSecondary : colors.onAccent} />
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
            </View>
          </TouchableOpacity>
        ))}
        
        {/*
          La carte « Voir plus » en pointillés vivait ici. Elle naviguait vers
          `Search` — l'écran où ce carrousel est justement affiché, et le seul.
          Un cul-de-sac, avec en prime un style d'espace réservé au milieu de
          cartes pleines. « Actualiser », dans l'en-tête, tire de nouveaux
          comptes et rend le service qu'elle prétendait rendre.
        */}
      </ScrollView>
    </View>
  );
}

/**
 * Styles repris entièrement sur le thème.
 *
 * Ils étaient écrits en hexadécimaux hérités d'une autre application —
 * `#4F7CFF`, `#e7e9ea`, `#71767b`, `#eff3f4`, `rgba(29,155,240,…)` — soit un
 * bleu et des gris qui n'existent nulle part ailleurs dans twitninf. À côté du
 * magenta de marque et du noir neutre du reste de l'écran, le bloc paraissait
 * collé depuis un autre produit. Tout passe par `colors` (voir `theme/colors`,
 * qui interdit explicitement les couleurs en dur).
 */
const S = StyleSheet.create({
  container: {
    marginVertical: 12,
    paddingVertical: 16,
    // Le fond bleuté et les deux bordures pleine largeur encadraient la
    // section comme un encart publicitaire. Une simple hairline haute suffit
    // à la séparer de ce qui précède.
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
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
  title: {
    fontSize: 17,
    fontFamily: fonts.bold,
    color: colors.textPrimary,
    letterSpacing: 0.3,
  },
  seeAll: {
    fontSize: 14,
    color: colors.accent,
    fontFamily: fonts.semibold,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingBottom: 4,
    gap: 12,
  },
  card: {
    width: CARD_WIDTH,
    height: 190,
    borderRadius: radius.xl,
    // Bloc plein et hairline, pas de dégradé ni d'ombre portée : la carte
    // appartient à la page, elle ne flotte pas au-dessus.
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  cardBody: {
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
    fontFamily: fonts.bold,
    color: colors.textPrimary,
  },
  username: {
    fontSize: 14,
    color: colors.textSecondary,
    marginTop: 1,
  },
  bio: {
    fontSize: 13,
    color: colors.textSecondary,
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
    backgroundColor: colors.accentSoft,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.md,
    gap: 4,
  },
  reasonText: {
    fontSize: 10,
    color: colors.accent,
    fontFamily: fonts.semibold,
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
    fontFamily: fonts.bold,
    color: colors.textPrimary,
  },
  statsLabel: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  // Même bouton que celui des résultats de recherche, dans le même écran :
  // il était blanc et arrondi façon X, à côté d'un « Suivre » magenta.
  followBtn: {
    backgroundColor: colors.accent,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: radius.md,
    minWidth: 90,
    alignItems: 'center',
  },
  followingBtn: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: colors.borderStrong,
  },
  followBtnText: {
    color: colors.onAccent,
    fontSize: 14,
    fontFamily: fonts.bold,
  },
  followingBtnText: {
    color: colors.textPrimary,
  },
});
