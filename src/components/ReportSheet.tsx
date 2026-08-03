import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, fonts, withAlpha } from '../theme';
import {
  reportService,
  ReportCategory,
  ReportCategoryKey,
  ReportTargetType,
} from '../services/reportService';

/**
 * Feuille de signalement — surface unique pour toute l'app.
 *
 * Remplace le champ de texte libre : choisir dans une liste demande un geste,
 * écrire un motif en demande dix. Le texte libre reste possible, mais en
 * complément facultatif (obligatoire uniquement pour « Autre »).
 *
 * La gravité n'est plus envoyée par le client — le serveur la calcule à
 * partir de la catégorie, de la fiabilité du signaleur et du nombre de
 * signaleurs distincts.
 */

type Phase = 'picking' | 'detailing' | 'sending' | 'done';

interface Props {
  visible: boolean;
  onClose: () => void;
  targetId: string;
  targetType: ReportTargetType;
  /** Affiché en sous-titre : « @pseudo » ou un extrait du contenu. */
  targetLabel?: string;
  onReported?: () => void;
}

/** Icône par catégorie — repère visuel pour scanner la liste sans tout lire. */
const ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  spam: 'mail-unread-outline',
  harassment: 'hand-left-outline',
  hate_speech: 'flame-outline',
  violence: 'warning-outline',
  sexual_content: 'eye-off-outline',
  child_safety: 'shield-outline',
  self_harm: 'heart-dislike-outline',
  impersonation: 'person-remove-outline',
  privacy: 'lock-closed-outline',
  misinformation: 'information-circle-outline',
  illegal: 'ban-outline',
  other: 'ellipsis-horizontal-circle-outline',
};

