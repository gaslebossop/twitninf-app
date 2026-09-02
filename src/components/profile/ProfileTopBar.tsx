import React, { memo } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedStyle,
  type SharedValue,
} from 'react-native-reanimated';
import { BlurView } from 'expo-blur';
import Ionicons from '@expo/vector-icons/Ionicons';
import { colors, fonts, isDarkTheme, withAlpha } from '../../theme';
import { HEADER_CONTENT_HEIGHT } from '../../hooks/useHeaderMetrics';
import Avatar from '../Avatar';
import VerifiedBadge from '../VerifiedBadge';
import Tappable from '../ui/Tappable';

/**
 * Barre haute du profil — le repère qui ne quitte jamais l'écran.
 *
 * Le profil est une carte d'identité : tant qu'on regarde la carte, le nom n'a
 * pas besoin d'être répété. Dès qu'elle sort du cadre, il le faut — sinon on
 * lit une liste de posts sans savoir de qui. C'est tout ce que fait cette
 * barre, et c'est pourquoi elle n'apparaît qu'au moment où la carte part.
 *
 * ── Pourquoi du flou ICI, et nulle part ailleurs ─────────────────────────
 * La règle « Pulse » bannit le `BlurView` DÉCORATIF — le verre posé sur une
 * carte, sur un bouton, sur un fond. Elle ne bannit pas la couche de
 * navigation, et c'est exactement la distinction qu'Apple pose : le matériau
 * est réservé à ce qui FLOTTE au-dessus du contenu, et jamais empilé sur un
 * autre matériau. Une barre opaque coupe la page en deux ; une barre floue
 * dit « il y a du contenu dessous, il continue ». C'est le seul endroit de
 * l'écran qui en porte.
 *
 * Le flou est monté à intensité FIXE dans un calque dont on anime l'opacité.
 * Animer `intensity` demanderait `useAnimatedProps` sur une prop native que
 * `expo-blur` n'honore pas de la même façon des deux côtés ; l'opacité, elle,
 * est une transformation de vue ordinaire, donc identique partout.
 *
 * ── Pourquoi le pilotage vient d'une valeur partagée ─────────────────────
 * `scrollY` est écrit par le worklet de `usePullRefreshLogo`, sur le thread
 * UI. La barre se peint à la cadence de la liste, y compris pendant que le
 * thread JS virtualise cinquante `TweetCard`. Un en-tête piloté par un
 * `useState` alimenté depuis `onScroll` retarde précisément là où on regarde.
 *
 * ── Les deux seuils ──────────────────────────────────────────────────────
 * `fadeEnd` est la distance au bout de laquelle la bannière est entièrement
 * passée SOUS la barre : au-delà il n'y a plus d'image derrière, la matière
 * doit être là. `fadeStart` ouvre la transition 32 px plus tôt.
 *
 * Trente-deux pixels, et pas cent : étalée, la transition laisse le titre à
 * 40 % d'opacité pendant la moitié du geste — illisible et sale. Et le FOND
 * arrive AVANT le titre (il finit à `fadeEnd`, le titre à `fadeEnd + 16`),
 * sinon le titre s'affiche un instant par-dessus du contenu qui défile.
 */

export interface ProfileTopBarProps {
  scrollY: SharedValue<number>;
  /** Hauteur de l'image de bannière : c'est elle qui fixe le seuil. */
  bannerHeight: number;
  /** Inset haut réel de l'appareil (encoche / barre de statut). */
  topInset: number;
  name: string;
  /** Sous-titre factuel : « 1 240 posts ». Jamais une accroche. */
  subtitle?: string;
  verified?: boolean;
  verificationStyle?: string;
  avatarUri?: string | null;
  username: string;
  /** Absent hors de son propre profil : on ne règle pas le compte d'autrui. */
  onOpenSettings?: () => void;
  onOpenMore: () => void;
  /** Bouton retour (profil d'un autre). Absent sur son propre profil. */
  leading?: React.ReactNode;
}

const FADE_SPAN = 32;

