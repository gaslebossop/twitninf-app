/**
 * Le graphique de l'écran : sept séries quotidiennes, en barres.
 *
 * ── Pourquoi c'est devenu le bloc principal ────────────────────────────────
 * Depuis que `/api/user-stats/:id/daily` sert `dwell_ms` et `earnings` (ajout
 * du 2026-08-21), le temps de lecture et l'argent existent AU JOUR. Toute
 * l'information que portait la courbe hebdomadaire attention/RPM tient donc
 * ici, dans la même unité de temps que le reste de l'écran et sans double
 * échelle superposée — c'était la chose la moins compréhensible de la page.
 *
 * ── La règle des barres ────────────────────────────────────────────────────
 * Une barre, pas une ligne. Une ligne raconte une tendance continue ; ces
 * séries sont des quantités qui tombent chaque jour et qu'on veut comparer
 * jour à jour. Une barre se vise au doigt, une ligne non.
 *
 * ── Le geste, refait ───────────────────────────────────────────────────────
 * Avant : on maintenait, on lisait, on relâchait — et la sélection sautait.
 * Impossible de regarder une valeur, de réfléchir, de comparer : il fallait
 * garder le doigt posé sur l'écran, qui masquait justement ce qu'on lisait.
 *
 * Maintenant : un appui SÉLECTIONNE et la sélection RESTE au relâchement. On
 * peut glisser pour balayer les jours, lever le doigt sur celui qu'on veut,
 * et l'écran continue de l'afficher. Un second appui sur la même barre
 * désélectionne. C'est le comportement d'une application d'analyse, pas d'une
 * infobulle.
 *
 * ── Les moyennes de ratios ─────────────────────────────────────────────────
 * Le RPM n'est pas une quantité, c'est un rapport. Son total de période n'est
 * donc pas la somme des RPM quotidiens ni leur moyenne : c'est le revenu total
 * rapporté aux vues totales. `aggregate: 'rpm'` porte cette distinction —
 * moyenner des moyennes est l'erreur classique de ce genre d'écran.
 *
 * ── Regroupement ───────────────────────────────────────────────────────────
 * Trois cent soixante-cinq barres ne tiennent pas sur un téléphone. Au-delà de
 * `MAX_BARS`, les jours sont regroupés par paquets égaux et la barre porte la
 * plage. Le regroupement somme les composantes BRUTES avant de recalculer la
 * valeur, pour que les ratios restent justes à l'intérieur du paquet aussi.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Line, Rect } from 'react-native-svg';

import { colors, fonts, withAlpha } from '../../theme';
import { NBSP, compact, dayLabel, durationInline, num, signedPercent, trim } from './format';
import { bucketDays, mergeDays, rpmOf, type Bucket, type DailyPoint } from './daily';

const HEIGHT = 176;
const PAD_TOP = 14;
const MAX_BARS = 62;

interface Metric {
  key: string;
  /** Onglet — court, sinon la rangée déborde. */
  label: string;
  /** Sous le grand chiffre — le nom complet, pour lever l'ambiguïté de l'onglet. */
  full: string;
  tone: 'attention' | 'money';
  /** `rpm` : un rapport, dont le total n'est pas une somme. */
  aggregate: 'sum' | 'rpm';
  value: (point: DailyPoint) => number;
  format: (value: number, currency: string) => string;
  /** Une moyenne par jour n'a pas de sens pour un ratio. */
  averaged: boolean;
}

