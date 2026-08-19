import React from 'react';
import { StyleSheet, Text, View, ViewStyle, StyleProp } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { colors, fonts, radius, withAlpha } from '../../theme';
import Tappable from './Tappable';

/**
 * « Il n'y a rien ici » — mais dit de façon utile.
 *
 * Les écrans vides de l'app affichaient au mieux une phrase grise centrée, au
 * pire rien du tout. Dans les deux cas l'utilisateur ne sait pas s'il a mal
 * cherché, si ça charge encore, ou si c'est normal — et surtout il n'a aucune
 * porte de sortie.
 *
 * Un état vide utile dit trois choses dans cet ordre : ce qui manque, pourquoi
 * ce n'est pas une erreur, et le geste qui remplit l'écran. Le bouton est donc
 * obligatoire dès qu'une action existe.
 */

export interface EmptyStateProps {
  icon?: keyof typeof Ionicons.glyphMap;
  title: string;
  /** Une phrase : pourquoi c'est vide, et ce qui le remplira. */
  message?: string;
  action?: { label: string; onPress: () => void; icon?: keyof typeof Ionicons.glyphMap };
  /** Action discrète en dessous (« Actualiser », « Voir les réglages »). */
  secondaryAction?: { label: string; onPress: () => void };
  /** Teinte de l'icône. Accent de marque par défaut. */
  tint?: string;
  style?: StyleProp<ViewStyle>;
  /** Version resserrée pour un état vide à l'intérieur d'une section. */
  compact?: boolean;
}

export default function EmptyState({
  icon = 'sparkles-outline',
  title,
  message,
  action,
  secondaryAction,
  tint = colors.accent,
  style,
  compact = false,
}: EmptyStateProps) {
  return (
    <View style={[styles.wrap, compact && styles.wrapCompact, style]}>
      <View
        style={[
          styles.iconWrap,
          compact && styles.iconWrapCompact,
          { backgroundColor: withAlpha(tint, 0.12), borderColor: withAlpha(tint, 0.22) },
        ]}
      >
        <Ionicons name={icon} size={compact ? 24 : 32} color={tint} />
      </View>

      <Text style={[styles.title, compact && styles.titleCompact]}>{title}</Text>
      {!!message && <Text style={styles.message}>{message}</Text>}

      {action && (
        <Tappable
          onPress={action.onPress}
          scaleTo={0.96}
          style={styles.actionOuter}
        >
          <View style={[styles.action, { backgroundColor: tint }]}>
            {action.icon && (
              <Ionicons name={action.icon} size={17} color={colors.white} style={styles.actionIcon} />
            )}
            <Text style={styles.actionLabel}>{action.label}</Text>
          </View>
        </Tappable>
      )}

      {secondaryAction && (
        <Tappable onPress={secondaryAction.onPress} scaleTo={0.97} style={styles.secondaryOuter}>
          <Text style={styles.secondaryLabel}>{secondaryAction.label}</Text>
        </Tappable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    paddingVertical: 48,
  },
  wrapCompact: {
    paddingVertical: 26,
    paddingHorizontal: 20,
  },
  iconWrap: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    marginBottom: 18,
  },
  iconWrapCompact: {
    width: 52,
    height: 52,
    borderRadius: 26,
    marginBottom: 12,
  },
  title: {
    color: colors.textPrimary,
    fontFamily: fonts.display,
    fontSize: 18,
    lineHeight: 24,
    textAlign: 'center',
  },
  titleCompact: {
    fontSize: 15.5,
    lineHeight: 21,
  },
  message: {
    color: colors.textSecondary,
    fontFamily: fonts.regular,
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
    marginTop: 8,
    maxWidth: 320,
  },
  actionOuter: {
    marginTop: 22,
  },
  action: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 46,
    paddingHorizontal: 24,
    borderRadius: radius.round,
  },
  actionIcon: {
    marginRight: 8,
  },
  actionLabel: {
    color: colors.white,
    fontFamily: fonts.bold,
    fontSize: 15,
  },
  secondaryOuter: {
    marginTop: 12,
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  secondaryLabel: {
    color: colors.textMuted,
    fontFamily: fonts.semibold,
    fontSize: 13.5,
  },
});
