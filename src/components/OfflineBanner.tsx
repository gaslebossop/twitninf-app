import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { colors, fonts, withAlpha } from '../theme';

/**
 * Bandeau d'état du mode hors ligne.
 *
 * Il n'apparaît que quand il a quelque chose à dire — réseau coupé, ou tweets
 * encore en attente d'envoi. Un indicateur permanent « en ligne » n'apprend
 * rien : c'est l'état normal, et l'afficher userait le seul endroit où
 * l'utilisateur doit regarder quand quelque chose cloche.
 */

interface OfflineBannerProps {
  /** Le mode est-il ouvert à ce compte ? (Pro) */
  enabled: boolean;
  online: boolean;
  /** Tweets en attente de publication. */
  pendingCount: number;
  /** Likes, retweets et réponses en attente d'envoi. */
  pendingActionCount?: number;
}

export default function OfflineBanner({
  enabled,
  online,
  pendingCount,
  pendingActionCount = 0,
}: OfflineBannerProps) {
  const queued = pendingCount + pendingActionCount;
  const visible = enabled && (!online || queued > 0);
  const enter = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(enter, {
      toValue: visible ? 1 : 0,
      duration: 220,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [visible, enter]);

  if (!visible) return null;

  const offline = !online;

  return (
    <Animated.View
      style={[
        styles.wrap,
        offline ? styles.wrapOffline : styles.wrapPending,
        {
          opacity: enter,
          transform: [
            { translateY: enter.interpolate({ inputRange: [0, 1], outputRange: [-14, 0] }) },
          ],
        },
      ]}
    >
      <Ionicons
        name={offline ? 'cloud-offline-outline' : 'cloud-upload-outline'}
        size={14}
        color={offline ? colors.warning : colors.cyan}
      />
      <Text style={styles.text} numberOfLines={1}>
        {offline
          ? queued > 0
            ? `Hors ligne · ${queued} ${queued > 1 ? 'actions partiront' : 'action partira'} au retour du réseau`
            : 'Hors ligne · tu lis les derniers tweets enregistrés'
          : `Envoi de ${queued} ${queued > 1 ? 'actions' : 'action'} en attente…`}
      </Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  wrapOffline: {
    backgroundColor: withAlpha(colors.warning, 0.12),
    borderBottomColor: withAlpha(colors.warning, 0.3),
  },
  wrapPending: {
    backgroundColor: withAlpha(colors.cyan, 0.1),
    borderBottomColor: withAlpha(colors.cyan, 0.28),
  },
  text: {
    flex: 1,
    fontSize: 11.5,
    fontFamily: fonts.medium,
    color: colors.textSecondary,
  },
});
