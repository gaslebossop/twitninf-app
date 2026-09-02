import React, { useMemo, useRef, useState } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import { useDerivedValue } from 'react-native-reanimated';
import { coreFontAssets, displayNameFontAssets } from '../../theme';
import { LIT_PULSE_CYCLE_MS, litPulseEpoch } from '../../utils/litPulse';
import { isReduceMotionEnabled } from '../../hooks/useReduceMotion';
import { skia } from './skiaRuntime';

/**
 * Le néon du nom, au vrai flou gaussien.
 *
 * ── Ce qui se jouait avant, et pourquoi ce n'était pas un tube ───────────
 *
 * La version React Native empile quatre `<Text>` transparents dont seule
 * l'ombre est peinte (`textShadowRadius`). La recette est juste — et c'est
 * une IMITATION de flou : une ombre portée n'est pas une convolution. Son
 * noyau diffère d'une plateforme à l'autre, elle ne s'additionne pas
 * proprement, et le rayon n'est pas animable.
 *
 * Ici, chaque couche est le GLYPHE passé dans un vrai flou gaussien, à un
 * rayon différent. C'est la définition d'un tube néon.
 *
 * ── LE PIÈGE, ET IL A COÛTÉ DEUX ALLERS-RETOURS ──────────────────────────
 *
 * Le cœur du nom est dessiné par React Native ; seule la lueur l'est ici. Les
 * deux doivent donc couper le texte au MÊME endroit, sinon la lueur d'un mot
 * se pose là où le texte net n'est pas — à l'écran, le nom paraît écrit deux
 * fois, une fois net et une fois en fantôme flou.
 *
 * Deux tentatives ratées, pour la même raison de fond :
 *
 *  1. Mise en page sans contrainte de largeur, avec une garde en `?? 0` : la
 *     mesure manquante valait zéro, zéro tient partout, on passait.
 *  2. Garde sur une largeur ESTIMÉE (« l'écran moins les marges et la place
 *     des sceaux »). Mesuré ensuite sur la capture : le nom faisait 269 pt
 *     pour une place estimée à 289. L'estimation disait « ça tient », React
 *     Native passait quand même à la ligne.
 *
 * **On ne devine plus rien.** Le composant MESURE sa propre boîte — celle du
 * texte, à la marge de lueur près — et met le paragraphe en page à cette
 * largeur-là. S'il en sort sur plus d'une ligne, c'est que React Native aussi,
 * et on rend la main aux quatre couches d'ombres, qui savent, elles, suivre
 * le texte sur deux lignes.
 *
 * Le repli est rendu PAR CE COMPOSANT (`children`), et non décidé par
 * l'appelant : la décision dépend d'une mesure qui n'existe qu'ici, après le
 * premier passage de mise en page.
 */

const K = skia();

const Canvas = K?.Canvas;
const Group = K?.Group;
const Paint = K?.Paint;
const Blur = K?.Blur;
const SkParagraph = K?.Paragraph;

/**
 * Toutes les polices que le nom peut porter, indexées par nom de FAMILLE —
 * c'est-à-dire par ce qu'un style React Native contient réellement.
 *
 * Aucun nouvel import : ce sont exactement les deux tables que `theme/fonts`
 * donne déjà à `useFonts`. Un nom affiché ne peut donc pas porter une police
 * absente d'ici, par construction.
 */
const FONT_SOURCES: Record<string, any> = { ...coreFontAssets, ...displayNameFontAssets };

/**
 * Marge de sécurité sur la largeur mesurée.
 *
 * Skia et React Native ne composent pas le texte avec le même moteur : à
 * quelques dixièmes de point près, un nom qui tient tout juste chez l'un peut
 * passer à la ligne chez l'autre. On exige donc qu'il tienne dans 94 % de la
 * boîte, pas dans 100 %.
 */
const FIT = 0.94;

export interface NeonLayer {
  /**
   * Écart-type de la gaussienne, en px — et non un rayon d'ombre. Les deux
   * unités ne se comparent pas (voir `SKIA_NEON_LAYERS` côté appelant).
   */
  sigma: number;
  color: string;
  /** Opacité au creux et à la crête de la respiration. */
  min: number;
  max: number;
}

export interface NeonTypography {
  fontFamily?: string;
  fontSize: number;
  letterSpacing?: number;
  lineHeight?: number;
}

export interface NameNeonSkiaProps {
  name: string;
  layers: NeonLayer[];
  type: NeonTypography;
  /** Marge ouverte autour du texte par l'appelant, en px. */
  bleed: number;
  /** Le repli : les couches d'ombres, rendues si le néon ne peut pas servir. */
  children: React.ReactNode;
}

/**
 * Une couche. Un composant à part parce qu'elle porte son propre
 * `useDerivedValue` : appelé dans un `.map`, le hook changerait de compte dès
 * que la liste changerait de longueur.
 */
