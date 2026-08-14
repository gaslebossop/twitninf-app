import React, { memo, useMemo } from 'react';
import Svg, {
  Circle,
  Defs,
  Ellipse,
  G,
  LinearGradient as SvgLinearGradient,
  Path,
  Polygon,
  RadialGradient,
  Rect,
  Stop,
} from 'react-native-svg';
import { withAlpha } from '../../theme';
import type { QuestRewardKind } from '../../types/events';

/**
 * L'illustration d'une récompense.
 *
 * ── Pourquoi du vectoriel dessiné en code, et pas des images ──────────────
 * Le dossier `assets` ne contient que les icônes de l'application : il n'y a
 * aucune illustration de récompense, et en fabriquer trente en bitmap
 * demanderait un travail graphique, un pipeline d'export en trois densités, et
 * ferait grossir le binaire d'une app déjà distribuée en sideload.
 *
 * Le vectoriel règle les trois problèmes à la fois :
 *  - net à n'importe quelle densité et n'importe quelle taille, donc réellement
 *    responsive — la même illustration sert de vignette de 44 px et de visuel
 *    de 120 px sur tablette ;
 *  - **teintable** : chaque illustration prend la couleur du palier de sa
 *    quête, ce qui donne trente-deux variantes visuelles (huit types × quatre
 *    paliers) pour le poids de zéro fichier ;
 *  - aucun octet ajouté au bundle.
 *
 * ── Le parti pris graphique ───────────────────────────────────────────────
 * Chaque type a une SILHOUETTE différente, reconnaissable en vignette avant
 * même d'être lue. Un jeu d'icônes toutes rondes et toutes dorées se serait lu
 * comme une seule et même récompense répétée huit fois.
 */

interface Props {
  kind: QuestRewardKind;
  /** Couleur du palier de la quête. Donne son identité à l'illustration. */
  tint: string;
  /** Seconde couleur, pour la profondeur des dégradés. */
  accent: string;
  size?: number;
  /** Éteint tout : récompense pas encore obtenue. */
  dimmed?: boolean;
}