const ReportSheet: React.FC<Props> = ({
  visible,
  onClose,
  targetId,
  targetType,
  targetLabel,
  onReported,
}) => {
  const insets = useSafeAreaInsets();
  const [categories, setCategories] = useState<ReportCategory[]>([]);
  const [loadingCats, setLoadingCats] = useState(false);
  const [selected, setSelected] = useState<ReportCategory | null>(null);
  const [details, setDetails] = useState('');
  const [phase, setPhase] = useState<Phase>('picking');
  const [result, setResult] = useState<{
    ok: boolean;
    title: string;
    message: string;
    support?: boolean;
  } | null>(null);

  // Remise à zéro à chaque ouverture : rouvrir la feuille ne doit pas
  // ressusciter le choix précédent.
  useEffect(() => {
    if (!visible) return;
    setSelected(null);
    setDetails('');
    setPhase('picking');
    setResult(null);

    let cancelled = false;
    setLoadingCats(true);
    reportService
      .getCategories(targetType)
      .then((c) => { if (!cancelled) setCategories(c); })
      .finally(() => { if (!cancelled) setLoadingCats(false); });
    return () => { cancelled = true; };
  }, [visible, targetType]);

  const pick = useCallback((cat: ReportCategory) => {
    setSelected(cat);
    setDetails('');
    setPhase('detailing');
  }, []);

  const submit = useCallback(async () => {
    if (!selected) return;
    if (selected.requiresDetails && !details.trim()) return;

    setPhase('sending');
    const res = await reportService.createReport({
      target_id: targetId,
      target_type: targetType,
      category: selected.key as ReportCategoryKey,
      details: details.trim() || undefined,
    });

    if (res.ok) {
      setResult({
        ok: true,
        title: 'Signalement envoyé',
        message: res.message || 'Merci, notre équipe va l\'examiner.',
        support: res.supportResources,
      });
      onReported?.();
    } else if (res.alreadyReported) {
      // Pas une erreur : le dire clairement évite que l'utilisateur réessaie.
      setResult({
        ok: true,
        title: 'Déjà signalé',
        message: res.message || 'Vous avez déjà signalé ce contenu, notre équipe l\'examine.',
      });
    } else if (res.rateLimited) {
      setResult({
        ok: false,
        title: 'Trop de signalements',
        message: res.message || 'Vous avez atteint la limite. Réessayez plus tard.',
      });
    } else {
      setResult({
        ok: false,
        title: 'Échec de l\'envoi',
        message: res.message || 'Vérifiez votre connexion et réessayez.',
      });
    }
    setPhase('done');
  }, [selected, details, targetId, targetType, onReported]);

  const bottomPad = Math.max(20, insets.bottom + 8);

  const renderHeader = (title: string, onBack?: () => void) => (
    <View style={styles.header}>
      {onBack ? (
        <TouchableOpacity style={styles.headerBtn} onPress={onBack} hitSlop={10}>
          <Ionicons name="chevron-back" size={22} color={colors.textPrimary} />
        </TouchableOpacity>
      ) : (
        <View style={styles.headerBtn} />
      )}
      <Text style={styles.title} numberOfLines={1}>{title}</Text>
      <TouchableOpacity style={styles.headerBtn} onPress={onClose} hitSlop={10}>
        <Ionicons name="close" size={22} color={colors.textSecondary} />
      </TouchableOpacity>
    </View>
  );

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <Pressable style={styles.overlay} onPress={onClose}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.kav}
        >
          {/* Stoppe la propagation : toucher la feuille ne la ferme pas. */}
          <Pressable style={[styles.sheet, { paddingBottom: bottomPad }]} onPress={() => {}}>
            <View style={styles.handle} />

            {/* ── Choix de la catégorie ─────────────────────────────── */}
            {phase === 'picking' && (
              <>
                {renderHeader(targetType === 'user' ? 'Signaler ce compte' : 'Signaler')}
                {!!targetLabel && (
                  <Text style={styles.subtitle} numberOfLines={1}>{targetLabel}</Text>
                )}
                <Text style={styles.lead}>Que se passe-t-il ?</Text>

                {loadingCats ? (
                  <View style={styles.loading}>
                    <ActivityIndicator color={colors.accent} />
                  </View>
                ) : (
                  <ScrollView
                    style={styles.list}
                    showsVerticalScrollIndicator={false}
                    keyboardShouldPersistTaps="handled"
                  >
                    {categories.map((cat) => (
                      <TouchableOpacity
                        key={cat.key}
                        style={styles.row}
                        onPress={() => pick(cat)}
                        activeOpacity={0.7}
                      >
                        <View style={styles.rowIcon}>
                          <Ionicons
                            name={ICONS[cat.key] || 'flag-outline'}
                            size={19}
                            color={colors.accent}
                          />
                        </View>
                        <View style={styles.rowText}>
                          <Text style={styles.rowLabel}>{cat.label}</Text>
                          <Text style={styles.rowDesc} numberOfLines={2}>{cat.description}</Text>
                        </View>
                        <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                )}
              </>
            )}

            {/* ── Précision facultative + envoi ─────────────────────── */}
            {(phase === 'detailing' || phase === 'sending') && selected && (
              <>
                {renderHeader(selected.label, () => setPhase('picking'))}
                <Text style={styles.lead}>{selected.description}</Text>

                <Text style={styles.fieldLabel}>
                  {selected.requiresDetails
                    ? 'Précisez le motif'
                    : 'Ajouter une précision (facultatif)'}
                </Text>
                <TextInput
                  style={styles.input}
                  value={details}
                  onChangeText={setDetails}
                  placeholder={
                    selected.requiresDetails
                      ? 'Expliquez en quelques mots…'
                      : 'Ce qui vous a alerté…'
                  }
                  placeholderTextColor={colors.textMuted}
                  multiline
                  maxLength={1000}
                  editable={phase !== 'sending'}
                  textAlignVertical="top"
                />
                <Text style={styles.counter}>{details.length}/1000</Text>

                <Text style={styles.notice}>
                  Votre signalement est confidentiel. La personne concernée ne saura
                  pas qui l'a envoyé.
                </Text>

                <TouchableOpacity
                  style={[
                    styles.submit,
                    (phase === 'sending' || (selected.requiresDetails && !details.trim()))
                      && styles.submitDisabled,
                  ]}
                  onPress={submit}
                  disabled={phase === 'sending' || (selected.requiresDetails && !details.trim())}
                  activeOpacity={0.85}
                >
                  {phase === 'sending' ? (
                    <ActivityIndicator color={colors.onAccent} size="small" />
                  ) : (
                    <Text style={styles.submitText}>Envoyer le signalement</Text>
                  )}
                </TouchableOpacity>
              </>
            )}

            {/* ── Résultat ──────────────────────────────────────────── */}
            {phase === 'done' && result && (
              <View style={styles.done}>
                <View
                  style={[
                    styles.doneIcon,
                    { backgroundColor: result.ok ? colors.successMuted : colors.redMuted },
                  ]}
                >
                  <Ionicons
                    name={result.ok ? 'checkmark-circle' : 'alert-circle'}
                    size={34}
                    color={result.ok ? colors.success : colors.red}
                  />
                </View>
                <Text style={styles.doneTitle}>{result.title}</Text>
                <Text style={styles.doneMessage}>{result.message}</Text>

                {/* Catégories de détresse : proposer de l'aide plutôt qu'un
                    simple accusé de réception. */}
                {result.support && (
                  <View style={styles.support}>
                    <Text style={styles.supportTitle}>Besoin de parler ?</Text>
                    <Text style={styles.supportText}>
                      Si vous ou quelqu'un que vous connaissez traversez une période
                      difficile, le 3114 (France) répond gratuitement, 24 h/24 et 7 j/7.
                    </Text>
                  </View>
                )}

                <TouchableOpacity style={styles.submit} onPress={onClose} activeOpacity={0.85}>
                  <Text style={styles.submitText}>Fermer</Text>
                </TouchableOpacity>
              </View>
            )}
          </Pressable>
        </KeyboardAvoidingView>
      </Pressable>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: colors.overlay },
  kav: { justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.surfaceAlt,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 18,
    paddingTop: 8,
    maxHeight: '88%',
  },
  handle: {
    alignSelf: 'center',
    width: 38,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.borderStrong,
    marginBottom: 10,
  },
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: 2 },
  headerBtn: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center' },
  title: {
    flex: 1,
    textAlign: 'center',
    color: colors.textPrimary,
    fontSize: 16.5,
    fontFamily: fonts.semibold,
  },
  subtitle: {
    textAlign: 'center',
    color: colors.textMuted,
    fontSize: 12.5,
    fontFamily: fonts.regular,
    marginBottom: 2,
  },
  lead: {
    color: colors.textSecondary,
    fontSize: 13.5,
    fontFamily: fonts.regular,
    marginTop: 8,
    marginBottom: 10,
  },
  loading: { paddingVertical: 40, alignItems: 'center' },
  list: { marginBottom: 4 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  rowIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  rowText: { flex: 1, paddingRight: 8 },
  rowLabel: { color: colors.textPrimary, fontSize: 14.5, fontFamily: fonts.medium },
  rowDesc: {
    color: colors.textMuted,
    fontSize: 12,
    fontFamily: fonts.regular,
    marginTop: 2,
    lineHeight: 16,
  },
  fieldLabel: {
    color: colors.textPrimary,
    fontSize: 13,
    fontFamily: fonts.medium,
    marginBottom: 8,
  },
  input: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: 12,
    minHeight: 92,
    color: colors.textPrimary,
    fontSize: 14,
    fontFamily: fonts.regular,
  },
  counter: {
    alignSelf: 'flex-end',
    color: colors.textMuted,
    fontSize: 11,
    fontFamily: fonts.regular,
    marginTop: 5,
  },
  notice: {
    color: colors.textMuted,
    fontSize: 11.5,
    fontFamily: fonts.regular,
    lineHeight: 16,
    marginTop: 10,
    marginBottom: 14,
  },
  submit: {
    backgroundColor: colors.accent,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  submitDisabled: { backgroundColor: withAlpha(colors.accent, 0.35) },
  submitText: { color: colors.onAccent, fontSize: 15, fontFamily: fonts.semibold },
  done: { alignItems: 'center', paddingTop: 6, paddingBottom: 4 },
  doneIcon: {
    width: 62,
    height: 62,
    borderRadius: 31,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  doneTitle: {
    color: colors.textPrimary,
    fontSize: 17,
    fontFamily: fonts.semibold,
    marginBottom: 6,
  },
  doneMessage: {
    color: colors.textSecondary,
    fontSize: 13.5,
    fontFamily: fonts.regular,
    textAlign: 'center',
    lineHeight: 19,
    marginBottom: 16,
    paddingHorizontal: 8,
  },
  support: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    marginBottom: 16,
    width: '100%',
  },
  supportTitle: {
    color: colors.textPrimary,
    fontSize: 13.5,
    fontFamily: fonts.semibold,
    marginBottom: 5,
  },
  supportText: {
    color: colors.textSecondary,
    fontSize: 12.5,
    fontFamily: fonts.regular,
    lineHeight: 18,
  },
});

export default ReportSheet;
