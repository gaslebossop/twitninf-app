import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { GestureDetector } from 'react-native-gesture-handler';
import Animated from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { colors, fonts, statusBarStyle, withAlpha } from '../theme';
import { ScreenBackground, BackButton, ScreenSkeleton, Tappable } from '../components/ui';
import { toast } from '../components/ui/Toast';
import { confirmAsync } from '../components/ui/ConfirmSheet';
import useSheetGesture from '../hooks/useSheetGesture';
import forgeService, {
  AREAS,
  DECISIONS,
  ProposalStatus,
  QueuedProposal,
  REWARD_PRESETS,
  STATUS_LABELS,
} from '../services/forgeService';

/**
 * La file de la Forge — côté staff.
 *
 * ── Ce que cet écran expose, et ce qu'il n'expose pas ─────────────────────
 * Des ACTIONS, jamais le modèle de données. On ne choisit pas une valeur
 * d'ENUM (`built`), on choisit « Construite — verser » : le libellé dit ce qui
 * va se passer, y compris qu'il y a un mouvement d'argent au bout.
 *
 * ── Le versement ──────────────────────────────────────────────────────────
 * C'est la seule action de cet écran qui déplace de l'argent réel, et elle
 * est irréversible : le grand livre n'annule pas. Elle passe donc par une
 * confirmation qui répète le MONTANT et le DESTINATAIRE — pas un « êtes-vous
 * sûr ? », qui ne fait relire personne.
 */

const FILTERS: ProposalStatus[] = ['received', 'reviewing', 'accepted', 'built', 'declined'];

const areaLabel = (key: string) => AREAS.find((a) => a.key === key)?.label || 'Autre';

