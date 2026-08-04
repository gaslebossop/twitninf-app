import React from 'react';
import { StyleSheet, Text, View, ViewStyle, StyleProp, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, fonts, radius, withAlpha } from '../../theme';
import Tappable from './Tappable';

/**
 * « Ça n'a pas marché » — avec une porte de sortie.
 *
 * Le schéma dominant dans l'app était : `catch (e) { Alert.alert('Erreur',
 * 'Impossible de charger X') }`, puis un écran resté vide. L'utilisateur
 * ferme l'alerte et se retrouve devant du noir, sans aucun moyen de réessayer
 * autrement qu'en quittant l'écran et en y revenant.
 *
 * Ici l'erreur reste À L'ÉCRAN, avec le bouton qui la répare. Le message
 * technique (`e.message`) n'est montré qu'en second plan : il aide quand il
 * est parlant (« Solde insuffisant »), il n'effraie pas quand il ne l'est pas.
 */

export interface ErrorStateProps {
  /** Ce qui a échoué, du point de vue de l'utilisateur. */
  title?: string;
  /** Message d'origine, affiché en petit sous le titre. */
  detail?: string;
  onRetry?: () => void;
  /** Passe le bouton en attente pendant la nouvelle tentative. */
  retrying?: boolean;
  retryLabel?: string;
  icon?: keyof typeof Ionicons.glyphMap;
  style?: StyleProp<ViewStyle>;
  compact?: boolean;
}

export default function ErrorState({
  title = 'Ça n’a pas chargé',
  detail,
  onRetry,
  retrying = false,
  retryLabel = 'Réessayer',
  icon = 'cloud-offline-outline',
  style,
  compact = false,
}: ErrorStateProps) {
  return (
    <View style={[styles.wrap, compact && styles.wrapCompact, style]}>
      <View style={styles.iconWrap}>
        <Ionicons name={icon} size={compact ? 24 : 30} color={colors.red} />
      </View>

      <Text style={styles.title}>{title}</Text>
      {!!detail && (
        <Text style={styles.detail} numberOfLines={3}>
          {detail}
        </Text>
      )}

      {onRetry && (
        <Tappable
          onPress={onRetry}
          disabled={retrying}
          scaleTo={0.96}
          style={styles.retryOuter}
        >
          <View style={[styles.retry, retrying && styles.retryBusy]}>
            {retrying ? (
              <ActivityIndicator size="small" color={colors.textPrimary} />
            ) : (
              <>
                <Ionicons name="refresh" size={16} color={colors.textPrimary} style={styles.retryIcon} />
                <Text style={styles.retryLabel}>{retryLabel}</Text>
              </>
            )}
          </View>
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
    paddingVertical: 44,
  },
  wrapCompact: {
    paddingVertical: 24,
    paddingHorizontal: 20,
  },
  iconWrap: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: withAlpha(colors.red, 0.12),
    borderWidth: 1,
    borderColor: withAlpha(colors.red, 0.22),
    marginBottom: 16,
  },
  title: {
    color: colors.textPrimary,
    fontFamily: fonts.display,
    fontSize: 17,
    lineHeight: 23,
    textAlign: 'center',
  },
  detail: {
    color: colors.textMuted,
    fontFamily: fonts.regular,
    fontSize: 13,
    lineHeight: 18,
    textAlign: 'center',
    marginTop: 6,
    maxWidth: 320,
  },
  retryOuter: {
    marginTop: 20,
  },
  retry: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 44,
    minWidth: 150,
    paddingHorizontal: 22,
    borderRadius: radius.round,
    backgroundColor: colors.surfaceElevated,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderStrong,
  },
  retryBusy: {
    opacity: 0.75,
  },
  retryIcon: {
    marginRight: 8,
  },
  retryLabel: {
    color: colors.textPrimary,
    fontFamily: fonts.bold,
    fontSize: 14.5,
  },
});
