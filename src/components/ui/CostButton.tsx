import React from 'react';
import {
  ActivityIndicator,
  StyleProp,
  StyleSheet,
  Text,
  View,
  ViewStyle,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { colors, fonts, radius, withAlpha } from '../../theme';
import { useCoinBalance } from '../../hooks/useCoinBalance';
import feedback from '../../utils/feedback';
import { toast } from './Toast';
import Tappable from './Tappable';

/**
 * Bouton qui coûte quelque chose.
 *
 * Partout dans l'app, le prix n'apparaissait ni sur le bouton, ni avant
 * l'appui : on tapait « Réserver », la requête partait, le serveur répondait
 * « solde insuffisant », et une alerte venait l'annoncer. Trois secondes
 * perdues pour une information qui était connue d'avance.
 *
 * Ici, le prix est écrit SUR le bouton, et le bouton sait s'il est payable.
 * S'il ne l'est pas, il se grise, dit ce qui manque, et un appui renvoie vers
 * la recharge au lieu de partir dans le vide.
 */

export interface CostButtonProps {
  label: string;
  /** Coût en NF. `0` rend le bouton gratuit (aucun test de solde). */
  cost: number;
  onPress: () => void;
  icon?: keyof typeof Ionicons.glyphMap;
  loading?: boolean;
  disabled?: boolean;
  /** Raison d'un blocage autre que le solde (champ vide, quota atteint…). */
  disabledReason?: string;
  variant?: 'primary' | 'gold';
  fullWidth?: boolean;
  style?: StyleProp<ViewStyle>;
}

function money(n: number): string {
  return Math.round(n).toLocaleString('fr-FR');
}

export default function CostButton({
  label,
  cost,
  onPress,
  icon,
  loading = false,
  disabled = false,
  disabledReason,
  variant = 'primary',
  fullWidth = true,
  style,
}: CostButtonProps) {
  const { balance, canAfford } = useCoinBalance();

  const affordable = cost <= 0 || canAfford(cost);
  const blocked = disabled || !affordable;
  const missing = balance !== null && cost > balance ? cost - balance : 0;

  const tint = variant === 'gold' ? colors.gold : colors.accent;
  const labelColor = variant === 'gold' ? colors.black : colors.onAccent;

  const handlePress = () => {
    if (loading) return;
    if (disabled) {
      feedback.refuse();
      if (disabledReason) toast.info(disabledReason);
      return;
    }
    if (!affordable) {
      feedback.refuse();
      toast.error(`Il te manque ${money(missing)} NF`, {
        description: 'Recharge ton portefeuille ou baisse le montant.',
      });
      return;
    }
    onPress();
  };

  return (
    <View style={[fullWidth && styles.fullWidth, style]}>
      <Tappable
        onPress={handlePress}
        scaleTo={0.98}
        // Le retour tactile est joué par `handlePress` selon l'issue : un refus
        // ne doit pas vibrer comme une validation.
        haptic={false}
      >
        <View
          style={[
            styles.base,
            { backgroundColor: blocked ? colors.surfaceElevated : tint },
            blocked && styles.blocked,
          ]}
        >
          {loading ? (
            <ActivityIndicator size="small" color={blocked ? colors.textSecondary : labelColor} />
          ) : (
            <>
              {icon && (
                <Ionicons
                  name={icon}
                  size={18}
                  color={blocked ? colors.textSecondary : labelColor}
                  style={styles.icon}
                />
              )}
              <Text
                style={[styles.label, { color: blocked ? colors.textSecondary : labelColor }]}
                numberOfLines={1}
              >
                {label}
              </Text>
              {cost > 0 && (
                <View
                  style={[
                    styles.priceTag,
                    {
                      backgroundColor: blocked
                        ? withAlpha(colors.textMuted, 0.18)
                        : withAlpha(labelColor === colors.black ? colors.black : colors.white, 0.18),
                    },
                  ]}
                >
                  <Text
                    style={[styles.price, { color: blocked ? colors.textSecondary : labelColor }]}
                  >
                    {money(cost)} NF
                  </Text>
                </View>
              )}
            </>
          )}
        </View>
      </Tappable>

      {/* La raison du blocage se lit SOUS le bouton, en permanence : elle
          n'attend pas un appui raté pour apparaître. */}
      {!loading && !affordable && cost > 0 && (
        <Text style={styles.hint}>
          Il te manque {money(missing)} NF — solde : {balance === null ? '···' : money(balance)} NF
        </Text>
      )}
      {!loading && affordable && disabled && !!disabledReason && (
        <Text style={styles.hint}>{disabledReason}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  fullWidth: {
    alignSelf: 'stretch',
  },
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 54,
    paddingHorizontal: 18,
    borderRadius: radius.lg,
  },
  blocked: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderStrong,
  },
  icon: {
    marginRight: 8,
  },
  label: {
    fontFamily: fonts.bold,
    fontSize: 16,
  },
  priceTag: {
    marginLeft: 10,
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: radius.round,
  },
  price: {
    fontFamily: fonts.bold,
    fontSize: 12.5,
    fontVariant: ['tabular-nums'],
  },
  hint: {
    color: colors.textMuted,
    fontFamily: fonts.medium,
    fontSize: 12.5,
    textAlign: 'center',
    marginTop: 8,
  },
});
