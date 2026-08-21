/**
 * Quand l'audience est là — vingt-quatre créneaux, et rien d'autre.
 *
 * ── Ce qui a été retiré par rapport à la version précédente ────────────────
 * L'ancien graphique traçait un « indice d'activité » : un score agrégé côté
 * serveur, sans unité affichée et sans définition visible. Une mesure qu'on ne
 * peut pas définir en une phrase n'aide personne à décider — elle donne juste
 * l'air d'un tableau de bord. La barre représente maintenant le nombre
 * d'interactions reçues sur le créneau, qui est une quantité réelle.
 *
 * Ont disparu avec lui : la grille de fond, l'axe des ordonnées gradué en
 * « indice », et la ligne « maintiens et glisse pour comparer » — l'affordance
 * se découvre en posant le doigt, elle n'a pas besoin d'être annoncée.
 *
 * La seule question à laquelle ce bloc répond est « à quelle heure publier ».
 * Le créneau le plus fort est donc le seul mis en avant, et il est écrit en
 * toutes lettres au-dessus.
 */

import React, { useCallback, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Rect } from 'react-native-svg';

import { colors, fonts, withAlpha } from '../../theme';
import { num } from './format';

const HEIGHT = 96;
const AXIS_LABELS = [0, 6, 12, 18, 23];

export interface HourSlot {
  hour: number;
  tweets: number;
  interactions: number;
}

interface Props {
  slots: HourSlot[];
  width: number;
}

export default function HourBand({ slots, width }: Props) {
  const [inspected, setInspected] = useState<number | null>(null);

  const hours = useMemo(() => {
    const byHour = new Map(slots.map((slot) => [slot.hour, slot]));
    return Array.from({ length: 24 }, (_, hour) => {
      const slot = byHour.get(hour);
      return {
        hour,
        tweets: slot?.tweets ?? 0,
        interactions: slot?.interactions ?? 0,
      };
    });
  }, [slots]);

  const peak = useMemo(
    () => hours.reduce((best, slot) => (slot.interactions > best.interactions ? slot : best), hours[0]),
    [hours],
  );

  const maximum = Math.max(1, peak.interactions);
  const slotWidth = width / 24;
  const barWidth = Math.max(3, slotWidth * 0.5);

  const pick = useCallback(
    (locationX: number) => {
      const index = Math.floor(locationX / Math.max(1, slotWidth));
      setInspected(Math.min(23, Math.max(0, index)));
    },
    [slotWidth],
  );

  const shown = inspected !== null ? hours[inspected] : peak;
  const empty = peak.interactions === 0;

  return (
    <View>
      <Text style={styles.readout}>
        <Text style={styles.readoutHour}>
          {shown.hour}h–{(shown.hour + 1) % 24}h
        </Text>
        {empty
          ? '  aucune interaction mesurée'
          : `  ${num(shown.interactions)} interaction${shown.interactions > 1 ? 's' : ''}` +
            (shown.tweets > 0 ? ` · ${num(shown.tweets)} publication${shown.tweets > 1 ? 's' : ''}` : '')}
      </Text>

      <View
        style={{ width, height: HEIGHT }}
        onStartShouldSetResponder={() => !empty}
        onMoveShouldSetResponder={() => !empty}
        onResponderTerminationRequest={() => false}
        onResponderGrant={(e) => pick(e.nativeEvent.locationX)}
        onResponderMove={(e) => pick(e.nativeEvent.locationX)}
        onResponderRelease={() => setInspected(null)}
        onResponderTerminate={() => setInspected(null)}
        accessibilityRole="image"
        accessibilityLabel={
          empty
            ? "Aucune activité d'audience mesurée sur la période."
            : `Activité de l'audience heure par heure. Créneau le plus fort : ${peak.hour} heures. Fais glisser le doigt pour lire un créneau.`
        }
      >
        <Svg width={width} height={HEIGHT}>
          {hours.map((slot) => {
            const barHeight = Math.max(2, (slot.interactions / maximum) * (HEIGHT - 4));
            const active = inspected === slot.hour || (inspected === null && slot.hour === peak.hour);
            return (
              <Rect
                key={slot.hour}
                x={slotWidth * slot.hour + (slotWidth - barWidth) / 2}
                y={HEIGHT - barHeight}
                width={barWidth}
                height={barHeight}
                rx={barWidth / 2}
                fill={active && !empty ? colors.accent : withAlpha(colors.accent, 0.28)}
              />
            );
          })}
        </Svg>
      </View>

      <View style={[styles.axis, { width }]} pointerEvents="none">
        {AXIS_LABELS.map((hour) => (
          <Text key={hour} style={styles.axisLabel}>
            {hour}h
          </Text>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  readout: {
    marginBottom: 12,
    fontSize: 15,
    lineHeight: 20,
    fontFamily: fonts.regular,
    color: colors.textSecondary,
  },
  readoutHour: {
    fontFamily: fonts.mono,
    color: colors.textPrimary,
  },
  axis: {
    marginTop: 6,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  axisLabel: {
    fontSize: 12,
    fontFamily: fonts.mono,
    color: colors.textMuted,
  },
});