function RewardArtBase({ kind, tint, accent, size = 72, dimmed = false }: Props) {
  // Les identifiants de dégradé sont GLOBAUX au document SVG. Deux vignettes
  // partageant le même id sur un écran feraient prendre à la seconde le
  // dégradé de la première — d'où le suffixe par type.
  const uid = useMemo(() => `${kind}-${Math.round(size)}`, [kind, size]);

  const main = dimmed ? withAlpha(tint, 0.32) : tint;
  const glow = dimmed ? withAlpha(accent, 0.16) : withAlpha(accent, 0.55);
  const light = dimmed ? withAlpha('#FFFFFF', 0.12) : withAlpha('#FFFFFF', 0.4);

  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <Defs>
        {/* Halo commun : c'est lui qui pose l'objet dans la lumière plutôt que
            de le laisser flotter sur un aplat. */}
        <RadialGradient id={`halo-${uid}`} cx="50%" cy="46%" r="52%">
          <Stop offset="0%" stopColor={glow} stopOpacity="1" />
          <Stop offset="100%" stopColor={glow} stopOpacity="0" />
        </RadialGradient>
        <SvgLinearGradient id={`body-${uid}`} x1="0%" y1="0%" x2="100%" y2="100%">
          <Stop offset="0%" stopColor={light} />
          <Stop offset="45%" stopColor={main} />
          <Stop offset="100%" stopColor={dimmed ? main : accent} />
        </SvgLinearGradient>
      </Defs>

      <Circle cx="50" cy="48" r="44" fill={`url(#halo-${uid})`} />

      {kind === 'coins' && (
        // Une pile : trois disques décalés. Un seul disque se lirait comme un
        // jeton, pas comme un gain.
        <G>
          <Ellipse cx="50" cy="70" rx="30" ry="11" fill={main} opacity={0.45} />
          <Ellipse cx="50" cy="60" rx="30" ry="11" fill={`url(#body-${uid})`} />
          <Ellipse cx="50" cy="49" rx="30" ry="11" fill={`url(#body-${uid})`} />
          <Ellipse cx="50" cy="38" rx="30" ry="11" fill={`url(#body-${uid})`} />
          <Ellipse cx="50" cy="38" rx="19" ry="6.5" fill={light} opacity={0.55} />
        </G>
      )}

      {kind === 'pro_days' && (
        // Une étoile à cinq branches, franche : c'est le signe universel du
        // « statut », et il se distingue de tout le reste en vignette.
        <G>
          <Polygon
            points="50,16 60,39 85,41 66,57 72,82 50,69 28,82 34,57 15,41 40,39"
            fill={`url(#body-${uid})`}
          />
          <Polygon points="50,26 56,41 72,42 60,52 64,68 50,59" fill={light} opacity={0.4} />
        </G>
      )}

      {kind === 'cosmetic' && (
        // Une fleur : quatre pétales autour d'un cœur. Rappelle les décorations
        // d'avatar, qui sont l'essentiel des cosmétiques de l'événement.
        <G>
          {[0, 90, 180, 270].map((angle) => (
            <Ellipse
              key={angle}
              cx="50"
              cy="30"
              rx="13"
              ry="21"
              fill={`url(#body-${uid})`}
              opacity={0.9}
              transform={`rotate(${angle} 50 50)`}
            />
          ))}
          <Circle cx="50" cy="50" r="11" fill={light} opacity={0.75} />
        </G>
      )}

      {kind === 'badge' && (
        // Médaille et rubans. La silhouette la plus « trophée » du jeu, réservée
        // aux deux récompenses légendaires.
        <G>
          <Path d="M34 14 L44 14 L52 44 L40 48 Z" fill={main} opacity={0.65} />
          <Path d="M66 14 L56 14 L48 44 L60 48 Z" fill={main} opacity={0.45} />
          <Circle cx="50" cy="62" r="26" fill={`url(#body-${uid})`} />
          <Circle cx="50" cy="62" r="17" fill={light} opacity={0.35} />
          <Polygon points="50,50 54,60 64,60 56,66 59,76 50,70 41,76 44,66 36,60 46,60" fill={light} opacity={0.85} />
        </G>
      )}

      {kind === 'title' && (
        // Une banderole : le titre s'affiche sous le pseudo, l'objet doit donc
        // évoquer une inscription, pas un objet à posséder.
        <G>
          <Path d="M14 34 H86 V62 H14 Z" fill={`url(#body-${uid})`} />
          <Path d="M14 34 L4 48 L14 62 Z" fill={main} opacity={0.6} />
          <Path d="M86 34 L96 48 L86 62 Z" fill={main} opacity={0.6} />
          <Rect x="26" y="43" width="48" height="4" rx="2" fill={light} opacity={0.8} />
          <Rect x="26" y="52" width="30" height="4" rx="2" fill={light} opacity={0.5} />
        </G>
      )}

      {kind === 'lootbox' && (
        // Un paquet avec des rayons : c'est la seule récompense dont on ignore
        // le contenu, et les rayons sont ce qui dit « il y a quelque chose
        // dedans » sans dire quoi.
        <G>
          {[0, 45, 90, 135].map((angle) => (
            <Rect
              key={angle}
              x="48.5"
              y="6"
              width="3"
              height="14"
              rx="1.5"
              fill={main}
              opacity={0.55}
              transform={`rotate(${angle} 50 50)`}
            />
          ))}
          <Path d="M18 44 H82 V84 H18 Z" fill={`url(#body-${uid})`} />
          <Path d="M14 30 H86 V46 H14 Z" fill={main} />
          <Rect x="44" y="30" width="12" height="54" fill={light} opacity={0.55} />
          <Path d="M50 30 C 40 30 34 18 44 18 C 50 18 50 26 50 30 Z" fill={main} opacity={0.85} />
          <Path d="M50 30 C 60 30 66 18 56 18 C 50 18 50 26 50 30 Z" fill={main} opacity={0.85} />
        </G>
      )}

      {kind === 'multiplier' && (
        // L'éclair : un bonus temporaire n'est pas un objet, c'est une décharge.
        <G>
          <Path d="M56 8 L26 54 H46 L42 92 L74 44 H52 Z" fill={`url(#body-${uid})`} />
          <Path d="M53 20 L36 50 H50 L47 74" stroke={light} strokeWidth="3" fill="none" opacity={0.6} />
        </G>
      )}

      {kind === 'unlock' && (
        <G>
          <Circle cx="38" cy="40" r="20" fill="none" stroke={`url(#body-${uid})`} strokeWidth="11" />
          <Rect x="46" y="52" width="10" height="36" rx="4" fill={`url(#body-${uid})`} />
          <Rect x="54" y="64" width="16" height="8" rx="3" fill={main} />
          <Rect x="54" y="78" width="12" height="8" rx="3" fill={main} />
        </G>
      )}
    </Svg>
  );
}

export default memo(RewardArtBase);
