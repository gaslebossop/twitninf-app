import React, { useEffect, useMemo, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors, statusBarStyle } from '../theme';
import {
  ScreenBackground,
  BackButton,
  Button,
  Card,
  Tappable,
  toast,
} from '../components/ui';
import {
  ContestCurrency,
  createContest,
  fetchCurrencies,
  formatAmount,
} from '../services/contestService';

/**
 * Création d'un concours : un tweet et sa cagnotte, publiés ensemble.
 *
 * ── Durée par paliers, pas de sélecteur de date ──────────────────────────
 * Un concours se pense en « ça dure 24 h », pas en « ça finit le 15/08 à
 * 19 h 42 ». Les paliers évitent le sélecteur de date natif (deux rendus
 * différents iOS/Android, et le piège du fuseau horaire), et rendent
 * impossible de créer par erreur un concours qui se termine dans le passé.
 *
 * ── Monnaies réelles, jamais saisies à la main ───────────────────────────
 * La liste vient du serveur : NF, l'EUR interne et les monnaies
 * communautaires actives, chacune avec le solde de l'organisateur. Laisser
 * taper un code libre revenait à promettre une somme dans une devise que
 * personne ne peut verser.
 *
 * ── La cagnotte est prélevée à la publication ────────────────────────────
 * `montant × gagnants` quitte le portefeuille tout de suite. L'écran affiche
 * donc ce total et le solde restant AVANT l'appui : découvrir le
 * prélèvement après coup serait la pire surprise possible.
 */

const DURATIONS = [
  { label: '1 h', hours: 1 },
  { label: '6 h', hours: 6 },
  { label: '24 h', hours: 24 },
  { label: '3 j', hours: 72 },
  { label: '7 j', hours: 168 },
];

