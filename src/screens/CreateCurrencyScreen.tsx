import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  StatusBar,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { MainStackParamList } from '../navigation/MainNavigator';
import { ScreenBackground, AppHeader, ScreenSkeleton } from '../components/ui';
import { useHeaderMetrics } from '../hooks/useHeaderMetrics';
import { colors, fonts, statusBarStyle } from '../theme';
import { toast } from '../components/ui/Toast';
import NewEconomyService from '../services/newEconomyService';

const PALETTE = ['#FE2C55', '#25F4EE', '#FFD24D', '#22C55E', '#A855F7', '#3B82F6'];

/**
 * Émission d'une monnaie communautaire — page à part entière plutôt qu'une
 * feuille modale : le formulaire (nom, symbole, prix, description, couleur)
 * mérite le même traitement que n'importe quel autre écran de création de
 * l'app, pas une boîte de dialogue.
 */
export default function CreateCurrencyScreen() {
  const navigation = useNavigation<StackNavigationProp<MainStackParamList>>();
  const { height: headerHeight } = useHeaderMetrics();

  const [pricing, setPricing] = useState<{ creationCostNf: number; minBasePriceEur: number; maxBasePriceEur: number; totalValueEur: number | null } | null>(null);
  const [loadError, setLoadError] = useState('');

  const [name, setName] = useState('');
  const [symbol, setSymbol] = useState('');
  const [description, setDescription] = useState('');
  const [color, setColor] = useState(PALETTE[0]);
  const [priceInput, setPriceInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    NewEconomyService.getCurrencyPricing()
      .then((price) => {
        setPricing(price);
        const defaultPrice = price.totalValueEur != null
          ? Math.max(price.minBasePriceEur, Math.min(price.maxBasePriceEur, 0.10))
          : price.minBasePriceEur;
        setPriceInput(String(defaultPrice));
      })
      .catch((reason) => setLoadError(reason instanceof Error ? reason.message : 'Tarification indisponible'));
  }, []);

  const numericPrice = Number(priceInput.replace(',', '.'));
  const validPrice = !!pricing && Number.isFinite(numericPrice) && numericPrice >= pricing.minBasePriceEur && numericPrice <= pricing.maxBasePriceEur;
  const estimatedSupply = validPrice && pricing?.totalValueEur != null ? Math.max(1, Math.round(pricing.totalValueEur / numericPrice)) : null;

  const canSubmit = !!pricing && name.trim().length >= 3 && symbol.trim().length >= 2 && validPrice && !busy;

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
      toast.success('Monnaie émise', {
        description: `${created?.symbol ?? symbol.trim().toUpperCase()} est en ligne.`,
      });
      navigation.goBack();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Création impossible');
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScreenBackground>
      <StatusBar barStyle={statusBarStyle()} backgroundColor={colors.bg} />
      <AppHeader navigation={navigation} title="Créer ma monnaie" subtitle="Émission communautaire" />

      {loadError !== '' && !pricing ? (
        <View style={styles.centerWrap}>
          <Text style={styles.errorText}>{loadError}</Text>
        </View>
      ) : !pricing ? (
        <ScreenSkeleton variant="detail" />
      ) : (
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={headerHeight}
        >
          <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            <Text style={styles.introText}>
              L'émission coûte <Text style={styles.introBold}>{pricing.creationCostNf.toLocaleString('fr-FR')} NF</Text>. Choisissez
              le prix de départ d'une unité : l'offre initiale est calculée pour que la capitalisation de départ égale
              exactement ce que vous payez.
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
              placeholder={`entre ${pricing.minBasePriceEur} et ${pricing.maxBasePriceEur}`}
              placeholderTextColor={colors.textMuted}
              keyboardType="decimal-pad"
            />
            {!validPrice && (
              <Text style={styles.priceHint}>Prix entre {pricing.minBasePriceEur} € et {pricing.maxBasePriceEur} €.</Text>
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
                <Text style={styles.primaryButtonText}>Émettre pour {pricing.creationCostNf.toLocaleString('fr-FR')} NF</Text>
              )}
            </TouchableOpacity>
          </ScrollView>
        </KeyboardAvoidingView>
      )}
    </ScreenBackground>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  centerWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
  body: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 40 },
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
