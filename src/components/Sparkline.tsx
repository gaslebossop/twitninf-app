import React, { useEffect } from 'react';
import { StyleProp, View, ViewStyle } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import Animated, {
  Easing,
  useAnimatedProps,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { colors, withAlpha } from '../theme';

const AnimatedPath = Animated.createAnimatedComponent(Path);

/**
 * Courbe de tendance, sans axes ni graduations.
 *
 * Elle ne sert pas à lire une valeur — le montant exact est écrit juste
 * au-dessus. Elle répond à une seule question, celle qu'on se pose en
 * ouvrant l'écran : est-ce que ça monte ? D'où l'absence de tout habillage.
 *
 * Le tracé se dessine à l'arrivée (600 ms, sans rebond). C'est une entrée,
 * pas une boucle : l'écran n'est pas recyclé comme une ligne de liste, elle
 * ne se rejouera donc pas dans le dos de l'utilisateur.
 *
 * Une série plate ou vide ne dessine rien : une ligne droite au milieu du
 * cadre laisserait croire à une mesure alors qu'il n'y a rien à mesurer.
 */

interface Props {
  values: number[];
  width: number;
  height?: number;
  color?: string;
  style?: StyleProp<ViewStyle>;
}

export default function Sparkline({
  values,
  width,
  height = 44,
  color = colors.gold,
  style,
}: Props) {
  const progress = useSharedValue(0);

  const clean = values.filter((v) => Number.isFinite(v));
  const max = Math.max(...clean, 0);
  const hasShape = clean.length >= 2 && max > 0;

  useEffect(() => {
    progress.value = 0;
    progress.value = withTiming(1, { duration: 600, easing: Easing.out(Easing.cubic) });
  }, [progress, clean.length, max]);

  // `strokeDasharray` sur la longueur totale + un décalage animé : le trait
  // se révèle de gauche à droite. La longueur exacte n'a pas besoin d'être
  // mesurée, une borne large suffit à couvrir le chemin.
  const span = width * 2;
  const animatedProps = useAnimatedProps(() => ({
    strokeDashoffset: span * (1 - progress.value),
  }));

  if (!hasShape) return <View style={[{ width, height }, style]} />;

  const stepX = width / (clean.length - 1);
  const usable = height - 6;
  const points = clean.map((value, index) => {
    const x = index * stepX;
    const y = height - 3 - (value / max) * usable;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });

  return (
    <View style={[{ width, height }, style]}>
      <Svg width={width} height={height}>
        {/* Ligne de base : sans elle, une courbe qui démarre à zéro semble
            flotter au-dessus de rien. */}
        <Path
          d={`M0,${height - 3} L${width},${height - 3}`}
          stroke={withAlpha(color, 0.18)}
          strokeWidth={1}
        />
        <AnimatedPath
          d={`M${points.join(' L')}`}
          stroke={color}
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
          strokeDasharray={span}
          animatedProps={animatedProps}
        />
      </Svg>
    </View>
  );
}