function GlowLayer({
  paragraph, sigma, min, max, x, y, width, phase,
}: {
  paragraph: any;
  sigma: number;
  min: number;
  max: number;
  x: number;
  y: number;
  width: number;
  phase: any;
}) {
  const opacity = useDerivedValue(() => min + (max - min) * phase.value, [min, max]);

  return (
    <Group layer={<Paint opacity={opacity}><Blur blur={sigma} /></Paint>}>
      <SkParagraph paragraph={paragraph} x={x} y={y} width={width} />
    </Group>
  );
}

export default function NameNeonSkia({
  name, layers, type, bleed, children,
}: NameNeonSkiaProps) {
  /**
   * Largeur réelle de la boîte du nom, marge de lueur comprise. Zéro tant que
   * la mise en page n'a pas eu lieu : on rend le repli pendant ce temps-là,
   * donc le nom n'est jamais sans lueur.
   */
  const [box, setBox] = useState(0);
  const onLayout = (e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width;
    setBox((prev) => (Math.abs(prev - w) < 0.5 ? prev : w));
  };

  const request = useMemo(() => {
    const source = type.fontFamily ? FONT_SOURCES[type.fontFamily] : undefined;
    return source ? { [type.fontFamily as string]: [source] } : {};
  }, [type.fontFamily]);

  const provider = K ? K.useFonts(request) : null;
  const clock = K ? K.useClock() : null;

  /**
   * Origine de la respiration, en temps mural. La pastille de certification
   * bat sur une `Animated.Value` du cœur RN, qu'aucun monde Skia ne peut
   * lire ; on rejoue la même onde depuis la même origine, ce qui les remet en
   * phase au lieu de les laisser dériver.
   */
  const epoch = useRef(litPulseEpoch()).current;
  const mountedAt = useRef(Date.now()).current;
  const still = isReduceMotionEnabled();

  const phase = useDerivedValue(() => {
    if (still || !clock) return 0.65;
    const elapsed = mountedAt - epoch + clock.value;
    const t = (elapsed % LIT_PULSE_CYCLE_MS) / LIT_PULSE_CYCLE_MS;
    // Onde triangulaire 0 → 1 → 0, exactement celle de `litPulse`.
    return t < 0.5 ? t * 2 : 2 - t * 2;
  }, [still]);

  const available = box - bleed * 2;

  const built = useMemo(() => {
    const family = type.fontFamily;
    const usable = !!K && !!provider && !!family && !!FONT_SOURCES[family];
    if (!usable || available <= 0) return null;
    try {
      // Un paragraphe par couche : seule la couleur change, et `Paragraph`
      // porte sa couleur dans son style, pas dans la peinture qui le dessine.
      const paragraphs = layers.map((layer) =>
        K.Skia.ParagraphBuilder.Make({}, provider)
          .pushStyle({
            fontFamilies: [family],
            fontSize: type.fontSize,
            letterSpacing: type.letterSpacing ?? 0,
            // Aligne la hauteur de ligne sur celle de React Native : sans lui
            // la lueur se pose quelques pixels au-dessus ou au-dessous du
            // texte, et un halo décalé verticalement se lit comme un défaut.
            heightMultiplier: type.lineHeight ? type.lineHeight / type.fontSize : undefined,
            color: K.Skia.Color(layer.color),
          })
          .addText(name)
          .build(),
      );

      // Mise en page à la largeur RÉELLE de la boîte, celle que React Native
      // a donnée au texte. C'est ce qui remplace toutes les estimations.
      paragraphs.forEach((p: any) => p.layout(available));

      const longest = paragraphs[0]?.getLongestLine?.();
      if (typeof longest !== 'number' || !Number.isFinite(longest) || longest <= 0) return null;

      // Une seule ligne, et avec de la marge. Au-delà, les deux moteurs
      // peuvent couper à des endroits différents, et une lueur posée sur une
      // autre ligne que le texte est le pire défaut possible ici.
      if (longest > available * FIT) return null;

      return paragraphs;
    } catch {
      // Une police introuvable ou un style refusé ne doit pas emporter le
      // profil : on rend la main et l'appelant garde ses ombres.
      return null;
    }
  }, [
    provider, layers, type.fontFamily, type.fontSize, type.letterSpacing,
    type.lineHeight, name, available,
  ]);

  return (
    <View style={StyleSheet.absoluteFill} onLayout={onLayout} pointerEvents="none">
      {built ? (
        <Canvas style={StyleSheet.absoluteFill} pointerEvents="none">
          {built.map((paragraph: any, i: number) => (
            <GlowLayer
              key={layers[i].sigma}
              paragraph={paragraph}
              sigma={Math.min(layers[i].sigma, Math.max(1, bleed / 3))}
              min={layers[i].min}
              max={layers[i].max}
              x={bleed}
              y={bleed}
              width={available}
              phase={phase}
            />
          ))}
        </Canvas>
      ) : (
        children
      )}
    </View>
  );
}