const METRICS: Metric[] = [
  {
    key: 'dwell',
    label: 'Lecture',
    full: 'Temps de lecture reçu',
    tone: 'attention',
    aggregate: 'sum',
    value: (d) => d.dwellMs,
    format: (v) => durationInline(v),
    averaged: true,
  },
  {
    key: 'views',
    label: 'Vues',
    full: 'Vues de tes publications',
    tone: 'attention',
    aggregate: 'sum',
    value: (d) => d.views,
    format: (v) => num(v),
    averaged: true,
  },
  {
    key: 'earnings',
    label: 'Revenus',
    full: 'Versé par la plateforme',
    tone: 'money',
    aggregate: 'sum',
    value: (d) => d.earnings,
    format: (v, currency) => `${trim(v)}${NBSP}${currency}`,
    averaged: true,
  },
  {
    key: 'rpm',
    label: 'RPM',
    full: 'Revenu pour mille vues',
    tone: 'money',
    aggregate: 'rpm',
    value: (d) => (d.views > 0 ? (d.earnings / d.views) * 1000 : 0),
    format: (v, currency) => `${trim(v)}${NBSP}${currency}`,
    averaged: false,
  },
  {
    key: 'interactions',
    label: 'Interactions',
    full: 'J’aime, republications, commentaires, partages',
    tone: 'attention',
    aggregate: 'sum',
    value: (d) => d.interactions,
    format: (v) => num(v),
    averaged: true,
  },
  {
    key: 'followers',
    label: 'Abonnés',
    full: 'Abonnés gagnés',
    tone: 'attention',
    aggregate: 'sum',
    value: (d) => d.followers,
    format: (v) => num(v),
    averaged: true,
  },
  {
    key: 'profile',
    label: 'Profil',
    full: 'Visites de ton profil',
    tone: 'attention',
    aggregate: 'sum',
    value: (d) => d.profileViews,
    format: (v) => num(v),
    averaged: true,
  },
];

interface Props {
  days: DailyPoint[];
  width: number;
  currencySymbol: string;
  /** Libellé de la période, écrit sous le grand chiffre. */
  periodLabel: string;
}

function aggregate(metric: Metric, point: DailyPoint): number {
  return metric.aggregate === 'rpm' ? rpmOf(point) : metric.value(point);
}

