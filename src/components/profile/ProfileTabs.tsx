import React, { memo } from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { colors, fonts } from '../../theme';
import Tappable from '../ui/Tappable';

/**
 * Rangée d'onglets du profil.
 *
 * Un seul détail la distingue de la version précédente, et c'est celui qui se
 * voit : le trait de l'onglet actif fait exactement la largeur du MOT, pas
 * `25 %–75 %` de la colonne. Un trait à largeur fixe sous des libellés de
 * longueurs différentes (« Posts », « Réponses ») déborde ici et rentre là ;
 * l'œil lit un défaut d'alignement avant de lire l'onglet.
 *
 * Le composant est monté DEUX FOIS : dans le flux, et en superposition
 * collante une fois la rangée sortie de l'écran. Il ne porte donc aucun état
 * — l'onglet actif vit dans l'écran, et les deux copies restent d'accord par
 * construction.
 */

export interface ProfileTab<K extends string> {
  key: K;
  label: string;
}

export interface ProfileTabsProps<K extends string> {
  tabs: ReadonlyArray<ProfileTab<K>>;
  active: K;
  onChange: (key: K) => void;
  /** Teinte du trait actif sur un profil habillé. */
  accent?: string;
  style?: StyleProp<ViewStyle>;
}

function ProfileTabsBase<K extends string>({
  tabs, active, onChange, accent, style,
}: ProfileTabsProps<K>) {
  return (
    <View style={[S.bar, style]}>
      {tabs.map((tab) => {
        const on = tab.key === active;
        return (
          <Tappable
            key={tab.key}
            style={S.item}
            onPress={() => onChange(tab.key)}
            scaleTo={0.96}
            haptic="select"
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            accessibilityLabel={tab.label}
          >
            <View style={S.labelWrap}>
              <Text style={[S.label, on && S.labelOn]} numberOfLines={1}>
                {tab.label}
              </Text>
              {on && (
                <View
                  style={[S.underline, !!accent && { backgroundColor: accent }]}
                  pointerEvents="none"
                />
              )}
            </View>
          </Tappable>
        );
      })}
    </View>
  );
}

/** Hauteur totale de la rangée — le clone collant en a besoin pour se poser. */
export const PROFILE_TABS_HEIGHT = 48;

const S = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    height: PROFILE_TABS_HEIGHT,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.hairline,
  },
  item: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    height: PROFILE_TABS_HEIGHT,
  },
  labelWrap: { alignItems: 'center', justifyContent: 'center', flexShrink: 1 },
  label: {
    fontFamily: fonts.medium,
    fontSize: 15,
    lineHeight: 20,
    letterSpacing: -0.1,
    color: colors.textMuted,
  },
  labelOn: { fontFamily: fonts.bold, color: colors.textPrimary },
  /**
   * Posé sous la ligne de base par un `bottom` négatif : le trait doit toucher
   * le filet du bas de la rangée, pas suivre la hauteur du texte.
   */
  underline: {
    position: 'absolute',
    left: -2,
    right: -2,
    bottom: -14,
    height: 2.5,
    borderRadius: 2,
    backgroundColor: colors.accent,
  },
});

export default memo(ProfileTabsBase) as typeof ProfileTabsBase;
