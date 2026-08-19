import { fonts } from '../theme';
import React, { memo, useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  ScrollView,
  Platform,
  Dimensions,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../theme';
import Avatar from './Avatar';
import PremiumDisplayName from './PremiumDisplayName';
import { type ProfileCustomization } from '../services/profileCustomizationService';
import { apiService } from '../services/api';
import type { User } from '../types/api';
import VirtualCurrencyService from '../services/virtualCurrencyService';
import { useAuth } from '../contexts/AuthContext';
import {
  effectiveSubscriptionTier,
  p2pFeeRate,
  P2P_FEE_RATE_FREE,
  P2P_FEE_RATE_SUBSCRIBER,
} from '../utils/subscriptionTier';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

const QUICK_AMOUNTS = [10, 50, 100, 500];

type Step = 'recipient' | 'amount' | 'done';

interface SendCoinsModalProps {
  visible: boolean;
  onClose: () => void;
  currencyId: string;
  symbol: string;
  balance: number;
  eurCurrencyId?: string | null;
  eurBalance?: number | null;
  /** Cours NF -> EUR courant, pour estimer le solde EUR "réellement envoyable" (voir spendableBalance ci-dessous). */
  price?: number | null;
  onSent: () => void;
}

function fmt(value: number, maxDigits = 2) {
  return value.toLocaleString('fr-FR', { maximumFractionDigits: maxDigits });
}

/**
 * Ligne de destinataire mémoïsée. Elle était du JSX inline dans un `renderItem`
 * anonyme : chaque caractère tapé dans la recherche reconstruisait toute la
 * liste des contacts, `Avatar` et `PremiumDisplayName` compris. C'est un écran
 * d'envoi d'argent — l'à-coup y est mal ressenti, parce qu'on y est déjà
 * attentif et hésitant.
 */
const RecipientRow = memo(function RecipientRow({
  user,
  onPick,
}: {
  user: User;
  onPick: (user: User) => void;
}) {
  return (
    <TouchableOpacity style={styles.userRow} onPress={() => onPick(user)} activeOpacity={0.7}>
      <Avatar size={44} username={user.username} uri={user.avatar} />
      <View style={styles.userInfo}>
        <PremiumDisplayName
          text={user.full_name || user.username}
          baseStyle={styles.userName}
          isPremium={!!(user as any)?.premium}
          subscriptionTierRaw={(user as any)?.subscription_tier}
          fontId="system"
          effectId="none"
          numberOfLines={1}
          customization={(user as any)?.profile_customization as ProfileCustomization | undefined}
          verified={!!user.verified}
          verificationStyle={(user.verification_style as any) || 'default'}
        />
        <Text style={styles.userHandle} numberOfLines={1}>@{user.username}</Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
    </TouchableOpacity>
  );
});

export default function SendCoinsModal({ visible, onClose, currencyId, symbol, balance, eurCurrencyId = null, eurBalance = null, price = null, onSent }: SendCoinsModalProps) {
  const insets = useSafeAreaInsets();
  // Le palier de l'EXPÉDITEUR décide de la commission : c'est lui qui la paie.
  // Estimation d'affichage seulement — le serveur retranche le taux qu'il a
  // lui-même résolu (voir `EconomyLedger.p2pFeeRateFor`).
  const { user: currentUser } = useAuth() as any;
  const feeRate = p2pFeeRate(
    effectiveSubscriptionTier(!!currentUser?.premium, currentUser?.subscription_tier),
    currentUser?.subscription_expires_at,
  );
  const [step, setStep] = useState<Step>('recipient');
  const [query, setQuery] = useState('');
  const [users, setUsers] = useState<User[]>([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<User | null>(null);
  const [amount, setAmount] = useState('');
  const [unit, setUnit] = useState<'NF' | 'EUR'>('NF');
  const [note, setNote] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  // Deux portefeuilles réels et distincts : envoyer en EUR envoie de VRAIS
  // EUR vers le portefeuille EUR du destinataire, sans conversion.
  const hasEurWallet = eurCurrencyId != null;
  const activeCurrencyId = unit === 'EUR' ? eurCurrencyId : currencyId;
  const activeBalance = unit === 'EUR' ? (eurBalance ?? 0) : balance;
  const activeSymbol = unit === 'EUR' ? '€' : symbol;
  // Le backend convertit automatiquement le NF manquant en EUR avant un
  // virement EUR (newEconomyController.transferCoins) : le solde
  // "réellement envoyable" en EUR inclut donc la valeur du NF détenu, pas
  // seulement le solde EUR brut — sinon ce bouton bloquait localement un
  // virement que le serveur aurait pourtant honoré.
  const spendableBalance = unit === 'EUR' && price ? (eurBalance ?? 0) + balance * price : activeBalance;

  useEffect(() => {
    if (!visible) {
      setStep('recipient');
      setQuery('');
      setUsers([]);
      setSelected(null);
      setAmount('');
      setUnit('NF');
      setNote('');
      setError('');
      setSending(false);
    }
  }, [visible]);

  useEffect(() => {
    if (!query.trim()) { setUsers([]); return; }
    setSearching(true);
    const timer = setTimeout(() => {
      apiService.searchUsers({ q: query.trim(), limit: 15 })
        .then((response) => setUsers(response.success ? response.data?.users ?? [] : []))
        .catch(() => setUsers([]))
        .finally(() => setSearching(false));
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  const numericAmount = Number(amount.replace(',', '.'));
  const validAmount = amount.trim() !== '' && Number.isFinite(numericAmount) && numericAmount > 0 && (unit === 'NF' || hasEurWallet);
  const estimatedFee = validAmount ? numericAmount * feeRate : 0;
  const estimatedNet = validAmount ? numericAmount - estimatedFee : 0;
  const insufficient = validAmount && numericAmount > spendableBalance;
  const willAutoConvert = unit === 'EUR' && validAmount && !insufficient && (eurBalance ?? 0) < numericAmount;
  const canSend = Boolean(selected) && validAmount && !insufficient && !sending && Boolean(activeCurrencyId);

  const pickRecipient = useCallback((user: User) => {
    setSelected(user);
    setError('');
    setStep('amount');
  }, []);

  /**
   * Stables : sans ça, `RecipientRow` recevrait un élément neuf à chaque
   * frappe et sa mémoïsation ne servirait à rien. Les deux corrections vont
   * ensemble, l'une sans l'autre ne change rien.
   */
  const renderRecipient = useCallback(
    ({ item }: { item: User }) => <RecipientRow user={item} onPick={pickRecipient} />,
    [pickRecipient],
  );
  const recipientKeyExtractor = useCallback((item: User) => item.id, []);

  const backToRecipient = () => {
    setStep('recipient');
    setError('');
  };

  const applyQuickAmount = (value: number) => {
    setAmount(String(Math.min(value, spendableBalance > 0 ? spendableBalance : value)));
  };

  const applyMax = () => {
    if (spendableBalance > 0) setAmount(String(spendableBalance));
  };

  const send = async () => {
    if (!selected || !canSend || !activeCurrencyId) return;
    setSending(true);
    setError('');
    try {
      await VirtualCurrencyService.transferCurrency(selected.id, activeCurrencyId, numericAmount, note.trim() || undefined);
      setStep('done');
      onSent();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Virement impossible');
    } finally {
      setSending(false);
    }
  };

  const sheetMaxHeight = useMemo(() => Math.round(SCREEN_HEIGHT * 0.9), []);

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.backdrop}>
        <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={onClose} />
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.kav}
          keyboardVerticalOffset={insets.top}
        >
          <View style={[styles.sheet, { maxHeight: sheetMaxHeight, paddingBottom: Math.max(insets.bottom, 16) }]}>
            <View style={styles.grabber} />

            <View style={styles.header}>
              {step === 'amount' && (
                <TouchableOpacity style={styles.headerSide} onPress={backToRecipient} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                  <Ionicons name="chevron-back" size={22} color={colors.textSecondary} />
                </TouchableOpacity>
              )}
              {step !== 'amount' && <View style={styles.headerSide} />}
              <Text style={styles.title}>
                {step === 'recipient' ? `Envoyer des ${symbol}` : step === 'amount' ? 'Montant' : 'Virement envoyé'}
              </Text>
              <TouchableOpacity style={styles.headerSide} onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <View style={styles.closeButton}>
                  <Ionicons name="close" size={18} color={colors.textSecondary} />
                </View>
              </TouchableOpacity>
            </View>

            {step === 'done' ? (
              <View style={styles.doneWrap}>
                <View style={styles.doneIcon}><Ionicons name="checkmark" size={30} color={colors.success} /></View>
                <Text style={styles.doneTitle}>Virement envoyé</Text>
                <Text style={styles.doneText}>
                  {fmt(numericAmount)} {activeSymbol} envoyés à @{selected?.username}.{'\n'}
                  {selected?.username ? `@${selected.username} recevra ${fmt(estimatedNet, 4)} ${activeSymbol}.` : ''}
                </Text>
                <TouchableOpacity style={styles.primaryButton} onPress={onClose}>
                  <Text style={styles.primaryButtonText}>Fermer</Text>
                </TouchableOpacity>
              </View>
            ) : step === 'recipient' ? (
              <View style={styles.body}>
                <View style={styles.searchBox}>
                  <Ionicons name="search" size={17} color={colors.textMuted} />
                  <TextInput
                    style={styles.searchInput}
                    value={query}
                    onChangeText={setQuery}
                    placeholder="Rechercher un destinataire"
                    placeholderTextColor={colors.textMuted}
                    autoCapitalize="none"
                    autoCorrect={false}
                    returnKeyType="search"
                  />
                  {searching && <ActivityIndicator size="small" color={colors.accent} />}
                  {!searching && query.length > 0 && (
                    <TouchableOpacity onPress={() => setQuery('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                      <Ionicons name="close-circle" size={16} color={colors.textMuted} />
                    </TouchableOpacity>
                  )}
                </View>

                {query.trim() === '' ? (
                  <View style={styles.hintWrap}>
                    <View style={styles.hintIcon}><Ionicons name="people" size={26} color={colors.accent} /></View>
                    <Text style={styles.hintTitle}>Qui recevra vos {symbol} ?</Text>
                    <Text style={styles.hintText}>Recherchez par nom ou @pseudo pour commencer.</Text>
                  </View>
                ) : (
                  <FlatList
                    data={users}
                    keyExtractor={recipientKeyExtractor}
                    style={styles.userList}
                    contentContainerStyle={styles.userListContent}
                    keyboardShouldPersistTaps="handled"
                    renderItem={renderRecipient}
                    ListEmptyComponent={
                      !searching ? (
                        <View style={styles.hintWrap}>
                          <Ionicons name="search-outline" size={28} color={colors.textMuted} />
                          <Text style={styles.hintText}>Aucun utilisateur trouvé pour « {query.trim()} ».</Text>
                        </View>
                      ) : null
                    }
                  />
                )}
              </View>
            ) : (
              <ScrollView
                style={styles.body}
                contentContainerStyle={styles.amountScrollContent}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
              >
                <TouchableOpacity style={styles.recipientCard} onPress={backToRecipient} activeOpacity={0.7}>
                  <Avatar size={40} username={selected?.username} uri={selected?.avatar} />
                  <View style={styles.userInfo}>
                    <PremiumDisplayName
                      text={selected?.full_name || selected?.username || ''}
                      baseStyle={styles.userName}
                      isPremium={!!(selected as any)?.premium}
                      subscriptionTierRaw={(selected as any)?.subscription_tier}
                      fontId="system"
                      effectId="none"
                      numberOfLines={1}
                      customization={(selected as any)?.profile_customization as ProfileCustomization | undefined}
                      verified={!!selected?.verified}
                      verificationStyle={(selected?.verification_style as any) || 'default'}
                    />
                    <Text style={styles.userHandle} numberOfLines={1}>À @{selected?.username}</Text>
                  </View>
                  <Text style={styles.changeLink}>Changer</Text>
                </TouchableOpacity>

                {hasEurWallet && (
                  <View style={styles.unitToggle}>
                    <TouchableOpacity style={[styles.unitButton, unit === 'NF' && styles.unitButtonActive]} onPress={() => setUnit('NF')}>
                      <Text style={[styles.unitButtonText, unit === 'NF' && styles.unitButtonTextActive]}>{symbol}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.unitButton, unit === 'EUR' && styles.unitButtonActive]} onPress={() => setUnit('EUR')}>
                      <Text style={[styles.unitButtonText, unit === 'EUR' && styles.unitButtonTextActive]}>EUR</Text>
                    </TouchableOpacity>
                  </View>
                )}

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
                  <Text style={styles.amountCurrency}>{activeSymbol}</Text>
                </View>
                <Text style={styles.balanceHint}>
                  Solde {activeSymbol} disponible : {fmt(activeBalance, 2)} {activeSymbol}
                  {unit === 'EUR' && price && balance > 0 && ` (+ ${fmt(balance * price, 2)} € convertibles depuis ${fmt(balance, 2)} ${symbol})`}
                  {spendableBalance > 0 && <Text style={styles.maxLink} onPress={applyMax}>  ·  Max</Text>}
                </Text>
                {willAutoConvert && (
                  <Text style={styles.conversionHint}>
                    Solde EUR insuffisant : {fmt(numericAmount - (eurBalance ?? 0), 2)} € seront convertis depuis ton solde {symbol} avant l’envoi.
                  </Text>
                )}

                <View style={styles.quickRow}>
                  {QUICK_AMOUNTS.filter((value) => value <= Math.max(spendableBalance, 0) || spendableBalance <= 0).map((value) => (
                    <TouchableOpacity key={value} style={styles.quickChip} onPress={() => applyQuickAmount(value)}>
                      <Text style={styles.quickChipText}>{value}</Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <TextInput
                  style={styles.noteInput}
                  value={note}
                  onChangeText={setNote}
                  placeholder="Ajouter un message (optionnel)"
                  placeholderTextColor={colors.textMuted}
                  maxLength={140}
                  returnKeyType="done"
                />

                {validAmount && (
                  <View style={styles.feeCard}>
                    <View style={styles.feeRow}>
                      <Text style={styles.feeLabel}>Frais ({(feeRate * 100).toFixed(0)} % · trésorerie)</Text>
                      <Text style={styles.feeValue}>−{fmt(estimatedFee, 4)} {activeSymbol}</Text>
                    </View>
                    <View style={styles.feeDivider} />
                    <View style={styles.feeRow}>
                      <Text style={styles.feeLabelStrong}>@{selected?.username} recevra</Text>
                      <Text style={styles.feeValueStrong}>{fmt(estimatedNet, 4)} {activeSymbol}</Text>
                    </View>
                    {/* L'argument se fait au moment où la commission est
                        chiffrée, pas dans un écran d'offre : le montant
                        économisé est là, sous les yeux, déjà calculé. */}
                    {feeRate === P2P_FEE_RATE_FREE && (
                      <View style={styles.feeUpsell}>
                        <Ionicons name="pricetag-outline" size={13} color={colors.accent} />
                        <Text style={styles.feeUpsellText}>
                          Avec Plus ou Pro, les frais tombent à{' '}
                          {(P2P_FEE_RATE_SUBSCRIBER * 100).toFixed(0)} % — tu garderais{' '}
                          {fmt(numericAmount * (P2P_FEE_RATE_FREE - P2P_FEE_RATE_SUBSCRIBER), 4)}{' '}
                          {activeSymbol} sur ce virement.
                        </Text>
                      </View>
                    )}
                  </View>
                )}

                {insufficient && (
                  <View style={styles.errorBox}>
                    <Ionicons name="alert-circle" size={16} color={colors.red} />
                    <Text style={styles.errorText}>
                      {unit === 'EUR' ? `Solde insuffisant pour ce virement (même en convertissant ton ${symbol}).` : 'Solde insuffisant pour ce virement.'}
                    </Text>
                  </View>
                )}
                {error !== '' && (
                  <View style={styles.errorBox}>
                    <Ionicons name="alert-circle" size={16} color={colors.red} />
                    <Text style={styles.errorText}>{error}</Text>
                  </View>
                )}

                <TouchableOpacity
                  style={[styles.primaryButton, !canSend && styles.primaryButtonDisabled]}
                  onPress={send}
                  disabled={!canSend}
                >
                  {sending ? <ActivityIndicator color={colors.onAccent} /> : (
                    <>
                      <Ionicons name="send" size={16} color={colors.onAccent} />
                      <Text style={styles.primaryButtonText}>Envoyer {validAmount ? `${fmt(numericAmount)} ${activeSymbol}` : ''}</Text>
                    </>
                  )}
                </TouchableOpacity>
              </ScrollView>
            )}
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: 'flex-end',
  },
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
  grabber: {
    alignSelf: 'center',
    width: 38,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.borderStrong,
    marginTop: 10,
    marginBottom: 2,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    paddingVertical: 12,
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
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  body: { flexGrow: 0, flexShrink: 1 },

  // Recherche destinataire
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginHorizontal: 16,
    marginTop: 14,
    marginBottom: 6,
    paddingHorizontal: 14,
    height: 50,
    borderRadius: 14,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  searchInput: { flex: 1, color: colors.textPrimary, fontSize: 15, paddingVertical: 0 },
  userList: { flexGrow: 0 },
  userListContent: { paddingHorizontal: 8, paddingBottom: 12 },
  userRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderRadius: 14,
  },
  userInfo: { flex: 1, minWidth: 0 },
  userName: { fontSize: 15, fontWeight: '600', fontFamily: fonts.semibold, color: colors.textPrimary },
  userHandle: { fontSize: 13, color: colors.textSecondary, marginTop: 2 },
  hintWrap: { alignItems: 'center', paddingVertical: 36, paddingHorizontal: 24, gap: 8 },
  hintIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accentSoft,
    marginBottom: 4,
  },
  hintTitle: { fontSize: 15, fontWeight: '700', fontFamily: fonts.bold, color: colors.textPrimary },
  hintText: { fontSize: 13, color: colors.textMuted, textAlign: 'center', lineHeight: 19 },

  // Étape montant
  amountScrollContent: { paddingHorizontal: 16, paddingTop: 14, paddingBottom: 20 },
  recipientCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 10,
    borderRadius: 14,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 24,
  },
  changeLink: { fontSize: 12, fontFamily: fonts.semibold, color: colors.accent },
  unitToggle: {
    flexDirection: 'row',
    alignSelf: 'flex-start',
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
    marginBottom: 18,
  },
  unitButton: { paddingHorizontal: 16, paddingVertical: 8, minHeight: 34, justifyContent: 'center' },
  unitButtonActive: { backgroundColor: colors.textPrimary },
  unitButtonText: { fontSize: 12, fontFamily: fonts.semibold, color: colors.textSecondary },
  unitButtonTextActive: { color: colors.bg },
  conversionHint: { fontSize: 12, color: colors.textMuted, marginTop: 6, lineHeight: 17 },
  // Saisie alignée à gauche, comme le solde du portefeuille : le montant tapé
  // et le montant affiché se lisent sur le même axe.
  amountHero: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 8,
  },
  amountCurrency: { fontSize: 17, fontFamily: fonts.bold, color: colors.textMuted },
  amountInput: {
    flex: 1,
    minWidth: 60,
    fontSize: 48,
    fontFamily: fonts.displayHeavy,
    color: colors.textPrimary,
    letterSpacing: -1.5,
    textAlign: 'left',
    paddingVertical: 4,
  },
  balanceHint: { fontSize: 12.5, color: colors.textMuted, marginTop: 6, lineHeight: 18 },
  maxLink: { color: colors.accent, fontFamily: fonts.bold },
  quickRow: { flexDirection: 'row', gap: 8, marginTop: 18 },
  quickChip: {
    paddingHorizontal: 16,
    paddingVertical: 9,
    minHeight: 38,
    justifyContent: 'center',
    borderRadius: 999,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  quickChipText: { color: colors.textPrimary, fontSize: 13, fontFamily: fonts.semibold },
  noteInput: {
    marginTop: 20,
    paddingHorizontal: 14,
    height: 50,
    borderRadius: 14,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    color: colors.textPrimary,
    fontSize: 14,
  },
  feeCard: {
    marginTop: 20,
    padding: 14,
    borderRadius: 14,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  feeRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 },
  feeLabel: { fontSize: 13, color: colors.textSecondary, fontFamily: fonts.regular },
  feeValue: { fontSize: 13, color: colors.textSecondary, fontFamily: fonts.semibold },
  feeDivider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginVertical: 11 },
  feeLabelStrong: { fontSize: 14, color: colors.textPrimary, fontFamily: fonts.semibold },
  feeValueStrong: { fontSize: 15, color: colors.textPrimary, fontFamily: fonts.bold },
  feeUpsell: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 7,
    marginTop: 12,
    paddingTop: 11,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  feeUpsellText: { flex: 1, fontSize: 11.5, lineHeight: 16, color: colors.textMuted },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 14,
    padding: 12,
    borderRadius: 12,
    backgroundColor: colors.redMuted,
  },
  errorText: { flex: 1, fontSize: 13, color: colors.red, fontWeight: '500' },
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 20,
    height: 52,
    borderRadius: 16,
    backgroundColor: colors.accent,
  },
  primaryButtonDisabled: { opacity: 0.4 },
  primaryButtonText: { fontSize: 15, fontWeight: '700', fontFamily: fonts.bold, color: colors.onAccent },

  // Étape confirmation
  doneWrap: { alignItems: 'center', padding: 32 },
  doneIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.successMuted,
    marginBottom: 16,
  },
  doneTitle: { fontSize: 18, fontWeight: '700', fontFamily: fonts.bold, color: colors.textPrimary, marginBottom: 8 },
  doneText: { fontSize: 14, color: colors.textSecondary, textAlign: 'center', lineHeight: 20, marginBottom: 22 },
});
