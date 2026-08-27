import React, { useMemo } from 'react';
import { Modal, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import { colors, fonts } from '../theme';
import { Button, Tappable } from './ui';
import {
  FEED_2B_SLOTS,
  OPTIONAL_TABS,
  type OptionalTabKey,
} from '../services/navbarPreferences';

/**
 * « Ta barre ne rentre plus » — correction des raccourcis après le passage au
 * fil 2B.
 *
 * ── Pourquoi elle existe ──
 * La barre d'origine acceptait jusqu'à cinq raccourcis. Celle du fil 2B en
 * accepte deux, ou aucun (voir `FEED_2B_SLOTS`). Les comptes qui avaient
 * personnalisé leur barre AVANT d'entrer dans le test gardent leur ancienne
 * préférence : leur barre se retrouve surchargée, ou déséquilibrée avec un
 * seul raccourci.
 *
 * L'app sait déjà se rattraper toute seule au rendu — elle n'en monte jamais
 * plus de deux. Mais elle le fait en SILENCE, et quelqu'un qui avait mis cinq
 * raccourcis en voit trois disparaître sans explication. Cette popup est là
 * pour le dire, et pour rendre le choix à qui l'a fait.
 *
 * ── Ce qu'elle ne fait pas ──
 * Choisir à la place de l'utilisateur. Les deux issues sont explicites :
 * « je choisis mes deux » ou « je n'en veux aucun ». Rien n'est appliqué tant
 * qu'il n'a pas tranché, et fermer la popup ne persiste rien — elle
 * reviendra, parce que la barre est toujours dans un état qu'il n'a pas voulu.
 */

interface Props {
  visible: boolean;
  /** Raccourcis actuellement enregistrés, dans l'ordre choisi. */
  selected: OptionalTabKey[];
  /** Ouvre l'écran de personnalisation pour en choisir deux. */
  onChoose: () => void;
  /** Vide la sélection : barre au socle seul. */
  onClearAll: () => void;
  onDismiss: () => void;
}

export default function NavbarFixModal({
  visible,
  selected,
  onChoose,
  onClearAll,
  onDismiss,
}: Props) {
  const count = selected.length;
  const tooMany = count > FEED_2B_SLOTS;

  const kept = useMemo(
    () =>
      selected
        .slice(0, FEED_2B_SLOTS)
        .map((key) => OPTIONAL_TABS.find((tab) => tab.key === key))
        .filter(Boolean) as typeof OPTIONAL_TABS,
    [selected],
  );

  const dropped = useMemo(
    () =>
      selected
        .slice(FEED_2B_SLOTS)
        .map((key) => OPTIONAL_TABS.find((tab) => tab.key === key))
        .filter(Boolean) as typeof OPTIONAL_TABS,
    [selected],
  );

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onDismiss}>
      <View style={S.scrim}>
        <View style={S.sheet}>
          <View style={S.headRow}>
            <Ionicons name="apps-outline" size={22} color={colors.accent} />
            <Text style={S.title}>
              {tooMany ? 'Ta barre est trop chargée' : 'Il manque un raccourci'}
            </Text>
          </View>

          <Text style={S.body}>
            {tooMany
              ? `La nouvelle barre a deux emplacements libres, et tu en as ${count}. Les icônes deviennent trop petites pour être touchées.`
              : 'La nouvelle barre se remplit par deux — avec un seul raccourci, le bouton Publier n’est plus au centre.'}
          </Text>

          {tooMany && dropped.length > 0 && (
            <View style={S.preview}>
              <Text style={S.previewLabel}>Ce qui tient</Text>
              <View style={S.chips}>
                {kept.map((tab) => (
                  <View key={tab.key} style={S.chip}>
                    <Ionicons name={tab.icon as any} size={15} color={colors.textPrimary} />
                    <Text style={S.chipText}>{tab.label}</Text>
                  </View>
                ))}
              </View>

              <Text style={[S.previewLabel, S.previewLabelSpaced]}>Ce qui sort de la barre</Text>
              <View style={S.chips}>
                {dropped.map((tab) => (
                  <View key={tab.key} style={[S.chip, S.chipMuted]}>
                    <Ionicons name={tab.icon as any} size={15} color={colors.textMuted} />
                    <Text style={[S.chipText, S.chipTextMuted]}>{tab.label}</Text>
                  </View>
                ))}
              </View>
              {/* Rassurer sur ce qui n'est PAS perdu : sans cette phrase, on
                  croit que la fonctionnalité disparaît avec son icône. */}
              <Text style={S.footnote}>
                Rien n’est supprimé : ces écrans restent dans Réglages.
              </Text>
            </View>
          )}

          <Button
            label={`Choisir mes ${FEED_2B_SLOTS} raccourcis`}
            onPress={onChoose}
            fullWidth
            style={S.primary}
          />

          <Tappable onPress={onClearAll} hitSlop={8}>
            <Text style={S.secondary}>N’en garder aucun</Text>
          </Tappable>
        </View>
      </View>
    </Modal>
  );
}

const S = StyleSheet.create({
  scrim: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.72)',
    justifyContent: 'center',
    paddingHorizontal: 22,
  },
  // Surface PLEINE — règle centrale de la DA « Pulse ». Aucun flou, aucune
  // translucidité, aucun dégradé décoratif.
  sheet: {
    backgroundColor: colors.surface,
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    padding: 22,
  },
  headRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
  title: { flex: 1, color: colors.textPrimary, fontSize: 18, fontFamily: fonts.semibold },
  body: { color: colors.textSecondary, fontSize: 14.5, lineHeight: 20 },

  preview: { marginTop: 18 },
  previewLabel: {
    color: colors.textMuted,
    fontSize: 11,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  previewLabelSpaced: { marginTop: 14 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.bg,
    borderRadius: 9,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  chipMuted: { opacity: 0.55 },
  chipText: { color: colors.textPrimary, fontSize: 13 },
  chipTextMuted: { color: colors.textMuted },
  footnote: { color: colors.textMuted, fontSize: 12, lineHeight: 17, marginTop: 12 },

  primary: { marginTop: 22 },
  secondary: {
    color: colors.textMuted,
    fontSize: 14,
    textAlign: 'center',
    paddingVertical: 14,
  },
});
