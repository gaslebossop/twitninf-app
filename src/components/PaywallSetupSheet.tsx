import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { colors, radius } from '../theme';
import {
  creatorNetFor,
  fetchConfig,
  fetchLockState,
  formatPriceWindow,
  lockContent,
  unlockContent,
  type PaidContentConfig,
  type PaidContentLock,
  type PaidContentType,
} from '../services/paidContentService';

/**
 * Feuille de mise en vente d'un contenu.
 *
 * La règle d'écran : **le montant net du créateur est affiché en permanence,
 * dès la première frappe.** La commission de 30 % n'est pas une surprise à
 * découvrir après la première vente — un vendeur qui se sent piégé ne remet
 * rien en vente, et l'app perd la fonctionnalité qu'elle vient de vendre.
 *
 * L'aperçu est facultatif à dessein : l'exiger ferait abandonner la moitié des
 * créateurs au moment précis où ils essaient la fonctionnalité pour la
 * première fois. Sans aperçu, le serveur prend le début du contenu.
 */

interface Props {
  visible: boolean;
  contentType: PaidContentType;
  /** Vide en mode brouillon : le contenu n'existe pas encore. */
  contentId: string;
  onClose: () => void;
  onDone?: () => void;
  /**
   * Mode brouillon — utilisé pendant la composition, avant publication.
   *
   * Le verrou ne peut pas être posé à ce moment-là : il lui faut
   * l'identifiant du contenu, qui n'existe qu'une fois le tweet créé. La
   * feuille se contente donc de RENVOYER le prix choisi, et l'écran appelant
   * pose le verrou juste après la publication. C'est aussi ce qui garantit
   * qu'un tweet dont la publication échoue ne laisse pas derrière lui un
   * verrou orphelin.
   */
  draftMode?: boolean;
  draftPrice?: number | null;
  draftPreview?: string;
  onDraftChange?: (price: number | null, preview: string) => void;
}

