import React, { useCallback, useEffect, useState } from 'react';
import { Image, StyleProp, StyleSheet, Text, TouchableOpacity, View, ViewStyle } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import Avatar from './Avatar';
import { colors, fonts } from '../theme';
import apiService from '../services/api';
import type { Tweet } from '../types/api';

interface SpotlightBannerProps {
  /** Incrémenter cette valeur force un rechargement (pull-to-refresh du fil). */
  refreshSignal?: number;
  onOpenTweet?: (tweetId: string) => void;
  style?: StyleProp<ViewStyle>;
}

function fmtCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1000).toFixed(1)}k`;
  return String(n || 0);
}

// ── Filet ondulé du bord gauche ──────────────────────────────────────────────
// Un seul trait, une seule couleur, amplitude constante : c'est un motif, pas
// une illustration. Le SVG est plus haut que le bloc et débordé/rogné par le
// conteneur, ce qui évite d'avoir à mesurer la hauteur réelle du contenu.
const RAIL_W = 16;
const AXIS_X = RAIL_W / 2;
const AMPLITUDE = 4.5;
const HALF_PERIOD = 22;
const RAIL_H = 400;

/** Sinusoïde verticale : chaque demi-période est une cubique, alternée gauche/droite. */
function buildWavePath(): string {
  const c = AMPLITUDE * 1.32; // poignée de Bézier ≈ sinusoïde
  let d = `M${AXIS_X},0`;
  for (let i = 0; i * HALF_PERIOD < RAIL_H; i++) {
    const dir = i % 2 === 0 ? 1 : -1;
    const y0 = i * HALF_PERIOD;
    d += ` C${AXIS_X + c * dir},${y0 + HALF_PERIOD * 0.33} ${AXIS_X + c * dir},${y0 + HALF_PERIOD * 0.67} ${AXIS_X},${y0 + HALF_PERIOD}`;
  }
  return d;
}

const WAVE_PATH = buildWavePath();

/**
 * Spotlight : le tweet le plus liké d'hier, posé dans le fil comme une ligne
 * à part entière (après les stories), signé par un filet ondulé sur son bord
 * gauche plutôt que par un cadre ou un fond plein.
 */
export default function SpotlightBanner({ refreshSignal = 0, onOpenTweet, style }: SpotlightBannerProps) {
  const [tweet, setTweet] = useState<Tweet | null>(null);
  const [likeCount, setLikeCount] = useState(0);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const response = await apiService.getSpotlight();
      if (response.success && response.data) {
        setTweet(response.data.tweet);
        setLikeCount(response.data.like_count);
      } else {
        setTweet(null);
      }
    } catch {
      setTweet(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load, refreshSignal]);

  if (loading || !tweet) return null;

  const author = tweet.author;
  const previewImage = tweet.media_urls?.[0];

  return (
    <TouchableOpacity
      activeOpacity={0.9}
      style={[styles.section, style]}
      onPress={() => onOpenTweet?.(tweet.id)}
    >
      <View style={styles.rail} pointerEvents="none">
        <Svg width={RAIL_W} height={RAIL_H} viewBox={`0 0 ${RAIL_W} ${RAIL_H}`}>
          <Path
            d={WAVE_PATH}
            stroke={colors.accent}
            strokeWidth={2.5}
            strokeLinecap="round"
            fill="none"
          />
        </Svg>
      </View>

      {/* Épinglé : l'emoji plutôt qu'une icône vectorielle, c'est le signe que
          tout le monde lit immédiatement comme « post épinglé ». */}
      <Text style={styles.pin} pointerEvents="none">📌</Text>

      <View style={styles.content}>
        <View style={styles.header}>
          <Ionicons name="sparkles" size={13} color={colors.accent} />
          <Text style={styles.label}>Post du jour</Text>
        </View>

        <View style={styles.body}>
          <Avatar size={42} uri={author?.avatar} username={author?.username} />
          <View style={styles.textColumn}>
            <Text style={styles.author} numberOfLines={1}>
              {author?.full_name || author?.username || 'twitninf'}
            </Text>
            <Text style={styles.tweetContent} numberOfLines={2}>
              {tweet.content}
            </Text>
          </View>
          {previewImage ? (
            <Image source={{ uri: previewImage }} style={styles.thumbnail} />
          ) : null}
        </View>

        <View style={styles.footer}>
          <Ionicons name="heart" size={12} color={colors.like} />
          <Text style={styles.likeCount}>{fmtCount(likeCount)} likes hier</Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  section: {
    flexDirection: 'row',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    overflow: 'hidden',
  },
  // Hors du flux : le SVG est volontairement plus haut que le bloc, s'il
  // participait à la mise en page il imposerait ses 400 px à toute la ligne.
  rail: {
    position: 'absolute',
    left: 8,
    top: 0,
    bottom: 0,
    width: RAIL_W,
    overflow: 'hidden',
  },
  pin: {
    position: 'absolute',
    right: 14,
    top: 12,
    fontSize: 16,
  },
  content: {
    flex: 1,
    paddingRight: 16,
    paddingLeft: 34,
    paddingTop: 14,
    paddingBottom: 12,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 9,
  },
  label: {
    color: colors.accent,
    fontFamily: fonts.semibold,
    fontSize: 12,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  body: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  textColumn: {
    flex: 1,
  },
  author: {
    color: colors.textPrimary,
    fontFamily: fonts.heading,
    fontSize: 14.5,
    marginBottom: 3,
  },
  tweetContent: {
    color: colors.textSecondary,
    fontFamily: fonts.regular,
    fontSize: 13,
    lineHeight: 18,
  },
  thumbnail: {
    width: 54,
    height: 54,
    borderRadius: 10,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 11,
  },
  likeCount: {
    color: colors.textMuted,
    fontFamily: fonts.medium,
    fontSize: 12,
  },
});
