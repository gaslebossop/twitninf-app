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

const styles = StyleSheet.create({
  wrap: { marginTop: 10 },
  divided: { paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },

  head: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  label: { flex: 1, fontFamily: fonts.medium, fontSize: 12, color: colors.textMuted },

  body: { marginTop: 10, gap: 9 },
  line: { fontFamily: fonts.regular, fontSize: 11.5, lineHeight: 17, color: colors.textSecondary },
  term: { fontFamily: fonts.bold, color: colors.textPrimary },
});
