import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  Pressable,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { WalletTransaction } from '../services/walletService';
import { useAuth } from '../contexts/AuthContext';
import { colors, fonts, radius, withAlpha } from '../theme';

interface TransactionDetailModalProps {
  visible: boolean;
  transaction: WalletTransaction | null;
  onClose: () => void;
}

const TransactionDetailModal: React.FC<TransactionDetailModalProps> = ({
  visible,
  transaction,
  onClose,
}) => {
  const { user } = useAuth();

  if (!transaction) return null;

  // Déterminer si c'est entrant ou sortant basé sur les IDs d'utilisateur
  let isIncoming = false;
  if (transaction.fromUserId && transaction.toUserId && user?.id) {
    if (transaction.toUserId === user.id && transaction.fromUserId !== user.id) {
      isIncoming = true;
    } else if (transaction.fromUserId === user.id && transaction.toUserId !== user.id) {
      isIncoming = false;
    } else {
      isIncoming = transaction.type === 'received' ||
                  transaction.type === 'reward' ||
                  transaction.type === 'bonus' ||
                  transaction.type === 'purchase';
    }
  } else {
    isIncoming = transaction.type === 'received' ||
                transaction.type === 'reward' ||
                transaction.type === 'bonus' ||
                transaction.type === 'purchase';
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return colors.success;
      case 'pending': return colors.warning;
      case 'failed': return colors.red;
      default: return colors.textMuted;
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'completed': return 'Terminée';
      case 'pending': return 'En cours';
      case 'failed': return 'Échouée';
      case 'cancelled': return 'Annulée';
      default: return status;
    }
  };

  const getTypeText = (type: string) => {
    switch (type) {
      case 'received': return 'Réception';
      case 'sent': return 'Envoi';
      case 'purchase': return 'Achat';
      case 'reward': return 'Récompense';
      case 'bonus': return 'Bonus';
      case 'mining': return 'Minage';
      case 'transfer': return 'Transfert';
      default: return type;
    }
  };

  const getTypeIcon = (type: string): keyof typeof Ionicons.glyphMap => {
    switch (type) {
      case 'received': return 'arrow-down';
      case 'sent': return 'arrow-up';
      case 'purchase': return 'card-outline';
      case 'reward': return 'trophy-outline';
      case 'bonus': return 'gift-outline';
      default: return 'swap-horizontal';
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('fr-FR', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  /** Ligne de relevé : libellé à gauche, valeur à droite, filet fin dessous. */
  const renderRow = (label: string, value: string, options?: { mono?: boolean; color?: string }) => (
    <View style={styles.row} key={label}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text
        style={[
          styles.rowValue,
          options?.mono && styles.rowValueMono,
          options?.color ? { color: options.color } : null,
        ]}
        numberOfLines={options?.mono ? 1 : 3}
        ellipsizeMode={options?.mono ? 'middle' : 'tail'}
      >
        {value}
      </Text>
    </View>
  );

  const statusColor = getStatusColor(transaction.status);
  const amountColor = isIncoming ? colors.success : colors.textPrimary;

  const extraRows: React.ReactNode[] = [];
  if (transaction.metadata?.orderId) extraRows.push(renderRow('Commande', transaction.metadata.orderId, { mono: true }));
  if (transaction.metadata?.packageName) extraRows.push(renderRow('Offre', transaction.metadata.packageName));
  if (transaction.metadata?.bonusType) extraRows.push(renderRow('Type de bonus', transaction.metadata.bonusType));
  if (transaction.metadata?.fee != null) {
    extraRows.push(renderRow('Frais', `${transaction.metadata.fee.toFixed(4)} ${transaction.currencySymbol}`, { color: colors.warning }));
  }
  if (transaction.metadata?.exchangeRate != null) {
    extraRows.push(renderRow('Taux appliqué', `1 ${transaction.currencySymbol} = ${transaction.metadata.exchangeRate.toFixed(4)} €`));
  }
  if (transaction.txHash) extraRows.push(renderRow('Hash', transaction.txHash, { mono: true }));

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.overlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Fermer" />

        <View style={styles.sheet}>
          <View style={styles.grabber} />

          <View style={styles.header}>
            <Text style={styles.headerTitle}>Détail de l'opération</Text>
            <Pressable
              onPress={onClose}
              hitSlop={10}
              style={({ pressed }) => [styles.close, pressed && styles.closePressed]}
              accessibilityRole="button"
              accessibilityLabel="Fermer"
            >
              <Ionicons name="close" size={18} color={colors.textSecondary} />
            </Pressable>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} bounces={false}>
            {/* Montant : l'information qu'on vient chercher, en premier. */}
            <View style={styles.amountBlock}>
              <View style={[styles.typeIcon, { borderColor: withAlpha(amountColor, 0.35) }]}>
                <Ionicons name={getTypeIcon(transaction.type)} size={17} color={amountColor} />
              </View>
              <Text style={[styles.amount, { color: amountColor }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>
                {isIncoming ? '+' : '−'}{Math.abs(transaction.amount).toFixed(2)}
                <Text style={styles.amountUnit}> {transaction.currencySymbol}</Text>
              </Text>
              <View style={styles.statusRow}>
                <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
                <Text style={[styles.statusText, { color: statusColor }]}>{getStatusText(transaction.status)}</Text>
              </View>
            </View>

            <Text style={styles.sectionLabel}>Opération</Text>
            {renderRow('Type', getTypeText(transaction.type))}
            {renderRow('Date', formatDate(transaction.date))}
            {!!transaction.description && renderRow('Libellé', transaction.description)}
            {renderRow('Référence', transaction.id, { mono: true })}

            {(transaction.fromUsername || transaction.toUsername) && (
              <>
                <Text style={styles.sectionLabel}>Contreparties</Text>
                {!!transaction.fromUsername && renderRow('De', `@${transaction.fromUsername}`)}
                {!!transaction.toUsername && renderRow('À', `@${transaction.toUsername}`)}
              </>
            )}

            {extraRows.length > 0 && (
              <>
                <Text style={styles.sectionLabel}>Complément</Text>
                {extraRows}
              </>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: colors.overlay,
  },
  sheet: {
    backgroundColor: colors.bgElevated,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderSubtle,
    paddingHorizontal: 20,
    // Pas d'insets : aucun SafeAreaProvider n'est monté dans cette app.
    paddingBottom: 30,
    paddingTop: 10,
    maxHeight: '86%',
  },
  grabber: {
    alignSelf: 'center',
    width: 38,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.borderStrong,
    marginBottom: 14,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  headerTitle: {
    fontSize: 12,
    fontFamily: fonts.semibold,
    color: colors.textMuted,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
  },
  close: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  closePressed: { backgroundColor: colors.surfaceElevated },

  amountBlock: {
    alignItems: 'flex-start',
    paddingTop: 18,
    paddingBottom: 26,
  },
  typeIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  amount: {
    fontSize: 44,
    lineHeight: 48,
    fontFamily: fonts.displayHeavy,
    letterSpacing: -1.5,
  },
  amountUnit: {
    fontSize: 17,
    fontFamily: fonts.bold,
    color: colors.textMuted,
    letterSpacing: 0,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 10,
  },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusText: { fontSize: 12.5, fontFamily: fonts.semibold },

  sectionLabel: {
    fontSize: 11,
    fontFamily: fonts.semibold,
    color: colors.textMuted,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    marginTop: 22,
    marginBottom: 4,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 20,
    paddingVertical: 13,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  rowLabel: {
    fontSize: 13,
    fontFamily: fonts.regular,
    color: colors.textMuted,
    flexShrink: 0,
  },
  rowValue: {
    flex: 1,
    fontSize: 13.5,
    fontFamily: fonts.medium,
    color: colors.textPrimary,
    textAlign: 'right',
  },
  rowValueMono: {
    fontSize: 12,
    color: colors.textSecondary,
  },
});

export default TransactionDetailModal;
