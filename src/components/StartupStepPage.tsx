import React, { ReactNode } from 'react';
import { Platform, ScrollView, StatusBar, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  Easing,
  FadeInDown,
  SlideInRight,
  SlideOutLeft,
} from 'react-native-reanimated';

import { colors, fonts, gradients, statusBarStyle, withAlpha } from '../theme';
import { useStartupFlowMask, useStartupFlowProgress } from '../contexts/StartupPopupContext';

/**
 * Fond opaque affiché pendant le parcours de démarrage, y compris entre deux
 * étapes. Les étapes se peignent par-dessus ; lui garantit simplement que
 * l'application ne réapparaît jamais dans les interstices.
 *
 * Il se retire sous les étapes qui se posent SUR l'application au lieu de la
 * remplacer (voir `TRANSPARENT` dans StartupPopupContext) : leur contenu, c'est
 * l'application elle-même.
 */
export function StartupFlowBackdrop() {
  const masked = useStartupFlowMask();
  if (!masked) return null;
  return <View style={styles.backdrop} pointerEvents="auto" />;
}

interface StartupStepPageProps {
  visible: boolean;
  icon: keyof typeof Ionicons.glyphMap;
  /**
   * Illustration affichée à la place de la pastille d'icône. Réservé aux étapes
   * qui ont quelque chose à montrer ; `icon` reste la règle.
   */
  hero?: ReactNode;
  title: string;
  subtitle?: string;
  /** Contenu défilant de l'étape. */
  children: ReactNode;
  /** Bouton principal + notes, épinglés en bas de l'écran. */
  footer?: ReactNode;
  /** Masque l'indicateur d'avancement (étape purement informative). */
  hideProgress?: boolean;
}

/**
 * Habillage commun des étapes de démarrage.
 *
 * Ces étapes étaient sept `<Modal>` indépendantes : une carte flottante sur un
 * voile noir, chacune avec sa propre mise en page. Elles sont maintenant des
 * PAGES plein écran, dans l'esthétique du reste de l'application — même fond,
 * mêmes marges, même typographie que les écrans de réglages.
 *
 * Rendu en vue absolue plutôt qu'en `<Modal>` : ces composants sont montés à
 * la racine, à côté du navigateur, donc une vue plein écran les recouvre déjà.
 * Ça supprime au passage le problème Android des deux fenêtres natives
 * superposées qui obligeait la file d'attente à temporiser entre deux étapes.
 */
