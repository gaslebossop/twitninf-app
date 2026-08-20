import React, { useCallback, useState } from 'react';
import { LayoutAnimation, Platform, StyleSheet, Text, UIManager, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import { colors, fonts } from '../../theme';
import Tappable from '../ui/Tappable';

if (Platform.OS === 'android' && (UIManager as any).setLayoutAnimationEnabledExperimental) {
  (UIManager as any).setLayoutAnimationEnabledExperimental(true);
}

/**
 * Le repli des explications.
 *
 * C'est le composant qui règle le principal défaut de l'ancienne page : elle
 * affichait en permanence six paragraphes de pédagogie au milieu des chiffres,
 * si bien qu'on scrollait à travers du texte pour retrouver un montant. Une
 * explication doit être disponible, pas imposée — on la lit une fois, jamais
 * les vingt suivantes.
 *
 * Le dépliage dure 180 ms sans rebond : il répond à un appui, donc il est
 * court et il s'arrête net (voir `theme/motion`, `duration.fast`).
 */

interface Props {
  label: string;
  children: React.ReactNode;
  icon?: keyof typeof Ionicons.glyphMap;
  /** Aligne le repli sur une ligne de séparation quand il clôt une carte. */
  divided?: boolean;
}

export default function Disclosure({ label, children, icon = 'help-circle-outline', divided = true }: Props) {
  const [open, setOpen] = useState(false);

  const toggle = useCallback(() => {
    LayoutAnimation.configureNext(
      LayoutAnimation.create(180, LayoutAnimation.Types.easeOut, LayoutAnimation.Properties.opacity),
    );
    setOpen((v) => !v);
  }, []);

  return (
    <View style={[styles.wrap, divided && styles.divided]}>
      <Tappable
        onPress={toggle}
        style={styles.head}
        scaleTo={0.99}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
      >
        <Ionicons name={icon} size={14} color={colors.textMuted} />
        <Text style={styles.label}>{label}</Text>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={14} color={colors.textMuted} />
      </Tappable>

      {open && <View style={styles.body}>{children}</View>}
    </View>
  );
}

/** Paragraphe d'explication — le terme défini en gras, puis la phrase. */
export function DisclosureLine({ term, children }: { term?: string; children: React.ReactNode }) {
  return (
    <Text style={styles.line}>
      {!!term && <Text style={styles.term}>{term} — </Text>}
      {children}
    </Text>
  );
}

/* Échelle native : footnote 13/18 pour le déclencheur, subheadline 15/21 pour
   le texte déplié. Une explication qu'on ouvre exprès doit se lire, pas se
   déchiffrer — elle était à 11,5 px. */
const styles = StyleSheet.create({
  wrap: { marginTop: 16 },
  divided: { paddingTop: 16, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },

  head: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 32 },
  label: { flex: 1, fontFamily: fonts.medium, fontSize: 15, color: colors.textSecondary },

  body: { marginTop: 12, gap: 12 },
  line: { fontFamily: fonts.regular, fontSize: 15, lineHeight: 21, color: colors.textSecondary },
  term: { fontFamily: fonts.bold, color: colors.textPrimary },
});
