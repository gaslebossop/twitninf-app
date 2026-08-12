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

const PALETTE = ['#FE2C55', '#25F4EE', '#FFD24D', '#22C55E', '#A855F7', '#3B82F6'];

interface CreateCurrencyModalProps {
  visible: boolean;
  onClose: () => void;
  costNf: number;
  minPriceEur: number;
  maxPriceEur: number;
  totalValueEur: number | null;
  onCreated: (symbol: string) => void;
}

export default function CreateCurrencyModal({ visible, onClose, costNf, minPriceEur, maxPriceEur, totalValueEur, onCreated }: CreateCurrencyModalProps) {
  const insets = useSafeAreaInsets();
  const [name, setName] = useState('');
  const [symbol, setSymbol] = useState('');
  const [description, setDescription] = useState('');
  const [color, setColor] = useState(PALETTE[0]);
  // Prix de départ choisi par le créateur, en EUR — l'offre initiale est
  // DÉRIVÉE de ce prix (totalValueEur / prix) plutôt que fixée à un nombre
  // d'unités imposé, comme côté Windows.
  const defaultPrice = totalValueEur != null ? Math.max(minPriceEur, Math.min(maxPriceEur, 0.10)) : minPriceEur;
  const [priceInput, setPriceInput] = useState(String(defaultPrice));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!visible) {
      setName(''); setSymbol(''); setDescription(''); setColor(PALETTE[0]); setPriceInput(String(defaultPrice)); setError(''); setBusy(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const numericPrice = Number(priceInput.replace(',', '.'));
  const validPrice = Number.isFinite(numericPrice) && numericPrice >= minPriceEur && numericPrice <= maxPriceEur;
  const estimatedSupply = validPrice && totalValueEur != null ? Math.max(1, Math.round(totalValueEur / numericPrice)) : null;

  const canSubmit = name.trim().length >= 3 && symbol.trim().length >= 2 && validPrice && !busy;

  const submit = async () => {
    if (!canSubmit) return;
    setBusy(true);
    setError('');
    try {
      const created = await NewEconomyService.createUserCurrency({
        name: name.trim(),
        symbol: symbol.trim().toUpperCase(),
        description: description.trim() || undefined,
        color,
        basePriceEur: numericPrice,
      });
      onCreated(created?.symbol ?? symbol.trim().toUpperCase());
      onClose();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Création impossible');
    } finally {
      setBusy(false);
    }
  };

  const sheetMaxHeight = Math.round(SCREEN_HEIGHT * 0.85);

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.backdrop}>
        <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={onClose} />
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.kav} keyboardVerticalOffset={insets.top}>
          <View style={[styles.sheet, { maxHeight: sheetMaxHeight, paddingBottom: Math.max(insets.bottom, 16) }]}>
            <View style={styles.grabber} />

            <View style={styles.header}>
              <View style={styles.headerSide} />
              <Text style={styles.title}>Créer ma monnaie</Text>
              <TouchableOpacity style={styles.headerSide} onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <View style={styles.closeButton}>
                  <Ionicons name="close" size={18} color={colors.textSecondary} />
                </View>
              </TouchableOpacity>
            </View>

            <View style={styles.body}>
              <Text style={styles.introText}>
                L'émission coûte <Text style={styles.introBold}>{costNf.toLocaleString('fr-FR')} NF</Text>. Choisissez le prix
                de départ d'une unité : l'offre initiale est calculée pour que la capitalisation de départ égale exactement
                ce que vous payez.
              </Text>

              <Text style={styles.label}>Nom</Text>
              <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="Ma Super Monnaie" placeholderTextColor={colors.textMuted} maxLength={32} />

              <Text style={styles.label}>Symbole</Text>
              <TextInput style={styles.input} value={symbol} onChangeText={(v) => setSymbol(v.toUpperCase())} placeholder="MSM" placeholderTextColor={colors.textMuted} maxLength={10} autoCapitalize="characters" />

              <Text style={styles.label}>Prix de départ (€ par unité)</Text>
              <TextInput
                style={styles.input}
                value={priceInput}
                onChangeText={setPriceInput}
                placeholder={`entre ${minPriceEur} et ${maxPriceEur}`}
                placeholderTextColor={colors.textMuted}
                keyboardType="decimal-pad"
              />
              {!validPrice && (
                <Text style={styles.priceHint}>Prix entre {minPriceEur} € et {maxPriceEur} €.</Text>
              )}
              {estimatedSupply != null && (
                <Text style={styles.priceHint}>≈ <Text style={styles.introBold}>{estimatedSupply.toLocaleString('fr-FR')}</Text> unités seront créditées à ce prix.</Text>
              )}

              <Text style={styles.label}>Description (optionnel)</Text>
              <TextInput style={[styles.input, styles.textarea]} value={description} onChangeText={setDescription} placeholder="À quoi sert cette monnaie ?" placeholderTextColor={colors.textMuted} maxLength={500} multiline />

              <Text style={styles.label}>Couleur</Text>
              <View style={styles.colorRow}>
                {PALETTE.map((c) => (
                  <TouchableOpacity key={c} style={[styles.colorDot, { backgroundColor: c }, color === c && styles.colorDotActive]} onPress={() => setColor(c)}>
                    {color === c && <Ionicons name="checkmark" size={16} color={colors.onAccent} />}
                  </TouchableOpacity>
                ))}
              </View>

              {error !== '' && (
                <View style={styles.errorBox}>
                  <Ionicons name="alert-circle" size={16} color={colors.red} />
                  <Text style={styles.errorText}>{error}</Text>
                </View>
              )}

              <TouchableOpacity style={[styles.primaryButton, !canSubmit && styles.primaryButtonDisabled]} onPress={submit} disabled={!canSubmit}>
                {busy ? <ActivityIndicator color={colors.onAccent} /> : (
                  <Text style={styles.primaryButtonText}>Émettre pour {costNf.toLocaleString('fr-FR')} NF</Text>
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
    backgroundColor: 'rgba(18,20,28,0.97)',
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
  introText: { fontSize: 13, color: colors.textSecondary, lineHeight: 19, marginBottom: 16 },
  introBold: { color: colors.textPrimary, fontWeight: '700' },
  label: { fontSize: 12, fontWeight: '600', fontFamily: fonts.semibold, color: colors.textMuted, marginTop: 12, marginBottom: 6 },
  input: {
    paddingHorizontal: 14, height: 46, borderRadius: 12, backgroundColor: colors.overlayMedium,
    borderWidth: 1, borderColor: colors.border, color: colors.textPrimary, fontSize: 14,
  },
  textarea: { height: 80, paddingTop: 10, textAlignVertical: 'top' },
  priceHint: { fontSize: 11.5, color: colors.textMuted, marginTop: 6, lineHeight: 16 },
  colorRow: { flexDirection: 'row', gap: 10 },
  colorDot: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: 'transparent' },
  colorDotActive: { borderColor: colors.textPrimary },
  errorBox: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 16, padding: 12, borderRadius: 12, backgroundColor: colors.redMuted },
  errorText: { flex: 1, fontSize: 13, color: colors.red, fontWeight: '500' },
  primaryButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 20, height: 52, borderRadius: 16, backgroundColor: colors.accent },
  primaryButtonDisabled: { opacity: 0.4 },
  primaryButtonText: { fontSize: 15, fontWeight: '700', fontFamily: fonts.bold, color: colors.onAccent },
});