export default function DailyChart({ days, width, currencySymbol, periodLabel }: Props) {
  const [metricKey, setMetricKey] = useState('dwell');
  const [selected, setSelected] = useState<number | null>(null);

  const selectedRef = useRef<number | null>(null);
  const startRef = useRef(0);
  const movedRef = useRef(false);
  const toggleRef = useRef(false);

  useEffect(() => {
    selectedRef.current = selected;
  }, [selected]);

  const metric = METRICS.find((m) => m.key === metricKey) ?? METRICS[0];
  const tint = metric.tone === 'money' ? colors.gold : colors.accent;

  const buckets = useMemo<Bucket[]>(() => bucketDays(days, MAX_BARS), [days]);

  const series = useMemo(() => {
    const values = buckets.map((bucket) => aggregate(metric, bucket.point));
    const maximum = Math.max(...values, 0);
    const whole = mergeDays(days);

    let peak = 0;
    values.forEach((value, i) => {
      if (value > values[peak]) peak = i;
    });

    // La comparaison porte sur les deux moitiés de la période affichée : c'est
    // la seule dont on ait les données ici, et elle est nommée comme telle
    // plutôt que présentée comme un « versus période précédente » qu'on ne
    // sait pas calculer.
    const half = Math.floor(days.length / 2);
    const first = days.slice(0, half);
    const second = days.slice(half);
    const firstTotal = half > 0 ? aggregate(metric, mergeDays(first)) : 0;
    const secondTotal = half > 0 ? aggregate(metric, mergeDays(second)) : 0;

    return {
      values,
      maximum,
      peak,
      total: aggregate(metric, whole),
      average: days.length > 0 ? metric.value(whole) / days.length : 0,
      delta: firstTotal > 0 ? (secondTotal - firstTotal) / firstTotal : null,
      hasVolume: maximum > 0,
    };
  }, [buckets, days, metric]);

  const slotWidth = buckets.length > 0 ? width / buckets.length : width;
  const barWidth = Math.max(2, Math.min(18, slotWidth * 0.62));
  const innerHeight = HEIGHT - PAD_TOP;

  const indexAt = useCallback(
    (locationX: number) =>
      Math.min(buckets.length - 1, Math.max(0, Math.floor(locationX / Math.max(1, slotWidth)))),
    [buckets.length, slotWidth],
  );

  const onGrant = useCallback(
    (locationX: number) => {
      const index = indexAt(locationX);
      // Un appui sur la barre DÉJÀ sélectionnée est une demande de
      // désélection — mais seulement si le doigt ne bouge pas ensuite.
      toggleRef.current = selectedRef.current === index;
      startRef.current = index;
      movedRef.current = false;
      setSelected(index);
    },
    [indexAt],
  );

  const onMove = useCallback(
    (locationX: number) => {
      const index = indexAt(locationX);
      if (index !== startRef.current) movedRef.current = true;
      setSelected(index);
    },
    [indexAt],
  );

  const onRelease = useCallback(() => {
    // Rien ici ne remet la sélection à zéro : c'est tout l'intérêt. Le doigt
    // se lève, la valeur reste lisible.
    if (!movedRef.current && toggleRef.current) setSelected(null);
  }, []);

  const selectorRow = (
    <View style={styles.selector} accessibilityRole="tablist">
      {METRICS.map((option) => {
        const isActive = option.key === metric.key;
        return (
          <Pressable
            key={option.key}
            accessibilityRole="tab"
            accessibilityState={{ selected: isActive }}
            accessibilityLabel={`Afficher ${option.full}`}
            hitSlop={6}
            onPress={() => {
              setMetricKey(option.key);
              setSelected(null);
            }}
            style={styles.selectorButton}
          >
            <Text style={[styles.selectorLabel, isActive && styles.selectorLabelActive]}>
              {option.label}
            </Text>
            <View
              style={[
                styles.selectorUnderline,
                isActive && { backgroundColor: option.tone === 'money' ? colors.gold : colors.accent },
              ]}
            />
          </Pressable>
        );
      })}
    </View>
  );

  if (buckets.length === 0) {
    return (
      <View>
        {selectorRow}
        <Text style={styles.emptyText}>Pas encore de jour mesuré sur cette période.</Text>
      </View>
    );
  }

  const shownBucket = selected !== null ? buckets[selected] : null;
  const shownValue = shownBucket ? aggregate(metric, shownBucket.point) : series.total;
  const delta = signedPercent(series.delta);

  return (
    <View>
      {selectorRow}

      {/* L'en-tête répond aux trois questions dans l'ordre : combien, de quoi,
          et par rapport à quoi. Sélection posée, il bascule sur le jour visé
          sans que rien ne bouge autour. */}
      <View style={styles.head}>
        <Text style={[styles.total, { color: tint }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.5}>
          {metric.format(shownValue, currencySymbol)}
        </Text>

        <Text style={styles.headLine}>
          {metric.full}
          {' · '}
          <Text style={styles.headPeriod}>
            {shownBucket
              ? shownBucket.days > 1
                ? `${dayLabel(shownBucket.from)} → ${dayLabel(shownBucket.to)}`
                : dayLabel(shownBucket.from)
              : periodLabel.toLowerCase()}
          </Text>
        </Text>

        {!shownBucket && (
          <Text style={styles.headLine}>
            {metric.averaged && series.hasVolume
              ? `${metric.format(series.average, currencySymbol)} par jour en moyenne`
              : 'Rapporté aux vues de la période'}
            {delta ? (
              <Text style={series.delta && series.delta > 0 ? styles.up : styles.down}>
                {`  ${delta} vs le début de période`}
              </Text>
            ) : null}
          </Text>
        )}
      </View>

      <View
        style={{ width, height: HEIGHT }}
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={() => true}
        onResponderTerminationRequest={() => false}
        onResponderGrant={(e) => onGrant(e.nativeEvent.locationX)}
        onResponderMove={(e) => onMove(e.nativeEvent.locationX)}
        onResponderRelease={onRelease}
        onResponderTerminate={onRelease}
        accessibilityRole="adjustable"
        accessibilityLabel={`${metric.full}, ${buckets.length} colonnes. Appuie sur une colonne pour la lire ; la sélection reste affichée.`}
      >
        <Svg width={width} height={HEIGHT}>
          {/* Le plafond de l'échelle, dit une fois. Sans lui, la hauteur d'une
              barre ne veut rien dire. */}
          {series.hasVolume && (
            <Line x1={0} x2={width} y1={PAD_TOP} y2={PAD_TOP} stroke={colors.hairline} strokeWidth={1} />
          )}

          {buckets.map((bucket, index) => {
            const value = series.values[index];
            const ratio = series.maximum > 0 ? value / series.maximum : 0;
            const barHeight = Math.max(2, ratio * (innerHeight - 4));
            const isSelected = selected === index;
            return (
              <Rect
                key={bucket.from}
                x={slotWidth * index + (slotWidth - barWidth) / 2}
                y={HEIGHT - barHeight}
                width={barWidth}
                height={barHeight}
                rx={Math.min(3, barWidth / 2)}
                fill={selected === null || isSelected ? tint : withAlpha(tint, 0.3)}
              />
            );
          })}

          <Line
            x1={0}
            x2={width}
            y1={HEIGHT}
            y2={HEIGHT}
            stroke={colors.hairline}
            strokeWidth={1}
          />
        </Svg>

        {series.hasVolume && (
          <Text style={styles.scale} pointerEvents="none">
            {metric.format(series.maximum, currencySymbol)}
          </Text>
        )}
      </View>

      <View style={[styles.axis, { width }]} pointerEvents="none">
        <Text style={styles.axisLabel}>{dayLabel(days[0].date)}</Text>
        {buckets.length > 1 && series.hasVolume && (
          <Text style={styles.axisLabel}>
            pic {dayLabel(buckets[series.peak].from)} · {metric.format(series.values[series.peak], currencySymbol)}
          </Text>
        )}
        <Text style={styles.axisLabel}>{dayLabel(days[days.length - 1].date)}</Text>
      </View>

      {metric.key === 'dwell' && (
        <Text style={styles.footnote}>
          Chronométré dans le fil, publication par publication : c'est cette mesure, et pas les
          vues, qui pèse le plus lourd dans ta part du pot créateur.
        </Text>
      )}
      {buckets.length < days.length && (
        <Text style={styles.footnote}>
          Une colonne regroupe {buckets[0].days} jours — la période est trop longue pour une
          colonne par jour. Les totaux, eux, portent bien sur {compact(days.length)} jours.
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  selector: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 16,
    marginBottom: 20,
  },
  selectorButton: {
    minHeight: 44,
    justifyContent: 'center',
    gap: 6,
  },
  selectorLabel: {
    fontSize: 15,
    fontFamily: fonts.medium,
    color: colors.textMuted,
  },
  selectorLabelActive: {
    color: colors.textPrimary,
  },
  selectorUnderline: {
    height: 2,
    borderRadius: 1,
    backgroundColor: 'transparent',
  },

  head: {
    gap: 4,
    marginBottom: 20,
  },
  total: {
    fontSize: 40,
    lineHeight: 46,
    fontFamily: fonts.mono,
    letterSpacing: -1,
  },
  headLine: {
    fontSize: 15,
    lineHeight: 21,
    fontFamily: fonts.regular,
    color: colors.textSecondary,
  },
  headPeriod: {
    fontFamily: fonts.mono,
    color: colors.textPrimary,
  },
  up: { fontFamily: fonts.mono, color: colors.success },
  down: { fontFamily: fonts.mono, color: colors.red },

  scale: {
    position: 'absolute',
    right: 0,
    top: 0,
    fontSize: 12,
    fontFamily: fonts.mono,
    color: colors.textMuted,
  },

  axis: {
    marginTop: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
  },
  axisLabel: {
    fontSize: 12,
    fontFamily: fonts.mono,
    color: colors.textMuted,
  },

  footnote: {
    marginTop: 12,
    fontSize: 13,
    lineHeight: 18,
    fontFamily: fonts.regular,
    color: colors.textMuted,
  },
  emptyText: {
    fontSize: 15,
    lineHeight: 21,
    fontFamily: fonts.regular,
    color: colors.textMuted,
  },
});
