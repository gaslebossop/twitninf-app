import React, { useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius } from '../theme';
import { purchase, type PaidContentLock as Lock } from '../services/paidContentService';

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

  const confirmPurchase = () => {
    Alert.alert(
      'Débloquer ce contenu',
      `${lock.price_twc} NF seront débités de ton portefeuille. L'accès est définitif.`,
      [
        { text: 'Annuler', style: 'cancel' },
        { text: 'Débloquer', style: 'default', onPress: runPurchase },
      ],
    );
  };

  const runPurchase = async () => {
    if (buying) return;
    setBuying(true);
    try {
      await purchase(lock.id);
      onUnlocked?.(lock.content_id);
    } catch (error: any) {
      // Le message du serveur est écrit pour être lu (« Solde insuffisant »,
      // « Tu possèdes déjà ce contenu ») : le remplacer par un texte générique
      // ferait perdre la seule information utile à cet instant précis.
      Alert.alert('Achat impossible', error?.message || 'Réessaie dans un instant.');
    } finally {
      setBuying(false);
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
