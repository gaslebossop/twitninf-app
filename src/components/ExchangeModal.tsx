import { fonts } from '../theme';
import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../theme';
import NewEconomyService from '../services/newEconomyService';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

type Direction = 'NF_TO_EUR' | 'EUR_TO_NF';

interface ExchangeModalProps {
  visible: boolean;
  onClose: () => void;
  symbol: string;
  nfBalance: number;
  eurBalance: number;
  price: number | null;
  onDone: () => void;
}

function fmt(value: number, maxDigits = 2) {
  return value.toLocaleString('fr-FR', { maximumFractionDigits: maxDigits });
}

export default function ExchangeModal({ visible, onClose, symbol, nfBalance, eurBalance, price, onDone }: ExchangeModalProps) {
  const insets = useSafeAreaInsets();
  const [direction, setDirection] = useState<Direction>('NF_TO_EUR');
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState<{ debited: number; credited: number } | null>(null);

  useEffect(() => {
    if (!visible) {
      setDirection('NF_TO_EUR');
      setAmount('');
      setError('');
      setBusy(false);
      setDone(null);
    }
  }, [visible]);

  const hasPrice = typeof price === 'number' && Number.isFinite(price) && price > 0;
  const fromSymbol = direction === 'NF_TO_EUR' ? symbol : '€';
  const toSymbol = direction === 'NF_TO_EUR' ? '€' : symbol;
  const fromBalance = direction === 'NF_TO_EUR' ? nfBalance : eurBalance;

  const numericAmount = Number(amount.replace(',', '.'));
  const validAmount = amount.trim() !== '' && Number.isFinite(numericAmount) && numericAmount > 0;
  const insufficient = validAmount && numericAmount > fromBalance;
  const preview = useMemo(() => {
    if (!validAmount || !hasPrice) return null;
    return direction === 'NF_TO_EUR' ? numericAmount * (price as number) : numericAmount / (price as number);
  }, [validAmount, hasPrice, direction, numericAmount, price]);

  const swap = async () => {
    if (!validAmount || insufficient || busy) return;
    setBusy(true);
    setError('');
    try {
      const result = await NewEconomyService.exchangeCurrency(direction, numericAmount);
      setDone({ debited: result.debited, credited: result.credited });
      onDone();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Échange impossible');
    } finally {
      setBusy(false);
    }
  };

  const sheetMaxHeight = Math.round(SCREEN_HEIGHT * 0.75);

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.backdrop}>
        <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={onClose} />
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.kav} keyboardVerticalOffset={insets.top}>
          <View style={[styles.sheet, { maxHeight: sheetMaxHeight, paddingBottom: Math.max(insets.bottom, 16) }]}>
            <View style={styles.grabber} />

            <View style={styles.header}>
              <View style={styles.headerSide} />
              <Text style={styles.title}>Échanger {symbol} / EUR</Text>
              <TouchableOpacity style={styles.headerSide} onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <View style={styles.closeButton}>
                  <Ionicons name="close" size={18} color={colors.textSecondary} />
                </View>
              </TouchableOpacity>
            </View>

            {done ? (
              <View style={styles.doneWrap}>
                <View style={styles.doneIcon}><Ionicons name="checkmark" size={30} color={colors.success} /></View>
                <Text style={styles.doneTitle}>Échange effectué</Text>
                <Text style={styles.doneText}>
                  {fmt(done.debited, 4)} {fromSymbol} échangés contre {fmt(done.credited, 4)} {toSymbol}.
                </Text>
                <TouchableOpacity style={styles.primaryButton} onPress={onClose}>
                  <Text style={styles.primaryButtonText}>Fermer</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={styles.body}>
                <View style={styles.unitToggle}>
                  <TouchableOpacity style={[styles.unitButton, direction === 'NF_TO_EUR' && styles.unitButtonActive]} onPress={() => setDirection('NF_TO_EUR')}>
                    <Text style={[styles.unitButtonText, direction === 'NF_TO_EUR' && styles.unitButtonTextActive]}>{symbol} → €</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.unitButton, direction === 'EUR_TO_NF' && styles.unitButtonActive]} onPress={() => setDirection('EUR_TO_NF')}>
                    <Text style={[styles.unitButtonText, direction === 'EUR_TO_NF' && styles.unitButtonTextActive]}>€ → {symbol}</Text>
                  </TouchableOpacity>
                </View>

                <View style={styles.amountHero}>
                  <TextInput
                    style={styles.amountInput}
                    value={amount}
                    onChangeText={(value) => setAmount(value.replace(/[^0-9.,]/g, ''))}
                    placeholder="0"
                    placeholderTextColor={colors.textMuted}
                    keyboardType="decimal-pad"
                    autoFocus
                    maxLength={12}
                  />
                  <Text style={styles.amountCurrency}>{fromSymbol}</Text>
                </View>

                <Text style={styles.balanceHint}>Solde disponible : {fmt(fromBalance, 2)} {fromSymbol}</Text>
                {preview != null && <Text style={styles.previewHint}>≈ {fmt(preview, 4)} {toSymbol} au taux actuel</Text>}
                {hasPrice && <Text style={styles.rateHint}>Taux : 1 {symbol} = {(price as number).toFixed(4)} € — pas de frais sur l'échange</Text>}

                {insufficient && (
                  <View style={styles.errorBox}>
                    <Ionicons name="alert-circle" size={16} color={colors.red} />
                    <Text style={styles.errorText}>Solde insuffisant pour cet échange.</Text>
                  </View>
                )}
                {error !== '' && (
                  <View style={styles.errorBox}>
                    <Ionicons name="alert-circle" size={16} color={colors.red} />
                    <Text style={styles.errorText}>{error}</Text>
                  </View>
                )}

                <TouchableOpacity
                  style={[styles.primaryButton, (!validAmount || insufficient) && styles.primaryButtonDisabled]}
                  onPress={swap}
                  disabled={!validAmount || insufficient || busy}
                >
                  {busy ? <ActivityIndicator color={colors.onAccent} /> : (
                    <>
                      <Ionicons name="swap-horizontal" size={16} color={colors.onAccent} />
                      <Text style={styles.primaryButtonText}>Échanger</Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            )}
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'flex-end' },
  kav: { width: '100%' },
  sheet: {
    backgroundColor: colors.bgElevated,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderSubtle,
    borderBottomWidth: 0,
    overflow: 'hidden',
  },
  grabber: { alignSelf: 'center', width: 38, height: 4, borderRadius: 2, backgroundColor: colors.borderStrong, marginTop: 10, marginBottom: 2 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 8, paddingVertical: 12,
  },
  headerSide: { width: 40, alignItems: 'center', justifyContent: 'center' },
  title: {
    flex: 1,
    textAlign: 'center',
    fontSize: 12,
    fontFamily: fonts.semibold,
    color: colors.textMuted,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
  },
  closeButton: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface },
  body: { paddingHorizontal: 16, paddingTop: 20, paddingBottom: 20 },
  unitToggle: {
    flexDirection: 'row', alignSelf: 'flex-start', borderRadius: 999,
    borderWidth: 1, borderColor: colors.border, overflow: 'hidden', marginBottom: 22,
  },
  unitButton: { paddingHorizontal: 18, paddingVertical: 9, minHeight: 38, justifyContent: 'center' },
  unitButtonActive: { backgroundColor: colors.textPrimary },
  unitButtonText: { fontSize: 13, fontFamily: fonts.semibold, color: colors.textSecondary },
  unitButtonTextActive: { color: colors.bg },
  // Aligné à gauche comme le reste du portefeuille — un pavé de saisie centré
  // rompait avec le solde et l'historique, alignés à gauche eux aussi.
  amountHero: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  amountCurrency: { fontSize: 17, fontFamily: fonts.bold, color: colors.textMuted },
  amountInput: { flex: 1, minWidth: 60, fontSize: 48, fontFamily: fonts.displayHeavy, color: colors.textPrimary, letterSpacing: -1.5, textAlign: 'left', paddingVertical: 4 },
  balanceHint: { fontSize: 12.5, color: colors.textMuted, marginTop: 8 },
  previewHint: { fontSize: 14, color: colors.textPrimary, fontFamily: fonts.bold, marginTop: 12 },
  rateHint: { fontSize: 11.5, color: colors.textMuted, marginTop: 6 },
  errorBox: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 14, padding: 12, borderRadius: 12, backgroundColor: colors.redMuted },
  errorText: { flex: 1, fontSize: 13, color: colors.red, fontWeight: '500' },
  primaryButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 20, height: 52, borderRadius: 16, backgroundColor: colors.accent },
  primaryButtonDisabled: { opacity: 0.4 },
  primaryButtonText: { fontSize: 15, fontWeight: '700', fontFamily: fonts.bold, color: colors.onAccent },
  doneWrap: { alignItems: 'center', padding: 32 },
  doneIcon: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.successMuted, marginBottom: 16 },
  doneTitle: { fontSize: 18, fontWeight: '700', fontFamily: fonts.bold, color: colors.textPrimary, marginBottom: 8 },
  doneText: { fontSize: 14, color: colors.textSecondary, textAlign: 'center', lineHeight: 20, marginBottom: 22 },
});