function ProfileTopBarBase({
  scrollY,
  bannerHeight,
  topInset,
  name,
  subtitle,
  verified,
  verificationStyle,
  avatarUri,
  username,
  onOpenSettings,
  onOpenMore,
  leading,
}: ProfileTopBarProps) {
  const barHeight = topInset + HEADER_CONTENT_HEIGHT;
  const fadeEnd = Math.max(FADE_SPAN + 1, bannerHeight - barHeight);
  const fadeStart = fadeEnd - FADE_SPAN;

  const backdrop = useAnimatedStyle(() => ({
    opacity: interpolate(scrollY.value, [fadeStart, fadeEnd], [0, 1], Extrapolation.CLAMP),
  }));

  /**
   * Le titre monte de 10 px en arrivant. Ce n'est pas un ornement : sans ce
   * déplacement, deux textes (celui de la carte, celui de la barre) se
   * croisent au même endroit à la même altitude et l'œil ne sait pas lequel
   * il lit. Le décalage dit lequel arrive.
   */
  const title = useAnimatedStyle(() => {
    const t = interpolate(scrollY.value, [fadeEnd - 12, fadeEnd + 16], [0, 1], Extrapolation.CLAMP);
    return { opacity: t, transform: [{ translateY: (1 - t) * 10 }] };
  });

  return (
    <View style={[S.bar, { height: barHeight, paddingTop: topInset }]} pointerEvents="box-none">
      <Animated.View style={[S.backdrop, backdrop]} pointerEvents="none">
        <BlurView
          intensity={Platform.OS === 'ios' ? 42 : 34}
          tint={isDarkTheme() ? 'dark' : 'light'}
          // Sans ce mode, `expo-blur` ne floute rien du tout sur Android : il
          // y retombe sur un simple voile semi-opaque, et la barre paraît
          // simplement grise au lieu de laisser deviner le contenu.
          experimentalBlurMethod="dimezisBlurView"
          style={StyleSheet.absoluteFill}
        />
        {/*
          Voile de lisibilité par-dessus le flou. Un flou seul laisse passer
          les valeurs claires d'une photo de bannière et le nom s'y noie ;
          c'est ce qu'Apple décrit comme « l'ombre s'opacifie au-dessus du
          texte ». Le « flou » de X n'est d'ailleurs pas une transparence :
          c'est un flou PLUS un voile quasi opaque, et la recommandation
          NN/g sur les en-têtes persistants est explicite — ils doivent être
          opaques. 0,82 laisse deviner le mouvement du contenu dessous sans
          jamais mettre un texte en danger.
        */}
        <View style={S.veil} />
        <View style={S.hairline} />
      </Animated.View>

      <View style={S.row}>
        {leading}

        <Animated.View style={[S.titleWrap, title]} pointerEvents="none">
          <Avatar size={26} username={username} uri={avatarUri as any} />
          <View style={S.titleText}>
            <View style={S.titleLine}>
              <Text style={S.name} numberOfLines={1}>{name}</Text>
              {!!verified && (
                <View style={S.titleBadge}>
                  <VerifiedBadge verificationStyle={verificationStyle as any} size={14} />
                </View>
              )}
            </View>
            {!!subtitle && <Text style={S.subtitle} numberOfLines={1}>{subtitle}</Text>}
          </View>
        </Animated.View>

        <View style={S.actions}>
          {!!onOpenSettings && (
            <Tappable
              style={S.iconBtn}
              onPress={onOpenSettings}
              scaleTo={0.92}
              accessibilityRole="button"
              accessibilityLabel="Réglages"
            >
              <Ionicons name="settings-outline" size={20} color="#FFFFFF" />
            </Tappable>
          )}
          <Tappable
            style={S.iconBtn}
            onPress={onOpenMore}
            scaleTo={0.92}
            accessibilityRole="button"
            accessibilityLabel="Plus d'options"
          >
            <Ionicons name="ellipsis-horizontal" size={20} color="#FFFFFF" />
          </Tappable>
        </View>
      </View>
    </View>
  );
}

const S = StyleSheet.create({
  bar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 30,
  },
  backdrop: {
    ...(StyleSheet.absoluteFillObject as any),
    overflow: 'hidden',
  },
  veil: {
    ...(StyleSheet.absoluteFillObject as any),
    backgroundColor: withAlpha(colors.bg, 0.82),
  },
  hairline: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.hairline,
  },
  row: {
    height: HEADER_CONTENT_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    gap: 8,
  },
  titleWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    minWidth: 0,
  },
  titleText: { flex: 1, minWidth: 0 },
  titleLine: { flexDirection: 'row', alignItems: 'center' },
  name: {
    fontFamily: fonts.bold,
    fontSize: 16,
    lineHeight: 20,
    letterSpacing: -0.2,
    color: colors.textPrimary,
    flexShrink: 1,
  },
  titleBadge: { marginLeft: 4 },
  subtitle: {
    fontFamily: fonts.regular,
    fontSize: 13,
    lineHeight: 16,
    letterSpacing: 0.1,
    color: colors.textMuted,
  },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  /**
   * Pastille sombre CONSTANTE, et non thémée : au repos ces boutons sont
   * posés sur une photo de bannière quelconque, où seul un contraste fixe
   * garantit qu'on les voit. La même pastille sur la barre en place se lit
   * comme une touche discrète — c'est le compromis que font X et Instagram,
   * et c'est aussi ce qui évite le « verre sur verre » (une pastille floue
   * sur une barre floue ne se détache plus de rien).
   */
  iconBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: withAlpha('#0B0E12', 0.55),
  },
});

export default memo(ProfileTopBarBase);
