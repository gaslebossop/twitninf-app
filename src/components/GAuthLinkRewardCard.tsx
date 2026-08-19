import React, { useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { colors, fonts, radius, withAlpha } from '../theme';
import { useAuth } from '../contexts/AuthContext';
import { linkGAuthAccount } from '../services/gAuthLogin';
import { toast } from './ui/Toast';
import {
  effectiveSubscriptionTier,
  isSubscriptionActiveFor,
} from '../utils/subscriptionTier';

/**
 * Carte de bienvenue : associer son compte à G rapporte 5 NF + 3 jours de Pro.
 *
 * Composant autonome à poser tel quel (profil, réglages) : il lit lui-même
 * l'état du compte et disparaît de lui-même quand il n'a plus rien à
 * proposer — plus rien à appeler côté écran.
 *
 * Se cache dans trois cas : déjà associé (le bonus ne se réclame qu'une
 * fois), Pro déjà actif (offrir « 3 jours de Pro » à quelqu'un qui l'a déjà
 * n'a pas de sens et ferait passer le programme pour cassé), ou le temps de
 * savoir lequel des deux s'applique (le profil met un instant à charger).
 */
export default function GAuthLinkRewardCard() {
  const { user, refreshCurrentUser } = useAuth() as any;
  const [loading, setLoading] = useState(false);

  if (!user) return null;
  if (user.g_auth_linked) return null;

  const tier = effectiveSubscriptionTier(!!user.premium, user.subscription_tier);
  const proActive = tier === 'pro' && isSubscriptionActiveFor(tier, user.subscription_expires_at);
  if (proActive) return null;

  const handlePress = async () => {
    if (loading) return;
    setLoading(true);
    try {
      const result = await linkGAuthAccount();

      if (result.type === 'cancel') return;

      if (result.type === 'linked') {
        const rewardParts: string[] = [];
        if (result.bonus > 0) rewardParts.push(`+${result.bonus} NF`);
        if (result.trialDays > 0) rewardParts.push(`${result.trialDays} jours de Pro offerts`);
        toast.success('Compte associé !', {
          description: rewardParts.length > 0
            ? `${rewardParts.join(' et ')} ont été ajoutés à ton compte.`
            : 'Ton compte G est maintenant associé.',
        });
        await refreshCurrentUser?.();
        return;
      }
      if (result.type === 'already_linked') {
        toast.info('Ton compte est déjà associé à G.');
        await refreshCurrentUser?.();
        return;
      }
      if (result.type === 'taken') {
        toast.error('Ce compte G est déjà associé à un autre compte twitninf.');
        return;
      }
      toast.error(result.message);
    } catch {
      toast.error("L'association à G a échoué.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View style={styles.iconBox}>
          <Ionicons name="gift-outline" size={22} color={colors.gold} />
        </View>
        <View style={styles.headerText}>
          <Text style={styles.title}>Lie ton compte à G</Text>
          <Text style={styles.subtitle}>Un geste, deux cadeaux</Text>
        </View>
      </View>

      <View style={styles.rewardRow}>
        <View style={[styles.rewardChip, styles.rewardChipGold]}>
          <Ionicons name="wallet-outline" size={14} color={colors.gold} />
          <Text style={[styles.rewardChipText, { color: colors.gold }]}>5 NF</Text>
        </View>
        <View style={[styles.rewardChip, styles.rewardChipAccent]}>
          <Ionicons name="star" size={14} color={colors.accentBright} />
          <Text style={[styles.rewardChipText, { color: colors.accentBright }]}>3 jours de Pro</Text>
        </View>
      </View>

      <Text style={styles.description}>
        Connecte ton compte G à ton compte twitninf — reçois les deux offerts, une seule fois.
      </Text>

      <TouchableOpacity
        style={styles.button}
        onPress={handlePress}
        activeOpacity={0.85}
        disabled={loading}
      >
        {loading ? (
          <ActivityIndicator size="small" color={colors.onAccent} />
        ) : (
          <>
            <Ionicons name="link-outline" size={16} color={colors.onAccent} />
            <Text style={styles.buttonText}>Lier mon compte</Text>
          </>
        )}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: withAlpha(colors.gold, 0.32),
    backgroundColor: colors.surface,
    padding: 16,
    marginVertical: 10,
    gap: 12,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  iconBox: {
    width: 40,
    height: 40,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: withAlpha(colors.gold, 0.14),
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: withAlpha(colors.gold, 0.34),
  },
  headerText: { flex: 1, minWidth: 0 },
  title: {
    color: colors.textPrimary,
    fontSize: 15,
    fontFamily: fonts.bold,
  },
  subtitle: {
    color: colors.textMuted,
    fontSize: 12,
    fontFamily: fonts.regular,
    marginTop: 1,
  },
  rewardRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  rewardChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
  },
  rewardChipGold: {
    backgroundColor: withAlpha(colors.gold, 0.12),
    borderColor: withAlpha(colors.gold, 0.32),
  },
  rewardChipAccent: {
    backgroundColor: colors.accentMuted,
    borderColor: withAlpha(colors.accent, 0.32),
  },
  rewardChipText: {
    fontSize: 12.5,
    fontFamily: fonts.bold,
  },
  description: {
    color: colors.textSecondary,
    fontSize: 13,
    lineHeight: 19,
    fontFamily: fonts.regular,
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    minHeight: 46,
    borderRadius: radius.md,
    backgroundColor: colors.accent,
  },
  buttonText: {
    color: colors.onAccent,
    fontSize: 14,
    fontFamily: fonts.bold,
  },
});