export default function StartupStepPage({
  visible,
  icon,
  hero,
  title,
  subtitle,
  children,
  footer,
  hideProgress = false,
}: StartupStepPageProps) {
  const insets = useSafeAreaInsets();
  const { stepIndex, stepCount } = useStartupFlowProgress();

  if (!visible) return null;

  // Un parcours d'une seule étape n'a pas d'avancement à montrer : « étape 1
  // sur 1 » n'apprend rien et fait bureaucratique.
  const showProgress = !hideProgress && stepCount > 1 && stepIndex > 0;

  return (
    <Animated.View
      // L'étape entre en glissant depuis la droite et sort vers la gauche :
      // c'est le geste d'un parcours qui avance, pas d'une fenêtre qui
      // apparaît. La clé force le rejeu à chaque changement d'étape.
      key={`${stepIndex}-${title}`}
      entering={SlideInRight.duration(320).easing(Easing.out(Easing.cubic))}
      exiting={SlideOutLeft.duration(220).easing(Easing.in(Easing.cubic))}
      style={[
        styles.page,
        { paddingTop: Math.max(insets.top, 12), paddingBottom: Math.max(insets.bottom, 12) },
      ]}
    >
      <StatusBar
        barStyle={statusBarStyle()}
        translucent={Platform.OS !== 'android'}
        backgroundColor="transparent"
      />

      {/* Halo de marque, en fond sous tout le contenu. */}
      <View style={styles.halo} pointerEvents="none">
        <LinearGradient colors={gradients.glow} style={StyleSheet.absoluteFill} />
      </View>

      <View style={styles.header}>
        {showProgress ? (
          <View style={styles.progressTrack}>
            {Array.from({ length: stepCount }).map((_, i) => (
              <View
                key={i}
                style={[styles.progressSegment, i < stepIndex && styles.progressSegmentDone]}
              />
            ))}
          </View>
        ) : null}

        <Animated.View entering={FadeInDown.delay(90).duration(300)}>
          {hero ? (
            <View style={styles.hero}>{hero}</View>
          ) : (
            <View style={styles.iconCircle}>
              <Ionicons name={icon} size={26} color={colors.accent} />
            </View>
          )}
          <Text style={styles.title}>{title}</Text>
          {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
        </Animated.View>
      </View>

      <Animated.View style={styles.scrollWrap} entering={FadeInDown.delay(160).duration(320)}>
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {children}
        </ScrollView>
      </Animated.View>

      {footer ? (
        <Animated.View style={styles.footer} entering={FadeInDown.delay(220).duration(320)}>
          {footer}
        </Animated.View>
      ) : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.bg,
    zIndex: 90,
  },
  page: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.bg,
    zIndex: 100,
  },
  halo: {
    position: 'absolute',
    top: -190,
    left: -60,
    right: -60,
    height: 420,
  },
  header: { paddingHorizontal: 24, paddingTop: 14 },
  progressTrack: { flexDirection: 'row', gap: 6, marginBottom: 26 },
  progressSegment: {
    flex: 1,
    height: 3,
    borderRadius: 2,
    backgroundColor: colors.border,
  },
  progressSegmentDone: { backgroundColor: colors.accent },
  hero: {
    /**
     * Centrée, contrairement à la pastille d'icône qu'elle remplace.
     *
     * La première version la calait à gauche pour « garder la page sur une
     * seule colonne ». Le raisonnement tient pour une pastille de 54 px ; il
     * ne tient plus pour une illustration de 200 et plus, qui occupe alors la
     * moitié de la largeur en laissant un vide béant à droite — on ne lit pas
     * un alignement, on lit un décalage accidentel.
     *
     * Une illustration de cette taille EST le sujet du haut de page : sa place
     * est au centre.
     */
    alignSelf: 'center',
    marginTop: -8,
    marginBottom: -4,
  },
  iconCircle: {
    width: 54,
    height: 54,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 19,
    backgroundColor: withAlpha(colors.accent, 0.12),
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: withAlpha(colors.accent, 0.45),
  },
  title: {
    marginTop: 18,
    color: colors.textPrimary,
    fontSize: 30,
    lineHeight: 35,
    letterSpacing: -0.8,
    fontFamily: fonts.display,
  },
  subtitle: {
    marginTop: 10,
    color: colors.textSecondary,
    fontSize: 14.5,
    lineHeight: 22,
    fontFamily: fonts.regular,
  },
  scrollWrap: { flex: 1, marginTop: 22 },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 24, paddingBottom: 24 },
  footer: {
    paddingHorizontal: 24,
    paddingTop: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
});

/** Styles partagés par les étapes, pour que les boutons restent identiques. */
export const stepStyles = StyleSheet.create({
  primaryButton: {
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 16,
    backgroundColor: colors.accent,
  },
  primaryButtonDisabled: { opacity: 0.4 },
  primaryText: { color: colors.onAccent, fontSize: 15, fontFamily: fonts.bold },
  secondaryButton: {
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
    borderRadius: 16,
  },
  secondaryText: { color: colors.textSecondary, fontSize: 14, fontFamily: fonts.semibold },
  error: {
    marginTop: 12,
    color: colors.red,
    fontSize: 12,
    lineHeight: 18,
    fontFamily: fonts.semibold,
  },
  footnote: {
    marginTop: 10,
    textAlign: 'center',
    color: colors.textMuted,
    fontSize: 11,
    lineHeight: 16,
    fontFamily: fonts.regular,
  },
  loading: { paddingVertical: 46, alignItems: 'center' },
});