export default function CreateContestScreen({ navigation }: any) {
  const [content, setContent] = useState('');
  const [amount, setAmount] = useState('');
  const [currencies, setCurrencies] = useState<ContestCurrency[]>([]);
  const [currencyId, setCurrencyId] = useState<string | null>(null);
  const [loadingCurrencies, setLoadingCurrencies] = useState(true);
  const [note, setNote] = useState('');
  const [winners, setWinners] = useState('1');
  const [hours, setHours] = useState(24);
  const [submitting, setSubmitting] = useState(false);

  const [followCreator, setFollowCreator] = useState(true);
  const [likeTweet, setLikeTweet] = useState(true);
  const [retweetTweet, setRetweetTweet] = useState(false);
  const [replyTweet, setReplyTweet] = useState(false);
  const [minAge, setMinAge] = useState('0');

  const parsedAmount = Number.parseFloat(amount.replace(',', '.'));
  const parsedWinners = Number.parseInt(winners, 10) || 1;

  useEffect(() => {
    fetchCurrencies()
      .then(({ currencies: list }) => {
        setCurrencies(list);
        // Sélection par défaut : la monnaie où il y a le plus de quoi
        // financer, sinon la première. Ouvrir sur une monnaie à 0 de solde
        // donnerait un « il te manque X » dès la première frappe.
        const best = [...list].sort((a, b) => b.balance - a.balance)[0];
        setCurrencyId((best ?? list[0])?.id ?? null);
      })
      .catch(() => toast.error('Monnaies indisponibles', {
        description: 'Vérifie ta connexion et rouvre cet écran.',
      }))
      .finally(() => setLoadingCurrencies(false));
  }, []);

  const currency = useMemo(
    () => currencies.find((c) => c.id === currencyId) ?? null,
    [currencies, currencyId]
  );

  // Le gain est PAR gagnant : c'est le total qui est débité, et c'est lui
  // qu'il faut montrer.
  const total = Number.isFinite(parsedAmount) && parsedAmount > 0
    ? parsedAmount * parsedWinners
    : 0;
  const balance = currency?.balance ?? 0;
  const missing = Math.max(0, total - balance);

  const submit = async () => {
    if (submitting) return;

    // Contrôles côté app pour dire tout de suite ce qui manque ; le serveur
    // refait les mêmes, c'est lui qui fait autorité.
    if (!content.trim()) {
      toast.error('Écris le texte du concours', {
        description: 'C’est ce que les gens verront dans le fil.',
      });
      return;
    }
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      toast.error('Indique le montant mis en jeu');
      return;
    }
    if (!currency) {
      toast.error('Choisis la monnaie de la cagnotte');
      return;
    }
    if (parsedWinners < 1 || parsedWinners > 100) {
      toast.error('Entre 1 et 100 gagnants');
      return;
    }
    // Contrôle de confort : le serveur refait le calcul sous verrou, c'est
    // lui qui fait autorité. Ça évite juste un aller-retour pour rien.
    if (missing > 0) {
      toast.error(`Il te manque ${formatAmount(missing)} ${currency.symbol}`, {
        description: `La cagnotte (${formatAmount(total)} ${currency.symbol}) est prélevée dès la publication.`,
      });
      return;
    }

    setSubmitting(true);
    try {
      const { contest } = await createContest({
        content: content.trim(),
        prizeAmount: parsedAmount,
        currencyId: currency.id,
        prizeNote: note.trim() || null,
        winnersCount: parsedWinners,
        endsAt: new Date(Date.now() + hours * 3_600_000),
        conditions: {
          follow_creator: followCreator,
          like_tweet: likeTweet,
          retweet_tweet: retweetTweet,
          reply_tweet: replyTweet,
          min_account_age_days: Number.parseInt(minAge, 10) || 0,
          min_followers: 0,
        },
      });
      toast.success('Concours publié', {
        description: `${formatAmount(total)} ${currency.symbol} mis de côté. Le tirage et le versement se feront tout seuls à la fin.`,
      });
      // `replace` et pas `navigate` : revenir en arrière sur le formulaire
      // d'un concours déjà publié invite à le republier.
      navigation.replace('Contest', { contestId: contest.id });
    } catch (error) {
      toast.error((error as Error).message || 'Publication impossible.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ScreenBackground>
      <StatusBar barStyle={statusBarStyle()} />
      <SafeAreaView style={S.flex}>
        <View style={S.header}>
          <BackButton navigation={navigation} />
          <Text style={S.headerTitle}>Nouveau concours</Text>
          <View style={S.headerSpacer} />
        </View>

        <KeyboardAvoidingView
          style={S.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <ScrollView contentContainerStyle={S.scroll} keyboardShouldPersistTaps="handled">
            {/* --- Le tweet --- */}
            <Text style={S.label}>Texte du concours</Text>
            <TextInput
              style={S.textarea}
              value={content}
              onChangeText={setContent}
              placeholder="Ex : 50 € à gagner pour fêter les 10k abonnés 🎉"
              placeholderTextColor={colors.textMuted}
              multiline
              maxLength={500}
            />
            <Text style={S.counter}>{content.length}/500</Text>

            {/* --- Cagnotte --- */}
            <Text style={S.label}>Monnaie de la cagnotte</Text>
            {loadingCurrencies ? (
              <Text style={S.help}>Chargement des monnaies...</Text>
            ) : currencies.length === 0 ? (
              <Text style={S.help}>Aucune monnaie disponible sur ton compte.</Text>
            ) : (
              <View style={S.currencyList}>
                {currencies.map((c) => {
                  const active = c.id === currencyId;
                  return (
                    <Tappable
                      key={c.id}
                      style={[S.currencyRow, active && S.currencyRowActive]}
                      onPress={() => setCurrencyId(c.id)}
                    >
                      <View
                        style={[S.currencyDot, { backgroundColor: c.color || colors.accent }]}
                      />
                      <View style={S.currencyText}>
                        <Text style={S.currencyName}>
                          {c.symbol}
                          {c.is_community ? '  \u00b7  communautaire' : ''}
                        </Text>
                        <Text style={S.currencyBalance}>
                          solde {formatAmount(c.balance)} {c.symbol}
                        </Text>
                      </View>
                      {active && (
                        <Ionicons name="checkmark-circle" size={18} color={colors.accent} />
                      )}
                    </Tappable>
                  );
                })}
              </View>
            )}

            <Text style={S.label}>Montant par gagnant</Text>
            <View style={S.row}>
              <TextInput
                style={[S.input, S.amountInput]}
                value={amount}
                onChangeText={setAmount}
                placeholder="50"
                placeholderTextColor={colors.textMuted}
                keyboardType="decimal-pad"
              />
              <View style={[S.input, S.currencyBadge]}>
                <Text style={S.currencyBadgeText}>{currency?.symbol ?? '-'}</Text>
              </View>
            </View>

            <TextInput
              style={S.input}
              value={note}
              onChangeText={setNote}
              placeholder="Précision (ex : par gagnant, versé par PayPal)"
              placeholderTextColor={colors.textMuted}
              maxLength={160}
            />

            {/* --- Gagnants et durée --- */}
            <View style={S.row}>
              <View style={S.half}>
                <Text style={S.label}>Gagnants</Text>
                <TextInput
                  style={S.input}
                  value={winners}
                  onChangeText={setWinners}
                  keyboardType="number-pad"
                  maxLength={3}
                />
              </View>
              <View style={S.half}>
                <Text style={S.label}>Durée</Text>
                <View style={S.chips}>
                  {DURATIONS.map((d) => (
                    <Chip
                      key={d.hours}
                      label={d.label}
                      active={hours === d.hours}
                      onPress={() => setHours(d.hours)}
                    />
                  ))}
                </View>
              </View>
            </View>

            {/* --- Conditions --- */}
            <Text style={S.label}>Conditions de participation</Text>
            <Card padding={4}>
              <Toggle label="Suivre mon compte" value={followCreator} onChange={setFollowCreator} />
              <Toggle label="Aimer le tweet" value={likeTweet} onChange={setLikeTweet} />
              <Toggle label="Retweeter" value={retweetTweet} onChange={setRetweetTweet} />
              <Toggle label="Répondre au tweet" value={replyTweet} onChange={setReplyTweet} />
            </Card>

            <Text style={S.label}>Ancienneté minimum du compte (jours)</Text>
            <TextInput
              style={S.input}
              value={minAge}
              onChangeText={setMinAge}
              keyboardType="number-pad"
              maxLength={4}
            />
            <Text style={S.help}>
              Un minimum d’ancienneté écarte les comptes créés pour l’occasion. 0 = aucune limite.
            </Text>

            {/* --- Récapitulatif --- */}
            <Card style={S.summary}>
              <Text style={S.summaryTitle}>Preleve a la publication</Text>
              <Text style={[S.summaryLine, missing > 0 && S.summaryLineBad]}>
                {total > 0 && currency ? `${formatAmount(total)} ${currency.symbol}` : '-'}
              </Text>
              <Text style={S.summaryDetail}>
                {total > 0 && currency
                  ? `${formatAmount(parsedAmount)} x ${parsedWinners} gagnant${
                      parsedWinners > 1 ? 's' : ''
                    } \u00b7 tirage dans ${DURATIONS.find((d) => d.hours === hours)?.label}`
                  : 'Saisis un montant pour voir le total.'}
              </Text>

              {currency && total > 0 && (
                <Text style={[S.summaryNote, missing > 0 && S.summaryLineBad]}>
                  {missing > 0
                    ? `Il te manque ${formatAmount(missing)} ${currency.symbol} (solde ${formatAmount(balance)}).`
                    : `Solde apres publication : ${formatAmount(balance - total)} ${currency.symbol}.`}
                </Text>
              )}

              <Text style={S.summaryNote}>
                La cagnotte quitte ton portefeuille maintenant et attend le tirage. Les gagnants
                sont credites automatiquement ; s'il y a moins de gagnants eligibles que prevu, la
                part non attribuee te revient.
              </Text>
            </Card>

            <Button
              label={
                submitting
                  ? 'Publication...'
                  : total > 0 && currency
                    ? `Publier et bloquer ${formatAmount(total)} ${currency.symbol}`
                    : 'Publier le concours'
              }
              onPress={submit}
              loading={submitting}
              disabled={submitting}
              style={S.submit}
            />
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </ScreenBackground>
  );
}

function Chip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Tappable style={[S.chip, active && S.chipActive]} onPress={onPress}>
      <Text style={[S.chipText, active && S.chipTextActive]}>{label}</Text>
    </Tappable>
  );
}

