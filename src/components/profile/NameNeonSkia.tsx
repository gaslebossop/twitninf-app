import React, { useMemo, useRef } from 'react';
import { StyleSheet, useWindowDimensions } from 'react-native';
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
 * noyau diffère d'une plateforme à l'autre (iOS la rend comme un nuage diffus
 * dès ~40 px, d'où le plafond `NAME_GLOW_MAX_RADIUS` de `ProfileDecoration`),
 * elle ne s'additionne pas proprement, et le rayon n'est pas animable.
 *
 * Ici, chaque couche est le GLYPHE passé dans un vrai flou gaussien, à un
 * rayon différent. C'est la définition d'un tube néon : le gaz s'allume en
 * couleur pure à la paroi, et la lumière décroît selon une vraie gaussienne.
 *
 * ── Ce qu'on ne fait PAS ─────────────────────────────────────────────────
 *
 * Le cœur du glyphe reste dessiné par React Native, par-dessus. Le redessiner
 * dans Skia obligerait à reproduire à l'identique la mise en page de RN, et
 * le moindre écart décalerait le nom lui-même. Un halo FLOU, lui, tolère
 * largement un pixel de décalage — c'est ce qui rend ce partage sûr.
 *
 * ── Pourquoi `Paragraph` et pas `Text` ───────────────────────────────────
 *
 * L'effet « Néon » écarte les lettres (`neonSpacing`, `letterSpacing: 1.2`).
 * Le `Text` de Skia ne connaît pas l'interlettrage : sur un nom de quinze
 * caractères, la lueur aurait pris presque vingt pixels de retard sur le
 * dernier glyphe. Un halo décalé de vingt pixels ne se rattrape pas au flou,
 * il se voit comme une traîne. `Paragraph` porte `letterSpacing` et
 * `heightMultiplier`, donc il suit exactement le texte de RN.
 *
 * ── La garde sur le retour à la ligne ────────────────────────────────────
 *
 * On force une largeur de mise en page ÉNORME, donc une seule ligne, et on
 * rend la main dès que le nom risquait de ne pas tenir. Laisser `Paragraph`
 * couper tout seul serait pire : rien ne garantit qu'il coupe au même mot que
 * React Native, et une lueur répartie sur d'autres lignes que le texte est le
 * défaut le plus visible qu'on puisse produire ici.
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

/** Largeur de mise en page : assez grande pour qu'aucun nom ne se coupe. */
const NO_WRAP = 100000;

export interface NeonLayer {
  /**
   * Écart-type de la gaussienne, en px — et non un rayon d'ombre.
   *
   * Les deux unités ne se comparent pas : la première version passait ici le
   * rayon d'ombre de la version RN divisé par deux, ce qui donnait un sigma
   * de 18 sur un nom en taille « Géant ». Une gaussienne de sigma 18 sur un
   * glyphe PLEIN, c'est un nuage de plus de cinquante pixels — la dalle rose
   * vue à l'écran. L'appelant fournit désormais un sigma calibré pour ce
   * rendu-ci (`SKIA_NEON_LAYERS`).
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

/**
 * La police du nom est-elle chargée ?
 *
 * L'appelant doit le savoir AVANT de rendre : la réponse décide entre deux
 * dessins complets, ce vrai flou ou les quatre couches d'ombres. Un composant
 * qui rendrait `null` en cas d'échec laisserait un nom sans aucune lueur — le
 * pire des trois résultats.
 *
 * Le hook est appelé inconditionnellement pour que le compte de hooks ne bouge
 * pas. Il rend `null` tant que la police n'est pas là (le chargement est
 * asynchrone) et l'appelant garde ses ombres pendant ce temps : le passage de
 * l'une à l'autre est un raffinement du même halo, mêmes couleurs et mêmes
 * rayons, pas une apparition.
 */
export function useNeonParagraphs(
  name: string,
  type: NeonTypography,
  layers: NeonLayer[],
  numberOfLines: number,
): any[] | null {
  const request = useMemo(() => {
    const source = type.fontFamily ? FONT_SOURCES[type.fontFamily] : undefined;
    return source ? { [type.fontFamily as string]: [source] } : {};
  }, [type.fontFamily]);

  const provider = K ? K.useFonts(request) : null;
  const ready = !!(K && provider && type.fontFamily && FONT_SOURCES[type.fontFamily]);
  const { width: screenWidth } = useWindowDimensions();

  return useMemo(() => {
    if (!ready) return null;
    try {
      /**
       * Un paragraphe par couche : seule la couleur change, et `Paragraph`
       * porte sa couleur dans son style, pas dans la peinture qui le dessine.
       */
      const paragraphs = layers.map((layer) =>
        K.Skia.ParagraphBuilder.Make({}, provider)
          .pushStyle({
            fontFamilies: [type.fontFamily],
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
      paragraphs.forEach((p: any) => p.layout(NO_WRAP));

      /**
       * ── LA GARDE, ET POURQUOI ELLE DOIT ÉCHOUER DU BON CÔTÉ ────────────
       *
       * Vu à l'écran : le nom écrit DEUX FOIS. React Native l'avait passé à
       * la ligne (« Kosp et » / « Caramel ») pendant que ce paragraphe, mis
       * en page sans contrainte de largeur, le gardait sur une seule ligne.
       * La lueur de « Caramel » se retrouvait donc en haut, là où le texte
       * net n'était pas — un mot fantôme flou à côté du vrai.
       *
       * La garde existait déjà. Elle n'a pas tiré parce qu'elle faisait
       * `getLongestLine?.() ?? 0` : quand la mesure n'est pas disponible,
       * elle valait zéro, zéro tient dans n'importe quelle largeur, et on
       * passait. Une valeur par défaut OPTIMISTE sur une mesure de sécurité
       * est toujours le mauvais choix.
       *
       * Sans mesure exploitable, on rend donc la main. Et la condition ne
       * dépend plus de `numberOfLines` : même limité à une ligne, React
       * Native COUPE un nom trop long avec des points de suspension, que ce
       * paragraphe-ci ne reproduirait pas.
       *
       * La largeur disponible n'est pas connue ici — le nom vit dans une
       * rangée qui porte aussi les sceaux. L'estimation reste VOLONTAIREMENT
       * pessimiste : se tromper vers le repli ne coûte que la finesse du
       * flou, se tromper dans l'autre sens réécrit le nom.
       */
      const width = paragraphs[0]?.getLongestLine?.();
      if (typeof width !== 'number' || !Number.isFinite(width) || width <= 0) return null;
      if (width > screenWidth - 32 - 72) return null;

      return paragraphs;
    } catch {
      // Une police introuvable ou un style refusé ne doit pas emporter le
      // profil : on rend la main et l'appelant garde ses ombres.
      return null;
    }
  }, [ready, provider, layers, type.fontFamily, type.fontSize, type.letterSpacing, type.lineHeight, name, numberOfLines, screenWidth]);
}

export interface NameNeonSkiaProps {
  paragraphs: any[];
  layers: NeonLayer[];
  /** Marge ouverte autour du texte par l'appelant, en px. */
  bleed: number;
}

/**
 * Une couche. Un composant à part parce qu'elle porte son propre
 * `useDerivedValue` : appelé dans un `.map`, le hook changerait de compte dès
 * que la liste changerait de longueur.
 */
function GlowLayer({
  paragraph, sigma, min, max, x, y, phase,
}: {
  paragraph: any;
  sigma: number;
  min: number;
  max: number;
  x: number;
  y: number;
  phase: any;
}) {
  const opacity = useDerivedValue(() => min + (max - min) * phase.value, [min, max]);

  return (
    <Group layer={<Paint opacity={opacity}><Blur blur={sigma} /></Paint>}>
      <SkParagraph paragraph={paragraph} x={x} y={y} width={NO_WRAP} />
    </Group>
  );
}

export default function NameNeonSkia({ paragraphs, layers, bleed }: NameNeonSkiaProps) {
  const clock = K.useClock();

  /**
   * Le `Canvas` de Skia rogne à ses bords. Une gaussienne porte à environ
   * trois sigmas : au-delà de `bleed / 3`, la lueur se fait couper au carré
   * et on voit un rectangle autour du nom au lieu d'un halo. Le plafond est
   * ici, et pas seulement dans la table d'appel, pour qu'aucun réglage futur
   * ne puisse produire ce défaut.
   */
  const maxSigma = Math.max(1, bleed / 3);

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
    if (still) return 0.65;
    const elapsed = mountedAt - epoch + clock.value;
    const t = (elapsed % LIT_PULSE_CYCLE_MS) / LIT_PULSE_CYCLE_MS;
    // Onde triangulaire 0 → 1 → 0, exactement celle de `litPulse`.
    return t < 0.5 ? t * 2 : 2 - t * 2;
  }, [still]);

  return (
    <Canvas style={StyleSheet.absoluteFill} pointerEvents="none">
      {paragraphs.map((paragraph: any, i: number) => (
        <GlowLayer
          key={layers[i].sigma}
          paragraph={paragraph}
          sigma={Math.min(layers[i].sigma, maxSigma)}
          min={layers[i].min}
          max={layers[i].max}
          x={bleed}
          y={bleed}
          phase={phase}
        />
      ))}
    </Canvas>
  );
}
