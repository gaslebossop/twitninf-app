import React, { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, fonts, radius, withAlpha } from '../theme';
import { AppHeader, ScreenBackground } from '../components/ui';
import StartupStepPage, { stepStyles } from '../components/StartupStepPage';
import LogoInjectionAnimation from '../components/LogoInjectionAnimation';
import { INSTALL_CHANNEL } from '../services/updateCheck';
import { EventsPreviewProvider } from '../contexts/EventsContext';
import EventScreen from './EventScreen';
import { buildPreviewState } from './eventPreviewFixture';

/**
 * Banc d'essai des écrans qu'on ne peut pas provoquer.
 *
 * ── Pourquoi cet écran existe ─────────────────────────────────────────────
 * Les pages de démarrage ne s'affichent que dans des conditions qu'on ne
 * provoque pas à la demande : « une nouvelle version est disponible » suppose
 * un build périmé ET un flux plus récent. Pour regarder son animation, il
 * fallait donc soit attendre une publication, soit trafiquer le compteur du
 * gist — ce qui déclenche la mise à jour chez TOUS les utilisateurs.
 *
 * D'où ce banc : la même page, le même composant, les mêmes props, mais
 * ouverte à la demande avec des données factices.
 *
 * ── Ce qu'il faut pour diagnostiquer, et pas seulement regarder ───────────
 * Un aperçu figé ne sert à rien si l'animation « bugue » : il faut pouvoir la
 * REJOUER depuis le début et la voir à plusieurs tailles. C'est souvent la
 * taille qui révèle le défaut — un tracé calculé en dur pour 200 px se
 * disloque à 120 ou 320.
 *
 * ── Réservé aux comptes certifiés ─────────────────────────────────────────
 * Ce n'est pas une fonctionnalité, c'est un outil. L'entrée est posée dans les
 * réglages derrière `user?.verified`, comme les autres outils internes.
 */

type Preview = {
  key: string;
  label: string;
  hint: string;
};

/**
 * Une seule pour l'instant. La liste est là pour que la suivante ne demande
 * qu'une ligne — c'est le seul intérêt d'un banc d'essai qui n'en contient
 * qu'un.
 */
const PREVIEWS: Preview[] = [
  {
    key: 'update',
    label: 'Nouvelle version disponible',
    hint: "La seringue de Kospor Injection, en boucle pendant la lecture.",
  },
  {
    key: 'event',
    label: "Page d'événement",
    hint: "L'anniversaire twitninf, avec une quête de chaque état possible.",
  },
];

/** Tailles d'épreuve. Un tracé juste à 200 peut se disloquer ailleurs. */
const SIZES = [200, 320, 400];

