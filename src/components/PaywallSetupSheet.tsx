import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius } from '../theme';
import {
  creatorNetFor,
  fetchConfig,
  lockContent,
  type PaidContentConfig,
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
  contentId: string;
  onClose: () => void;
  onDone?: () => void;
}

export default function PaywallSetupSheet({
  visible, contentType, contentId, onClose, onDone,
}: Props) {
  const [config, setConfig] = useState<PaidContentConfig | null>(null);
  const [price, setPrice] = useState('');
  const [preview, setPreview] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!visible) return;
    fetchConfig().then(setConfig).catch(() => setConfig(null));
  }, [visible]);

  const priceValue = Number(price.replace(',', '.'));
  const valid = config
    && Number.isFinite(priceValue)
    && priceValue >= config.min_price_twc
    && priceValue <= config.max_price_twc;

  const submit = async () => {
    if (!valid || saving) return;
    setSaving(true);
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
      Alert.alert('Mise en vente impossible', e?.message || 'Réessaie dans un instant.');
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
            </Text>

            <View style={styles.field}>
              <TextInput
                style={styles.input}
                placeholder="Prix"
                placeholderTextColor={colors.textMuted}
                value={price}
                onChangeText={setPrice}
                keyboardType="decimal-pad"
                autoFocus
              />
              <Text style={styles.suffix}>NF</Text>
            </View>

            {!!config && (
              <Text style={styles.net}>
                {valid
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

            <View style={styles.actions}>
              <TouchableOpacity style={styles.ghost} onPress={onClose} activeOpacity={0.85}>
                <Text style={styles.ghostText}>Annuler</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.primary, (!valid || saving) && styles.disabled]}
                onPress={submit}
                disabled={!valid || saving}
                activeOpacity={0.85}
              >
                {saving
                  ? <ActivityIndicator size="small" color={colors.onAccent} />
                  : <Text style={styles.primaryText}>Mettre en vente</Text>}
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

  actions: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 20 },
  ghost: { paddingHorizontal: 16, paddingVertical: 12, marginRight: 8 },
  ghostText: { color: colors.textSecondary, fontSize: 14, fontWeight: '600' },
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