function DecisionSheet({
  item,
  onClose,
  onDone,
}: {
  item: QueuedProposal;
  onClose: () => void;
  onDone: () => void;
}) {
  const [status, setStatus] = useState<ProposalStatus>('reviewing');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const { gesture, sheetStyle, scrimStyle, open, close } = useSheetGesture({
    onClosed: onClose,
    travel: 460,
  });

  useEffect(() => {
    open();
  }, [open]);

  const decision = DECISIONS.find((d) => d.status === status)!;
  const value = Number(amount);
  const amountOk = !decision.pays || (Number.isFinite(value) && value > 0);
  const noteOk = !decision.needsNote || note.trim().length > 0;
  const ready = amountOk && noteOk && !busy;

  const apply = useCallback(async () => {
    if (!ready) return;

    if (decision.pays) {
      // Le grand livre n'annule pas. La confirmation répète ce qui compte —
      // combien, et à qui — plutôt que de demander une confiance générale.
      const ok = await confirmAsync({
        title: `Verser ${value} NF ?`,
        message: `@${item.author?.username ?? 'auteur'} recevra ${value} NF immédiatement. Un versement ne s’annule pas.`,
        confirmLabel: 'Verser',
        destructive: false,
      });
      if (!ok) return;
    }

    setBusy(true);
    const result = await forgeService.decideProposal(item.id, {
      status,
      reward_nf: decision.pays ? value : undefined,
      note: note.trim() || undefined,
    });
    setBusy(false);

    if (!result.success) {
      toast.error(result.message || 'Décision impossible');
      return;
    }
    toast.success(
      decision.pays ? `${value} NF versés` : `Idée ${STATUS_LABELS[status].toLowerCase()}`,
    );
    onDone();
    close();
  }, [ready, decision, value, item, status, note, onDone, close]);

  return (
    <View style={styles.sheetHost}>
      <Animated.View style={[styles.scrim, scrimStyle]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={() => close()} />
      </Animated.View>

      <GestureDetector gesture={gesture}>
        <Animated.View style={[styles.sheet, sheetStyle]}>
          <View style={styles.grabber} />
          <ScrollView
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            automaticallyAdjustKeyboardInsets
            contentContainerStyle={styles.sheetContent}
          >
            <Text style={styles.sheetTitle}>{item.title}</Text>
            <Text style={styles.sheetMeta}>
              @{item.author?.username ?? '—'} · {areaLabel(item.area)}
            </Text>
            <Text style={styles.sheetBody}>{item.body}</Text>

            <Text style={styles.label}>Décision</Text>
            <View style={styles.chipRow}>
              {DECISIONS.map((option) => {
                const active = status === option.status;
                return (
                  <Tappable
                    key={option.status}
                    haptic="select"
                    onPress={() => setStatus(option.status)}
                    style={[
                      styles.chip,
                      active && {
                        borderColor: colors.accent,
                        backgroundColor: withAlpha(colors.accent, 0.14),
                      },
                    ]}
                  >
                    <Ionicons
                      name={option.icon as any}
                      size={14}
                      color={active ? colors.accent : colors.textSecondary}
                    />
                    <Text style={[styles.chipText, active && { color: colors.textPrimary }]}>
                      {option.label}
                    </Text>
                  </Tappable>
                );
              })}
            </View>

            {decision.pays && (
              <>
                <Text style={styles.label}>Récompense</Text>
                <View style={styles.chipRow}>
                  {REWARD_PRESETS.map((preset) => (
                    <Tappable
                      key={preset}
                      haptic="select"
                      onPress={() => setAmount(String(preset))}
                      style={[
                        styles.chip,
                        value === preset && {
                          borderColor: colors.gold,
                          backgroundColor: withAlpha(colors.gold, 0.14),
                        },
                      ]}
                    >
                      <Text style={styles.presetText}>{preset} NF</Text>
                    </Tappable>
                  ))}
                </View>
                <TextInput
                  style={styles.input}
                  value={amount}
                  onChangeText={setAmount}
                  placeholder="Ou un autre montant"
                  placeholderTextColor={colors.textMuted}
                  keyboardType="number-pad"
                />
              </>
            )}

            <Text style={styles.label}>
              Mot à l’auteur{decision.needsNote ? '' : ' (facultatif)'}
            </Text>
            <TextInput
              style={styles.textarea}
              value={note}
              onChangeText={setNote}
              placeholder={
                decision.needsNote
                  ? 'Pourquoi elle ne sera pas construite. Il le lira.'
                  : 'Ce que tu veux lui dire.'
              }
              placeholderTextColor={colors.textMuted}
              multiline
            />
            {decision.needsNote && !noteOk && (
              <Text style={styles.warn}>Un refus doit être motivé — le serveur le refusera.</Text>
            )}

            <Tappable
              onPress={apply}
              disabled={!ready}
              style={[
                styles.apply,
                { backgroundColor: decision.pays ? colors.gold : colors.accent },
                !ready && styles.applyOff,
              ]}
            >
              <Text style={[styles.applyText, decision.pays && { color: '#1A1400' }]}>
                {busy ? 'En cours…' : decision.pays ? `Verser ${value || 0} NF` : 'Enregistrer'}
              </Text>
            </Tappable>
          </ScrollView>
        </Animated.View>
      </GestureDetector>
    </View>
  );
}

export default function ForgeReviewScreen({ navigation }: any) {
  const [filter, setFilter] = useState<ProposalStatus>('received');
  const [rows, setRows] = useState<QueuedProposal[]>([]);
  const [loading, setLoading] = useState(true);
  const [active, setActive] = useState<QueuedProposal | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await forgeService.fetchQueue(filter);
    if (res.success) setRows(res.data || []);
    else toast.error(res.message || 'Lecture impossible');
    setLoading(false);
  }, [filter]);

  useEffect(() => {
    load();
  }, [load]);

  const empty = useMemo(
    () =>
      filter === 'received'
        ? 'Rien à traiter. La file est vide.'
        : `Aucune idée ${STATUS_LABELS[filter].toLowerCase()}.`,
    [filter],
  );

  return (
    <ScreenBackground>
      <SafeAreaView style={styles.flex}>
        <StatusBar barStyle={statusBarStyle()} backgroundColor="transparent" translucent />

        <View style={styles.header}>
          <BackButton navigation={navigation} />
          <Text style={styles.headerTitle}>File de la Forge</Text>
          <View style={styles.headerSpacer} />
        </View>

        {/* La bande doit être bornée ET empêchée de grandir, et ses pastilles
            centrées : l'axe vertical est l'axe TRANSVERSE d'une liste
            horizontale, et son défaut est `stretch`. Sans ça, la bande prend
            toute la hauteur restante et chaque pastille s'étire dessus. */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.filterBar}
          contentContainerStyle={styles.filters}
        >
          {FILTERS.map((key) => {
            const on = filter === key;
            return (
              <Tappable
                key={key}
                haptic="select"
                onPress={() => setFilter(key)}
                style={[
                  styles.chip,
                  on && {
                    borderColor: colors.accent,
                    backgroundColor: withAlpha(colors.accent, 0.14),
                  },
                ]}
              >
                <Text style={[styles.chipText, on && { color: colors.textPrimary }]}>
                  {STATUS_LABELS[key]}
                </Text>
              </Tappable>
            );
          })}
        </ScrollView>

        {loading ? (
          <ScreenSkeleton variant="list" />
        ) : (
          <ScrollView style={styles.flex} contentContainerStyle={styles.list}>
            {rows.length === 0 ? (
              <Text style={styles.empty}>{empty}</Text>
            ) : (
              rows.map((item) => (
                <Tappable key={item.id} onPress={() => setActive(item)} style={styles.row}>
                  <View style={styles.rowHead}>
                    <Text style={styles.rowTitle} numberOfLines={2}>
                      {item.title}
                    </Text>
                    {item.reward_nf !== null && (
                      <Text style={styles.rowReward}>{item.reward_nf} NF</Text>
                    )}
                  </View>
                  <Text style={styles.rowMeta}>
                    @{item.author?.username ?? '—'} · {areaLabel(item.area)}
                  </Text>
                  <Text style={styles.rowBody} numberOfLines={2}>
                    {item.body}
                  </Text>
                </Tappable>
              ))
            )}
          </ScrollView>
        )}

        {active && (
          <DecisionSheet
            item={active}
            onClose={() => setActive(null)}
            onDone={load}
          />
        )}
      </SafeAreaView>
    </ScreenBackground>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  headerTitle: { color: colors.textPrimary, fontSize: 17, fontFamily: fonts.display },
  headerSpacer: { width: 60 },

  /**
   * Mêmes valeurs que les barres de filtres de `ContentModerationScreen` et
   * `ModerationHistoryScreen` : `maxHeight` borne la bande, `flexGrow: 0`
   * l'empêche de prendre la place restante. L'app avait déjà résolu ce
   * problème ; ma version maison ne faisait que le résoudre à moitié.
   */
  filterBar: { maxHeight: 44, flexGrow: 0, marginBottom: 6 },
  filters: { paddingHorizontal: 16, gap: 8, alignItems: 'center' },
  list: { paddingHorizontal: 16, paddingBottom: 40 },
  empty: { color: colors.textMuted, fontSize: 13, marginTop: 24 },

  row: {
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: 14,
    marginBottom: 10,
  },
  rowHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  rowTitle: { flex: 1, color: colors.textPrimary, fontSize: 14.5, fontFamily: fonts.semibold },
  rowReward: { color: colors.gold, fontFamily: fonts.mono, fontSize: 12.5 },
  rowMeta: { color: colors.textMuted, fontSize: 12, marginTop: 4 },
  rowBody: { color: colors.textSecondary, fontSize: 13, lineHeight: 19, marginTop: 8 },

  sheetHost: { ...StyleSheet.absoluteFillObject, justifyContent: 'flex-end' },
  scrim: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.55)' },
  sheet: {
    backgroundColor: colors.bgElevated,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    maxHeight: '90%',
  },
  grabber: {
    alignSelf: 'center',
    width: 38,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    marginTop: 10,
  },
  sheetContent: { padding: 18, paddingBottom: 30 },
  sheetTitle: { color: colors.textPrimary, fontSize: 18, fontFamily: fonts.display },
  sheetMeta: { color: colors.textMuted, fontSize: 12.5, marginTop: 4 },
  sheetBody: {
    color: colors.textSecondary,
    fontSize: 14,
    lineHeight: 21,
    marginTop: 14,
  },

  label: {
    color: colors.textSecondary,
    fontSize: 12.5,
    fontFamily: fonts.semibold,
    marginTop: 20,
    marginBottom: 8,
  },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  chipText: { color: colors.textSecondary, fontSize: 13, fontFamily: fonts.medium },
  presetText: { color: colors.textSecondary, fontSize: 13, fontFamily: fonts.mono },

  input: {
    marginTop: 10,
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: colors.textPrimary,
    fontSize: 14,
    fontFamily: fonts.mono,
  },
  textarea: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    padding: 14,
    color: colors.textPrimary,
    fontSize: 14,
    minHeight: 90,
    textAlignVertical: 'top',
  },
  warn: { color: colors.red, fontSize: 12, marginTop: 8 },

  apply: { marginTop: 24, borderRadius: 14, paddingVertical: 14, alignItems: 'center' },
  applyOff: { opacity: 0.45 },
  applyText: { color: '#FFFFFF', fontSize: 15, fontFamily: fonts.bold },
});