export default function AnimationLabScreen({ navigation }: any) {
  const [preview, setPreview] = useState<string | null>(null);
  const [size, setSize] = useState(400);
  /**
   * Change à chaque relecture pour forcer le remontage.
   *
   * Remettre `active` à faux puis à vrai ne suffit pas : l'animation garde ses
   * valeurs internes et reprend en cours de route au lieu de repartir du
   * début — ce qui masque justement les défauts de première image.
   */
  const [run, setRun] = useState(0);

  const close = useCallback(() => setPreview(null), []);
  const replay = useCallback(() => setRun((n) => n + 1), []);

  if (preview === 'event') {
    return (
      <View style={S.fill}>
        {/* Le VRAI `EventScreen`, avec un état substitué à celui du serveur.
            Un aperçu qui passerait par un autre chemin de rendu ne prouverait
            rien de la vraie page. */}
        <EventsPreviewProvider value={buildPreviewState()}>
          <EventScreen />
        </EventsPreviewProvider>
        <TouchableOpacity style={S.floatingClose} onPress={close} activeOpacity={0.85}>
          <Ionicons name="close" size={18} color={colors.white} />
          <Text style={S.floatingCloseText}>Fermer l'aperçu</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (preview === 'update') {
    return (
      <View style={S.fill}>
        <StartupStepPage
          visible
          icon="arrow-up-circle"
          hero={<LogoInjectionAnimation key={`${run}-${size}`} size={size} active />}
          title="Une nouvelle version est disponible"
          subtitle={`Version 1.0.0 (essai) — à installer depuis ${INSTALL_CHANNEL}`}
          footer={
            <TouchableOpacity style={stepStyles.primaryButton} onPress={close} activeOpacity={0.85}>
              <Text style={stepStyles.primaryText}>Fermer l'aperçu</Text>
            </TouchableOpacity>
          }
        >
          {/* Les commandes sont DANS la page, pas au-dessus : superposer une
              barre d'outils changerait la mise en page qu'on essaie justement
              de juger. */}
          <View style={S.controls}>
            <Text style={S.controlsLabel}>Aperçu · taille du visuel</Text>
            <View style={S.chips}>
              {SIZES.map((value) => (
                <TouchableOpacity
                  key={value}
                  style={[S.chip, size === value && S.chipOn]}
                  onPress={() => setSize(value)}
                >
                  <Text style={[S.chipText, size === value && S.chipTextOn]}>{value} px</Text>
                </TouchableOpacity>
              ))}
              <TouchableOpacity style={S.chip} onPress={replay}>
                <Ionicons name="refresh" size={14} color={colors.textPrimary} />
                <Text style={S.chipText}>Rejouer</Text>
              </TouchableOpacity>
            </View>
          </View>
        </StartupStepPage>
      </View>
    );
  }

  return (
    <ScreenBackground>
      <AppHeader
        navigation={navigation}
        title="Animations"
        subtitle="Aperçu des pages de démarrage"
      />
      <ScrollView contentContainerStyle={S.list}>
        <View style={S.note}>
          <Ionicons name="flask-outline" size={16} color={colors.accent} />
          <Text style={S.noteText}>
            Outil interne. Ces pages ne s'affichent normalement que dans des
            conditions qu'on ne peut pas provoquer à la demande.
          </Text>
        </View>

        {PREVIEWS.map((item) => (
          <TouchableOpacity
            key={item.key}
            style={S.row}
            activeOpacity={0.85}
            onPress={() => {
              setRun((n) => n + 1);
              setPreview(item.key);
            }}
          >
            <View style={S.rowIcon}>
              <Ionicons name="play" size={16} color={colors.accent} />
            </View>
            <View style={S.rowBody}>
              <Text style={S.rowTitle}>{item.label}</Text>
              <Text style={S.rowHint}>{item.hint}</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
          </TouchableOpacity>
        ))}
      </ScrollView>
    </ScreenBackground>
  );
}

const S = StyleSheet.create({
  fill: { flex: 1 },
  /**
   * Bouton de sortie flottant.
   *
   * `EventScreen` occupe tout l'écran et n'a pas de bouton retour : sans cette
   * sortie, l'aperçu serait un cul-de-sac. Posé en bas, au-dessus de la barre
   * d'onglets qui n'existe pas ici.
   */
  floatingClose: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 28,
    height: 48,
    borderRadius: 24,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: 'rgba(10,6,16,0.86)',
  },
  floatingCloseText: { color: colors.white, fontFamily: fonts.bold, fontSize: 14 },
  list: { padding: 16, gap: 12 },

  note: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'flex-start',
    padding: 14,
    borderRadius: radius.lg,
    backgroundColor: withAlpha(colors.accent, 0.08),
  },
  noteText: {
    flex: 1,
    color: colors.textSecondary,
    fontFamily: fonts.regular,
    fontSize: 13,
    lineHeight: 18,
  },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  rowIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: withAlpha(colors.accent, 0.14),
  },
  rowBody: { flex: 1 },
  rowTitle: { color: colors.textPrimary, fontFamily: fonts.heading, fontSize: 15 },
  rowHint: {
    color: colors.textSecondary,
    fontFamily: fonts.regular,
    fontSize: 12.5,
    lineHeight: 17,
    marginTop: 2,
  },

  controls: { marginTop: 8, gap: 8 },
  controlsLabel: {
    color: colors.textMuted,
    fontFamily: fonts.semibold,
    fontSize: 11.5,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    height: 36,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  chipOn: { borderColor: colors.accent, backgroundColor: withAlpha(colors.accent, 0.14) },
  chipText: { color: colors.textPrimary, fontFamily: fonts.semibold, fontSize: 13 },
  chipTextOn: { color: colors.accent },
});