function Toggle({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <View style={S.toggleRow}>
      <Text style={S.toggleLabel}>{label}</Text>
      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{ false: colors.border, true: colors.accentMuted }}
        thumbColor={value ? colors.accent : colors.textMuted}
      />
    </View>
  );
}

const S = StyleSheet.create({
  flex: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 16,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  headerSpacer: { width: 40 },

  scroll: { paddingHorizontal: 16, paddingBottom: 48 },

  label: {
    marginTop: 18,
    marginBottom: 8,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color: colors.textMuted,
  },
  input: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: colors.overlaySoft,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    color: colors.textPrimary,
    fontSize: 15,
  },
  textarea: {
    minHeight: 96,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: colors.overlaySoft,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    color: colors.textPrimary,
    fontSize: 15,
    textAlignVertical: 'top',
  },
  counter: {
    marginTop: 5,
    textAlign: 'right',
    fontSize: 11,
    color: colors.textMuted,
  },

  row: { flexDirection: 'row', gap: 10 },
  half: { flex: 1 },
  amountInput: { flex: 2 },
  currencyBadge: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  currencyBadgeText: { fontSize: 15, fontWeight: '700', color: colors.textSecondary },

  currencyList: { gap: 6 },
  currencyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: colors.overlaySoft,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
  },
  currencyRowActive: { borderColor: colors.accent, backgroundColor: colors.accentMuted },
  currencyDot: { width: 10, height: 10, borderRadius: 5 },
  currencyText: { flex: 1 },
  currencyName: { fontSize: 14, fontWeight: '700', color: colors.textPrimary },
  currencyBalance: { fontSize: 11.5, color: colors.textMuted },

  summaryDetail: { marginTop: 4, fontSize: 12.5, color: colors.textSecondary },
  summaryLineBad: { color: colors.red },

  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 10, marginBottom: 4 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: colors.overlaySoft,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
  },
  chipActive: { backgroundColor: colors.accentMuted, borderColor: colors.accent },
  chipText: { fontSize: 12.5, fontWeight: '600', color: colors.textSecondary },
  chipTextActive: { color: colors.accent },

  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  toggleLabel: { fontSize: 14, color: colors.textPrimary },

  help: { marginTop: 7, fontSize: 11.5, lineHeight: 16, color: colors.textMuted },

  summary: { marginTop: 24, padding: 16 },
  summaryTitle: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: colors.textMuted,
  },
  summaryLine: {
    marginTop: 7,
    fontSize: 16,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  summaryNote: {
    marginTop: 9,
    fontSize: 11.5,
    lineHeight: 17,
    color: colors.textMuted,
  },

  submit: { marginTop: 20 },
});
