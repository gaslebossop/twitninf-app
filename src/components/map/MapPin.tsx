/**
 * Épingle d'un compte sur la Carte NF.
 *
 * ── Ce qu'elle doit dire en un coup d'œil ──
 *   - QUI c'est : l'avatar, en grand, c'est le seul contenu qui compte ;
 *   - qu'il s'agit d'une personne et pas d'un lieu : anneau blanc et ombre
 *     portée, qui la détachent du fond de carte quelle qu'en soit la couleur ;
 *   - le prénom, sous l'avatar, parce qu'un visage en 44 px ne suffit pas à
 *     reconnaître quelqu'un qu'on croise peu ;
 *   - si la position est APPROXIMATIVE : anneau discontinu. Sans ce signal,
 *     une position arrondie à l'agglomération se lit comme une adresse.
 *
 * L'ombre est portée par une vue séparée de celle qui rogne l'avatar : sur
 * Android, `elevation` et `overflow: 'hidden'` sur la même vue s'annulent — on
 * perd soit l'ombre, soit le cercle.
 */

import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import Avatar from '../Avatar';
import { colors, fonts } from '../../theme';

interface MapPinProps {
  username: string;
  avatar?: string | null;
  /** Nom court affiché sous l'épingle. */
  label?: string | null;
  approximate?: boolean;
  selected?: boolean;
  /** L'épingle de l'utilisateur lui-même se distingue des autres. */
  self?: boolean;
  /**
   * Sa propre épingle, en mode fantôme : visible pour soi, invisible pour les
   * autres. Le trait discontinu et l'atténuation disent cette différence sans
   * une phrase — la montrer pleine laisserait croire qu'on est sur la carte de
   * tout le monde.
   */
  hidden?: boolean;
  /**
   * Réduit l'épingle à un point : le compte est absorbé dans un groupe et se
   * tient au même endroit que la tête, qui le recouvre entièrement.
   *
   * Un point plutôt qu'un rendu vide, parce qu'un marqueur sans contenu
   * retombe sur l'épingle rouge par défaut de la carte — on verrait apparaître
   * des piques là où on voulait justement ne rien montrer.
   */
  collapsed?: boolean;
}

const SIZE = 46;

/**
 * Mémoïsée, et ce n'est pas cosmétique.
 *
 * Le contenu d'un marqueur est reconstruit à chaque rendu de l'écran, donc à
 * chaque déplacement de la carte. Sans cette barrière, `react-native-maps`
 * reçoit une mise à jour d'enfants pour chaque épingle à chaque pause du
 * doigt — du travail natif pur perte, et une occasion de plus de trébucher sur
 * la version 1.20 sous la Nouvelle Architecture. Toutes les props sont des
 * primitives : la comparaison par défaut suffit.
 */
function MapPin({
  username,
  avatar,
  label,
  approximate = false,
  selected = false,
  self = false,
  hidden = false,
  collapsed = false,
}: MapPinProps) {
  if (collapsed) return <View style={styles.collapsed} />;

  return (
    <View style={[styles.root, hidden && styles.rootHidden]}>
      <View style={[styles.shadow, selected && styles.shadowSelected]}>
        <View
          style={[
            styles.ring,
            approximate && styles.ringApproximate,
            selected && styles.ringSelected,
            self && styles.ringSelf,
            hidden && styles.ringHidden,
          ]}
        >
          <Avatar size={SIZE - 6} username={username} uri={avatar || undefined} />
        </View>
      </View>

      {/* Pointe : elle désigne le point exact sous l'épingle. */}
      <View style={[styles.tip, selected && styles.tipSelected]} />

      {!!label && (
        <View style={styles.labelWrap}>
          <Text style={styles.label} numberOfLines={1}>
            {label}
          </Text>
        </View>
      )}
    </View>
  );
}

export default React.memo(MapPin);

const styles = StyleSheet.create({
  root: { alignItems: 'center' },
  rootHidden: { opacity: 0.65 },
  collapsed: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.borderSubtle },

  shadow: {
    borderRadius: SIZE / 2,
    backgroundColor: colors.white,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 5,
  },
  shadowSelected: { shadowOpacity: 0.35, shadowRadius: 10 },

  ring: {
    width: SIZE,
    height: SIZE,
    borderRadius: SIZE / 2,
    borderWidth: 3,
    borderColor: colors.white,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  ringApproximate: { borderStyle: 'dashed', borderColor: '#E4E4E4' },
  ringSelected: { borderColor: colors.accent, borderWidth: 3.5 },
  ringSelf: { borderColor: colors.accent },
  ringHidden: { borderStyle: 'dashed', borderColor: colors.textMuted },

  tip: {
    width: 0,
    height: 0,
    marginTop: -1,
    borderLeftWidth: 5,
    borderRightWidth: 5,
    borderTopWidth: 8,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: colors.white,
  },
  tipSelected: { borderTopColor: colors.accent },

  // Sur le fond sombre de la carte, un voile noir translucide se confond avec
  // le décor et rend l'étiquette sale. Une pastille pleine, bordée d'un filet
  // clair, se détache aussi bien au-dessus d'un parc que d'une autoroute.
  labelWrap: {
    marginTop: 3,
    paddingHorizontal: 8,
    paddingVertical: 2.5,
    borderRadius: 999,
    backgroundColor: '#0A0A0A',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.overlayStrong,
    maxWidth: 96,
  },
  label: { fontFamily: fonts.semibold, fontSize: 10, color: colors.white },
});
