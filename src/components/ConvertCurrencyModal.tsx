import { fonts } from '../theme';
import React, { useEffect, useState } from 'react';
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

interface ConvertCurrencyModalProps {
  visible: boolean;
  onClose: () => void;
  currencyId: string;
  symbol: string;
  holding: number;
  priceEur: number;
  onDone: (message: string) => void;
}

function fmt(value: number, maxDigits = 2) {
  return value.toLocaleString('fr-FR', { maximumFractionDigits: maxDigits });
}

/**
 * Achat/vente d'une monnaie COMMUNAUTAIRE contre NF ou EUR — pendant de
 * ExchangeModal (qui ne gère que NF <-> EUR interne, deux monnaies fixes).
 * Ici la monnaie et sa contrepartie sont paramétrables, et le sens
 * (acheter = reverse:true, vendre = reverse:false) suit la convention de
 * l'API `convertUserCurrency`.
 */
export default function ConvertCurrencyModal({ visible, onClose, currencyId, symbol, holding, priceEur, onDone }: ConvertCurrencyModalProps) {
  const insets = useSafeAreaInsets();
  const [reverse, setReverse] = useState(false); // false = vendre, true = acheter
  const [target, setTarget] = useState<'NF' | 'EUR'>('NF');
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!visible) {
      setReverse(false);
      setTarget('NF');
      setAmount('');
      setError('');
      setBusy(false);
    }
  }, [visible]);

  const numericAmount = Number(amount.replace(',', '.'));
  const validAmount = amount.trim() !== '' && Number.isFinite(numericAmount) && numericAmount > 0;
  const insufficient = validAmount && !reverse && numericAmount > holding;
  const inputUnit = reverse ? target : symbol;

  const submit = async () => {
    if (!validAmount || insufficient || busy) return;
    setBusy(true);
    setError('');
    try {
      const result = await NewEconomyService.convertUserCurrency(currencyId, target, numericAmount, reverse);
      const from = reverse ? target : symbol;
      const to = reverse ? symbol : target;
      onDone(`Converti ${fmt(result.debited, 4)} ${from} en ${fmt(result.credited, 4)} ${to}.`);
      onClose();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Conversion impossible');
    } finally {
      setBusy(false);
    }
  };

  const sheetMaxHeight = Math.round(SCREEN_HEIGHT * 0.8);

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.backdrop}>
        <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={onClose} />
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.kav} keyboardVerticalOffset={insets.top}>
          <View style={[styles.sheet, { maxHeight: sheetMaxHeight, paddingBottom: Math.max(insets.bottom, 16) }]}>
            <View style={styles.grabber} />

            <View style={styles.header}>
              <View style={styles.headerSide} />
              <Text style={styles.title}>Convertir {symbol}</Text>
              <TouchableOpacity style={styles.headerSide} onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <View style={styles.closeButton}>
                  <Ionicons name="close" size={18} color={colors.textSecondary} />
                </View>
              </TouchableOpacity>
            </View>

            <View style={styles.body}>
              <Text style={styles.priceHint}>Cours actuel : {priceEur.toFixed(4)} € par {symbol}. Vous détenez {fmt(holding)} {symbol}.</Text>

              <View style={styles.unitToggle}>
                <TouchableOpacity style={[styles.unitButton, !reverse && styles.unitButtonActive]} onPress={() => setReverse(false)}>
                  <Text style={[styles.unitButtonText, !reverse && styles.unitButtonTextActive]}>Vendre {symbol}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.unitButton, reverse && styles.unitButtonActive]} onPress={() => setReverse(true)}>
                  <Text style={[styles.unitButtonText, reverse && styles.unitButtonTextActive]}>Acheter {symbol}</Text>
                </TouchableOpacity>
              </View>

              <View style={styles.unitToggle}>
                <TouchableOpacity style={[styles.unitButton, target === 'NF' && styles.unitButtonActive]} onPress={() => setTarget('NF')}>
                  <Text style={[styles.unitButtonText, target === 'NF' && styles.unitButtonTextActive]}>contre NF</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.unitButton, target === 'EUR' && styles.unitButtonActive]} onPress={() => setTarget('EUR')}>
                  <Text style={[styles.unitButtonText, target === 'EUR' && styles.unitButtonTextActive]}>contre EUR</Text>
                </TouchableOpacity>
              </View>

              <View style={styles.amountHero}>
                <Text style={styles.amountCurrency}>{inputUnit}</Text>
                <TextInput
                  style={styles.amountInput}
                  value={amount}
                  onChangeText={(value) => setAmount(value.replace(/[^0-9.,]/g, ''))}
                  placeholder="0"
                  placeholderTextColor={colors.textMuted}
                  keyboardType="decimal-pad"
                  autoFocus
                  maxLength={14}
                />
              </View>
              <Text style={styles.balanceHint}>Montant en {inputUnit}</Text>

              {insufficient && (
                <View style={styles.errorBox}>
                  <Ionicons name="alert-circle" size={16} color={colors.red} />
                  <Text style={styles.errorText}>Solde insuffisant en {symbol}.</Text>
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
                onPress={submit}
                disabled={!validAmount || insufficient || busy}
              >
                {busy ? <ActivityIndicator color={colors.onAccent} /> : (
                  <>
                    <Ionicons name="swap-horizontal" size={16} color={colors.onAccent} />
                    <Text style={styles.primaryButtonText}>Convertir</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
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
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    borderColor: colors.border,
    borderBottomWidth: 0,
    overflow: 'hidden',
  },
  grabber: { alignSelf: 'center', width: 36, height: 4, borderRadius: 2, backgroundColor: colors.border, marginTop: 10, marginBottom: 2 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 8, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  headerSide: { width: 40, alignItems: 'center', justifyContent: 'center' },
  title: { flex: 1, textAlign: 'center', fontSize: 16, fontWeight: '700', fontFamily: fonts.bold, color: colors.textPrimary, letterSpacing: -0.02 },
  closeButton: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.overlayMedium },
  body: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 20 },
  priceHint: { textAlign: 'center', fontSize: 13, color: colors.textSecondary, marginBottom: 14 },
  unitToggle: {
    flexDirection: 'row', alignSelf: 'center', gap: 4, padding: 3, borderRadius: 999,
    backgroundColor: colors.overlayMedium, borderWidth: 1, borderColor: colors.border, marginBottom: 10,
  },
  unitButton: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 999 },
  unitButtonActive: { backgroundColor: colors.accent },
  unitButtonText: { fontSize: 13, fontWeight: '700', fontFamily: fonts.bold, color: colors.textSecondary },
  unitButtonTextActive: { color: colors.onAccent },
  amountHero: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'center', gap: 8, marginTop: 10 },
  amountCurrency: { fontSize: 22, fontWeight: '700', fontFamily: fonts.bold, color: colors.textSecondary },
  amountInput: { minWidth: 60, maxWidth: '80%', fontSize: 44, fontWeight: '800', fontFamily: fonts.bold, color: colors.textPrimary, textAlign: 'center', paddingVertical: 4 },
  balanceHint: { textAlign: 'center', fontSize: 13, color: colors.textMuted, marginTop: 4 },
  errorBox: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 14, padding: 12, borderRadius: 12, backgroundColor: colors.redMuted },
  errorText: { flex: 1, fontSize: 13, color: colors.red, fontWeight: '500' },
  primaryButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 20, height: 52, borderRadius: 16, backgroundColor: colors.accent },
  primaryButtonDisabled: { opacity: 0.4 },
  primaryButtonText: { fontSize: 15, fontWeight: '700', fontFamily: fonts.bold, color: colors.onAccent },
});