export default function PaywallSetupSheet({
  visible, contentType, contentId, onClose, onDone,
  draftMode = false, draftPrice = null, draftPreview = '', onDraftChange,
}: Props) {
  const [config, setConfig] = useState<PaidContentConfig | null>(null);
  const [existing, setExisting] = useState<PaidContentLock | null>(null);
  const [price, setPrice] = useState('');
  const [preview, setPreview] = useState('');
  const [saving, setSaving] = useState(false);
  const [remaining, setRemaining] = useState(0);
  /** La confirmation de retrait de la vente, posée DANS la feuille — voir `makeFree`. */
  const [confirmingFree, setConfirmingFree] = useState(false);
  /** Le dernier échec, écrit dans la feuille : un toast n'y serait pas visible. */
  const [error, setError] = useState<string | null>(null);

  /**
   * À l'ouverture, on demande l'état du verrou : la feuille sert autant à
   * fixer un prix qu'à l'ajuster. Rouvrir sur un champ vide alors qu'un prix
   * existe déjà donnerait l'impression qu'il a été perdu.
   */
  useEffect(() => {
    if (!visible) return;
    // Rouvrir la feuille repart d'une page propre : ni l'échec précédent, ni
    // une confirmation restée en suspens.
    setError(null);
    setConfirmingFree(false);
    fetchConfig().then(setConfig).catch(() => setConfig(null));

    if (draftMode) {
      // Rien à interroger : le contenu n'existe pas encore. On repart du prix
      // déjà saisi pour que rouvrir la feuille ne l'efface pas.
      setExisting(null);
      setPrice(draftPrice != null ? String(draftPrice) : '');
      setPreview(draftPreview || '');
      setRemaining(0);
      return;
    }

    fetchLockState(contentType, contentId)
      .then((lock) => {
        setExisting(lock);
        if (lock) {
          setPrice(String(lock.price_twc));
          setPreview(lock.preview_text || '');
          setRemaining(lock.price_editable_for_ms ?? 0);
        }
      })
      .catch(() => setExisting(null));
  }, [visible, contentType, contentId, draftMode, draftPrice, draftPreview]);

  // Décompte local : la fenêtre est connue dès la première réponse, et c'est
  // le serveur qui tranche de toute façon à l'envoi.
  useEffect(() => {
    if (!visible || !existing || remaining <= 0) return undefined;
    const timer = setInterval(() => setRemaining((prev) => Math.max(0, prev - 1000)), 1000);
    return () => clearInterval(timer);
  }, [visible, existing, remaining]);

  const priceLocked = Boolean(existing) && remaining <= 0;

  const priceValue = Number(price.replace(',', '.'));
  const valid = config
    && Number.isFinite(priceValue)
    && priceValue >= config.min_price_twc
    && priceValue <= config.max_price_twc
    && !priceLocked;

  /**
   * Retrait de la vente, confirmé DANS la feuille.
   *
   * ── Le bug que ça remplace ──
   * Cette action passait par `confirmAsync`, et l'échec par `toast.error`.
   * Or cette feuille est une `<Modal>` React Native, c'est-à-dire une FENÊTRE
   * NATIVE distincte : les hôtes de `components/ui` (toast, confirmation,
   * feuille d'actions) vivent dans l'arbre React de l'app, donc ils se
   * dessinent DERRIÈRE elle. Concrètement, « Rendre gratuit » était un bouton
   * mort — la demande de confirmation s'ouvrait hors de vue, personne ne
   * pouvait y répondre — et un échec de mise en vente ne disait rien du tout.
   *
   * La question est donc posée à la place même des boutons, et la réponse
   * s'écrit là où elle se lit. Aucune surface nouvelle : c'est la rangée
   * d'actions qui change de contenu.
   */
  const makeFree = async () => {
    if (!existing || saving) return;
    setSaving(true);
    setError(null);
    try {
      await unlockContent(existing.id);
      onDone?.();
      onClose();
    } catch (e: any) {
      setConfirmingFree(false);
      setError(e?.message || 'Retrait impossible. Réessaie dans un instant.');
    } finally {
      setSaving(false);
    }
  };

  const submit = async () => {
    if (!valid || saving) return;

    if (draftMode) {
      onDraftChange?.(priceValue, preview.trim());
      onClose();
      return;
    }

    setSaving(true);
    setError(null);
    try {
      await lockContent({
        contentType,
        contentId,
        priceTwc: priceValue,
        previewText: preview.trim() || null,
      });
      onDone?.();
      onClose();
    } catch (e: any) {
      setError(e?.message || 'Mise en vente impossible. Réessaie dans un instant.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={styles.sheet}>
            <View style={styles.grabber} />

            <View style={styles.headRow}>
              <Ionicons name="lock-closed" size={18} color={colors.gold} />
              <Text style={styles.title}>Rendre ce contenu payant</Text>
            </View>

            <Text style={styles.subtitle}>
              Seuls les acheteurs verront le texte complet et les médias. L'accès est définitif.
              {draftMode ? ' Le prix restera modifiable 30 minutes après la publication.' : ''}
            </Text>

            {/* Compte à rebours du réglage : le prix se fixe à la publication
                et reste ajustable 30 minutes. Le dire avant évite de laisser
                quelqu'un saisir un nouveau prix qui sera refusé à l'envoi. */}
            {!!existing && (
              <View style={[styles.window, priceLocked && styles.windowOver]}>
                <Ionicons
                  name={priceLocked ? 'lock-closed-outline' : 'time-outline'}
                  size={13}
                  color={priceLocked ? colors.textMuted : colors.cyan}
                />
                <Text style={[styles.windowText, priceLocked && styles.windowTextOver]}>
                  {formatPriceWindow(remaining)}
                </Text>
              </View>
            )}

            <View style={styles.field}>
              <TextInput
                style={styles.input}
                placeholder="Prix"
                placeholderTextColor={colors.textMuted}
                value={price}
                onChangeText={setPrice}
                keyboardType="decimal-pad"
                autoFocus={!existing}
                editable={!priceLocked}
              />
              <Text style={styles.suffix}>NF</Text>
            </View>

            {!!config && (
              <Text style={styles.net}>
                {priceLocked
                  ? `Ce contenu reste vendu ${existing?.price_twc} NF. Tu peux encore le rendre gratuit.`
                  : valid
                    ? `Tu touches ${creatorNetFor(priceValue, config.platform_fee_rate)} NF par vente — TwitNinf prélève ${Math.round(config.platform_fee_rate * 100)} %.`
                    : `Entre ${config.min_price_twc} et ${config.max_price_twc} NF.`}
              </Text>
            )}

            <TextInput
              style={styles.previewInput}
              placeholder="Aperçu visible avant achat (facultatif)"
              placeholderTextColor={colors.textMuted}
              value={preview}
              onChangeText={setPreview}
              multiline
              maxLength={280}
            />

            {/* L'échec se dit ICI et pas en toast : sous une `<Modal>`, un
                toast se dessine derrière la fenêtre native et n'est jamais vu. */}
            {!!error && <Text style={styles.error}>{error}</Text>}

            {confirmingFree ? (
              <>
                <Text style={styles.confirm}>
                  Rendre ce contenu gratuit ? Il ne sera plus vendu. Ceux qui
                  l’ont déjà acheté gardent leur accès et ne sont pas remboursés.
                </Text>
                <View style={styles.actions}>
                  <TouchableOpacity
                    style={styles.ghost}
                    onPress={() => setConfirmingFree(false)}
                    activeOpacity={0.85}
                  >
                    <Text style={styles.ghostText}>Garder en vente</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.primary, saving && styles.disabled]}
                    onPress={makeFree}
                    disabled={saving}
                    activeOpacity={0.85}
                  >
                    {saving
                      ? <ActivityIndicator size="small" color={colors.onAccent} />
                      : <Text style={styles.primaryText}>Rendre gratuit</Text>}
                  </TouchableOpacity>
                </View>
              </>
            ) : (
            <View style={styles.actions}>
              {/* Rendre gratuit reste possible à tout moment, même une fois le
                  prix figé : les acheteurs gardent leur accès, les autres y
                  gagnent, personne n'est lésé. */}
              {draftMode && draftPrice != null ? (
                <TouchableOpacity
                  style={styles.ghost}
                  onPress={() => { onDraftChange?.(null, ''); onClose(); }}
                  activeOpacity={0.85}
                >
                  <Text style={styles.ghostDanger}>Ne pas vendre</Text>
                </TouchableOpacity>
              ) : !!existing && existing.is_active ? (
                <TouchableOpacity style={styles.ghost} onPress={() => setConfirmingFree(true)} activeOpacity={0.85}>
                  <Text style={styles.ghostDanger}>Rendre gratuit</Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity style={styles.ghost} onPress={onClose} activeOpacity={0.85}>
                  <Text style={styles.ghostText}>Annuler</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                style={[styles.primary, (!valid || saving) && styles.disabled]}
                onPress={submit}
                disabled={!valid || saving}
                activeOpacity={0.85}
              >
                {saving
                  ? <ActivityIndicator size="small" color={colors.onAccent} />
                  : <Text style={styles.primaryText}>
                    {draftMode ? 'Valider le prix' : existing ? 'Enregistrer' : 'Mettre en vente'}
                  </Text>}
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
  sheet: {
    backgroundColor: colors.surfaceAlt,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    padding: 20,
    paddingBottom: Platform.OS === 'ios' ? 34 : 20,
  },
  grabber: {
    width: 38,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.borderStrong,
    alignSelf: 'center',
    marginBottom: 16,
  },
  headRow: { flexDirection: 'row', alignItems: 'center' },
  title: { color: colors.textPrimary, fontSize: 17, fontWeight: '700', marginLeft: 8 },
  subtitle: { color: colors.textMuted, fontSize: 13, lineHeight: 19, marginTop: 8 },

  field: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 13,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    marginTop: 18,
  },
  input: { flex: 1, color: colors.textPrimary, fontSize: 16, padding: 0 },
  suffix: { color: colors.textMuted, fontSize: 14, fontWeight: '700' },
  net: { color: colors.textSecondary, fontSize: 12, marginTop: 10, lineHeight: 18 },

  previewInput: {
    color: colors.textPrimary,
    fontSize: 14,
    minHeight: 70,
    textAlignVertical: 'top',
    padding: 14,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    marginTop: 14,
  },

  // 13 px : le plancher de lisibilité d'un texte de contenu. Un message
  // d'échec écrit plus petit que le reste ne se lit pas, et c'est le seul
  // retour que cette feuille peut donner.
  error: { color: colors.red, fontSize: 13, lineHeight: 19, marginTop: 14 },
  confirm: { color: colors.textPrimary, fontSize: 13, lineHeight: 19, marginTop: 18 },

  actions: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 20 },
  ghost: { paddingHorizontal: 16, paddingVertical: 12, marginRight: 8 },
  ghostText: { color: colors.textSecondary, fontSize: 14, fontWeight: '600' },
  ghostDanger: { color: colors.red, fontSize: 14, fontWeight: '600' },

  window: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.round,
    backgroundColor: colors.cyanSoft,
    marginTop: 12,
  },
  windowOver: { backgroundColor: colors.surface },
  windowText: { color: colors.cyan, fontSize: 11, fontWeight: '700', marginLeft: 5 },
  windowTextOver: { color: colors.textMuted },
  primary: {
    minWidth: 150,
    paddingHorizontal: 20,
    paddingVertical: 13,
    borderRadius: radius.round,
    backgroundColor: colors.accent,
    alignItems: 'center',
  },
  primaryText: { color: colors.onAccent, fontSize: 14, fontWeight: '700' },
  disabled: { opacity: 0.45 },
});
