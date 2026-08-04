import React, { useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
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
 * Verrou affiché sous l'aperçu d'un contenu payant.
 *
 * Ce composant ne cache rien : quand il s'affiche, le texte complet et les
 * médias ne sont déjà plus dans la réponse du serveur. Il ne fait que
 * proposer l'achat de ce qui manque. Un flou posé par-dessus un contenu
 * complet aurait été contourné le jour même — la marchandise doit rester sur
 * le serveur, pas être livrée puis masquée.
 *
 * Le prix est affiché en NF, la monnaie dans laquelle l'utilisateur raisonne
 * partout ailleurs dans l'app.
 */

interface Props {
  lock: Lock;
  /** Appelé après un achat réussi — l'appelant recharge le contenu déverrouillé. */
  onUnlocked?: (contentId: string) => void;
  compact?: boolean;
}

export default function PaidContentLock({ lock, onUnlocked, compact = false }: Props) {
  const [buying, setBuying] = useState(false);

  // Le créateur et les acheteurs voient le contenu : il n'y a rien à afficher.
  if (lock.has_access) return null;

  /**
   * L'estimation est demandée AVANT la confirmation, pas après.
   *
   * Sans elle, quelqu'un qui possède largement de quoi payer — mais réparti sur
   * plusieurs monnaies — se prenait un « Solde insuffisant » sans la moindre
   * indication qu'il lui suffisait d'accepter une conversion. Le solde NF seul
   * ne dit pas ce qu'on peut s'offrir.
   */
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

      // Le détail est explicite : quelles monnaies, quels montants. Convertir
      // les avoirs de quelqu'un se demande, ça ne se déduit pas d'un clic sur
      // « Débloquer » — et personne ne doit découvrir après coup qu'une de ses
      // monnaies a été vendue.
      const ok = await confirmAsync({
        title: 'Compléter avec tes autres monnaies ?',
        message:
          `Ce contenu coûte ${formatAmount(quote.price)} NF et tu en as ${formatAmount(quote.balance)}.\n\n` +
          `Il manque ${formatAmount(quote.shortfall)} NF : ${describeConversions(quote.conversions)} seront convertis pour compléter.\n\n` +
          'Les cours peuvent bouger légèrement d\'ici la validation.',
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
        // Ce qui a réellement été converti, pas ce qui était prévu : les cours
        // ont pu bouger entre l'estimation et l'achat.
        toast.success('Contenu débloqué', {
          description: `Converti : ${result.conversions
            .map((c) => `${formatAmount(c.debited)} ${c.symbol}`)
            .join(' et ')}.`,
        });
      }
      onUnlocked?.(lock.content_id);
    } catch (error: any) {
      // Le message du serveur est écrit pour être lu (« Solde insuffisant »,
      // « Tu possèdes déjà ce contenu ») : le remplacer par un texte générique
      // ferait perdre la seule information utile à cet instant précis.
      toast.error('Achat impossible', {
        description: error?.message || 'Réessaie dans un instant.',
      });
    }
  };

  return (
    <View style={[styles.wrap, compact && styles.wrapCompact]}>
      <View style={styles.row}>
        <View style={styles.iconCircle}>
          <Ionicons name="lock-closed" size={compact ? 14 : 16} color={colors.gold} />
        </View>
        <View style={styles.texts}>
          <Text style={styles.title} numberOfLines={1}>Contenu réservé</Text>
          <Text style={styles.subtitle} numberOfLines={1}>
            Débloque la suite et les médias
          </Text>
        </View>
      </View>

      <TouchableOpacity
        style={[styles.cta, buying && styles.ctaBusy]}
        onPress={confirmPurchase}
        disabled={buying}
        activeOpacity={0.85}
        accessibilityRole="button"
        accessibilityLabel={`Débloquer pour ${lock.price_twc} NF`}
      >
        {buying ? (
          <ActivityIndicator size="small" color={colors.onAccent} />
        ) : (
          <Text style={styles.ctaText}>{lock.price_twc} NF</Text>
        )}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 10,
    padding: 12,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.borderStrong,
  },
  wrapCompact: {
    padding: 10,
    marginTop: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 12,
  },
  iconCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.warningMuted,
    marginRight: 10,
  },
  texts: { flex: 1 },
  title: {
    color: colors.textPrimary,
    fontSize: 14,
    fontWeight: '600',
  },
  subtitle: {
    color: colors.textMuted,
    fontSize: 12,
    marginTop: 2,
  },
  cta: {
    minWidth: 84,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: radius.round,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaBusy: { opacity: 0.7 },
  ctaText: {
    color: colors.onAccent,
    fontSize: 14,
    fontWeight: '700',
  },
});
