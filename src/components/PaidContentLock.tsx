import React, { useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, radius } from '../theme';
import {
  purchase,
  fetchPurchaseQuote,
  describeConversions,
  formatAmount,
  type PaidContentLock as Lock,
} from '../services/paidContentService';
import { toast } from './ui/Toast';
import { confirmAsync } from './ui/ConfirmSheet';

/**
 * Action d'achat d'un contenu payant.
 *
 * Tout le discours commercial tient dans une seule action. Le panneau flouté
 * au-dessus crée l'envie ; ce composant ne répète donc ni « accès privé », ni
 * les bénéfices, ni une deuxième carte décorative.
 */

interface Props {
  lock: Lock;
  onUnlocked?: (contentId: string) => void;
  compact?: boolean;
}

export default function PaidContentLock({ lock, onUnlocked, compact = false }: Props) {
  const [buying, setBuying] = useState(false);

  if (lock.has_access) return null;

  const confirmPurchase = async () => {
    if (buying) return;
    setBuying(true);
    try {
      const quote = await fetchPurchaseQuote(lock.id);

      if (!quote.affordable) {
        toast.error('Solde insuffisant', {
          description: `Il te manque ${formatAmount(quote.missing)} NF, même en convertissant tes autres monnaies.`,
        });
        return;
      }

      if (!quote.needsConversion) {
        const ok = await confirmAsync({
          title: 'Débloquer ce contenu',
          message: `${formatAmount(quote.price)} NF seront débités de ton portefeuille. L'accès est définitif.`,
          confirmLabel: 'Débloquer',
          destructive: true,
        });
        if (ok) await runPurchase(false);
        return;
      }

      const ok = await confirmAsync({
        title: 'Compléter avec tes autres monnaies ?',
        message:
          `Ce contenu coûte ${formatAmount(quote.price)} NF et tu en as ${formatAmount(quote.balance)}.\n\n` +
          `Il manque ${formatAmount(quote.shortfall)} NF : ${describeConversions(quote.conversions)} seront convertis pour compléter.\n\n` +
          "Les cours peuvent bouger légèrement d'ici la validation.",
        confirmLabel: 'Convertir et débloquer',
        cancelLabel: 'Annuler',
        destructive: true,
      });
      if (ok) await runPurchase(true);
    } catch (error: any) {
      toast.error('Achat impossible', {
        description: error?.message || 'Réessaie dans un instant.',
      });
    } finally {
      setBuying(false);
    }
  };

  const runPurchase = async (autoConvert: boolean) => {
    try {
      const result = await purchase(lock.id, autoConvert);
      if (result.conversions?.length) {
        toast.success('Contenu débloqué', {
          description: `Converti : ${result.conversions
            .map((conversion) => `${formatAmount(conversion.debited)} ${conversion.symbol}`)
            .join(' et ')}.`,
        });
      }
      onUnlocked?.(lock.content_id);
    } catch (error: any) {
      toast.error('Achat impossible', {
        description: error?.message || 'Réessaie dans un instant.',
      });
    }
  };

  const displayedPrice = formatAmount(lock.price_twc);

  return (
    <View style={[styles.wrap, compact && styles.wrapCompact]}>
      <TouchableOpacity
        style={[styles.buttonShadow, buying && styles.buttonBusy]}
        onPress={confirmPurchase}
        disabled={buying}
        activeOpacity={0.84}
        accessibilityRole="button"
        accessibilityLabel={`Débloquer pour ${displayedPrice} NF`}
        accessibilityHint="Ouvre la confirmation d'achat. L'accès sera définitif."
      >
        <LinearGradient
          colors={[colors.accentBright, colors.accent, colors.accentHover]}
          locations={[0, 0.55, 1]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.button, compact && styles.buttonCompact]}
        >
          <View style={styles.buttonHighlight} pointerEvents="none" />
          {buying ? (
            <ActivityIndicator size="small" color={colors.white} />
          ) : (
            <>
              <Ionicons name="lock-open" size={compact ? 16 : 18} color={colors.white} />
              <Text style={[styles.buttonText, compact && styles.buttonTextCompact]}>
                Débloquer pour{' '}
                <Text style={styles.buttonPrice}>{displayedPrice} NF</Text>
              </Text>
            </>
          )}
        </LinearGradient>
      </TouchableOpacity>

      {!compact && (
        <Text style={styles.note}>Paiement unique · accès définitif</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: '100%',
    marginTop: 12,
    alignItems: 'center',
  },
  wrapCompact: {
    marginTop: 9,
  },
  buttonShadow: {
    width: '100%',
    borderRadius: radius.md + 2,
    shadowColor: colors.accent,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.24,
    shadowRadius: 15,
    elevation: 6,
  },
  button: {
    minHeight: 52,
    paddingHorizontal: 18,
    borderRadius: radius.md + 2,
    overflow: 'hidden',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.textMuted,
  },
  buttonCompact: {
    minHeight: 46,
    paddingHorizontal: 14,
    borderRadius: radius.md,
  },
  buttonHighlight: {
    position: 'absolute',
    top: 0,
    left: 14,
    right: 14,
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.textSecondary,
  },
  buttonText: {
    color: colors.white,
    fontSize: 15,
    lineHeight: 19,
    fontWeight: '700',
    letterSpacing: -0.15,
    marginLeft: 9,
  },
  buttonTextCompact: {
    fontSize: 13.5,
    lineHeight: 17,
  },
  buttonPrice: {
    fontWeight: '900',
  },
  buttonBusy: {
    opacity: 0.72,
  },
  note: {
    color: colors.textMuted,
    fontSize: 10.5,
    lineHeight: 14,
    marginTop: 7,
  },
});
