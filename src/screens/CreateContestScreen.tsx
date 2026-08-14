import React, { useMemo, useState } from 'react';
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
import { colors, statusBarStyle } from '../theme';
import {
  ScreenBackground,
  BackButton,
  Button,
  Card,
  Tappable,
  toast,
} from '../components/ui';
import { createContest, formatPrize } from '../services/contestService';

/**
 * Création d'un concours : un tweet et sa cagnotte, publiés ensemble.
 *
 * ── Durée par paliers, pas de sélecteur de date ──────────────────────────
 * Un concours se pense en « ça dure 24 h », pas en « ça finit le 15/08 à
 * 19 h 42 ». Les paliers évitent le sélecteur de date natif (deux rendus
 * différents iOS/Android, et le piège du fuseau horaire), et rendent
 * impossible de créer par erreur un concours qui se termine dans le passé.
 *
 * ── Devise libre ─────────────────────────────────────────────────────────
 * Le champ accepte n'importe quel code court (EUR, USD, XAF, NF…) : la
 * plateforme ne convertit rien et ne détient rien, elle affiche ce que
 * l'organisateur annonce. Les paliers proposés ne sont qu'un raccourci.
 */

const DURATIONS = [
  { label: '1 h', hours: 1 },
  { label: '6 h', hours: 6 },
  { label: '24 h', hours: 24 },
  { label: '3 j', hours: 72 },
  { label: '7 j', hours: 168 },
];

const CURRENCIES = ['EUR', 'USD', 'XAF', 'NF'];

export default function CreateContestScreen({ navigation }: any) {
  const [content, setContent] = useState('');
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState('EUR');
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

  const preview = useMemo(() => {
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) return null;
    return formatPrize({ prize_amount: parsedAmount, prize_currency: currency });
  }, [parsedAmount, currency]);

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
    if (!/^[A-Za-z0-9]{2,8}$/.test(currency.trim())) {
      toast.error('Devise invalide', {
        description: 'Un code court en lettres ou chiffres : EUR, USD, XAF, NF…',
      });
      return;
    }
    if (parsedWinners < 1 || parsedWinners > 100) {
      toast.error('Entre 1 et 100 gagnants');
      return;
    }

    setSubmitting(true);
    try {
      const { contest } = await createContest({
        content: content.trim(),
        prizeAmount: parsedAmount,
        prizeCurrency: currency.trim().toUpperCase(),
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
        description: 'Le tirage se fera tout seul à la fin du compte à rebours.',
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
            <Text style={S.label}>Montant mis en jeu</Text>
            <View style={S.row}>
              <TextInput
                style={[S.input, S.amountInput]}
                value={amount}
                onChangeText={setAmount}
                placeholder="50"
                placeholderTextColor={colors.textMuted}
                keyboardType="decimal-pad"
              />
              <TextInput
                style={[S.input, S.currencyInput]}
                value={currency}
                onChangeText={(v) => setCurrency(v.toUpperCase().slice(0, 8))}
                placeholder="EUR"
                placeholderTextColor={colors.textMuted}
                autoCapitalize="characters"
                maxLength={8}
              />
            </View>
            <View style={S.chips}>
              {CURRENCIES.map((code) => (
                <Chip
                  key={code}
                  label={code}
                  active={currency === code}
                  onPress={() => setCurrency(code)}
                />
              ))}
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
              <Text style={S.summaryTitle}>Ce qui sera publié</Text>
              <Text style={S.summaryLine}>
                {preview ?? '—'} · {parsedWinners} gagnant{parsedWinners > 1 ? 's' : ''} · tirage
                dans {DURATIONS.find((d) => d.hours === hours)?.label}
              </Text>
              <Text style={S.summaryNote}>
                Le tirage est automatique et vérifiable : l’ordre est calculé à partir d’une graine
                publiée après coup. Tu verses toi-même la cagnotte au(x) gagnant(s) — TwitNinf
                n’encaisse rien.
              </Text>
            </Card>

            <Button
              label={submitting ? 'Publication…' : 'Publier le concours'}
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
  currencyInput: { flex: 1, textAlign: 'center', fontWeight: '700' },

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
