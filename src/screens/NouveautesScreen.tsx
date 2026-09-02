import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useFocusEffect } from '@react-navigation/native';
import { colors, fonts, fontSize, radius, spacing } from '../theme';
import { AppHeader, Card, EmptyState, ErrorState, ScreenBackground, Skeleton } from '../components/ui';
import lexService, { LexTexts } from '../services/lexService';

/**
 * ✨ Quoi de neuf — l'écran dont pas un mot n'est dans ce fichier.
 *
 * ── Ce qu'il démontre ─────────────────────────────────────────────────────
 * Chaque phrase affichée ici vient du serveur de textes. Le titre, l'intro,
 * les annonces, jusqu'aux messages d'erreur : tout est écrit dans le panneau
 * Lex et arrive par le réseau. Corriger une faute ou annoncer une
 * fonctionnalité ne demande plus de commit, de build, de revue de store, ni
 * d'attendre que les gens mettent à jour.
 *
 * ── Pourquoi le nombre d'annonces n'est pas dans le code ──────────────────
 * L'écran demande `nouveautes.entree.*` — un joker. Le serveur renvoie tout
 * ce qui existe sous ce préfixe, et l'écran groupe par numéro. Ajouter une
 * quatrième annonce dans le panneau la fait apparaître ici : il n'y a aucune
 * liste à rallonger, aucune constante à monter, rien à publier.
 *
 * ── Pourquoi tout n'est pas géré comme ça ─────────────────────────────────
 * Ce qui est structurel — les libellés de la navigation, les boutons, les
 * confirmations — reste dans le code, où c'est relu, typé et testé. Un
 * bouton dont l'intitulé peut disparaître à distance est un bouton qu'on ne
 * peut plus garantir. Lex sert l'éditorial : ce qui change souvent et ne
 * commande rien.
 *
 * ── Ce qu'il fait quand le serveur est absent ─────────────────────────────
 * Il montre la dernière version reçue, avec un bandeau qui le dit. Sans rien
 * en mémoire non plus, il montre une erreur — écrite en dur, celle-là, parce
 * qu'un message d'erreur qui dépend du réseau ne s'affiche jamais quand on
 * en a besoin.
 *
 * ── Pourquoi aucune animation d'entrée ────────────────────────────────────
 * Règle du repo : un écran est prêt, il ne se dévoile pas. Les squelettes
 * couvrent l'attente réseau, et le contenu les remplace sans transition.
 *
 * ── En direct, et seulement quand l'écran est là ──────────────────────────
 * Tant que l'écran est visible, il écoute le serveur : une correction faite
 * dans le panneau apparaît ici en moins d'une seconde, sans rien tirer.
 *
 * La connexion ne survit ni à la navigation vers un autre écran, ni au
 * passage en arrière-plan. Un socket ouvert derrière un écran que personne
 * ne regarde coûte de la batterie pour rien — et iOS le coupe de toute
 * façon en arrière-plan, sans le dire. Au retour, l'écran redemande : ce
 * qui a changé pendant l'absence est rattrapé là.
 */

/**
 * L'écran déclaré dans le panneau Lex.
 *
 * Cet identifiant désigne une liste de clés figée côté serveur : l'app ne
 * peut pas demander autre chose, et un catalogue qui bouge ne change pas ce
 * qu'elle a le droit de lire.
 */
const LEX_SCREEN = 'ec28762cc32e50c1';

/** Les champs d'une annonce, tels que le panneau les nomme. */
const ENTRY_FIELDS = ['date', 'titre', 'corps'] as const;

/**
 * Les deux seules phrases écrites ici.
 *
 * Un message d'erreur réseau qui vient du réseau ne s'affiche jamais au
 * moment où il servirait.
 */
const HARDCODED = {
  title: 'Quoi de neuf',
  failed: 'Les nouveautés n’ont pas pu être chargées.',
};

interface Props {
  navigation: any;
}

export default function NouveautesScreen({ navigation }: Props) {
  const [texts, setTexts] = useState<LexTexts | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  /**
   * La version affichée, lue par la connexion en direct.
   *
   * Dans une ref et pas dans l'état : elle est consultée par un rappel qui
   * vit aussi longtemps que le socket, et une dépendance d'effet de plus
   * rouvrirait la connexion à chaque changement de catalogue.
   */
  const shownVersion = useRef<number | null>(null);

  const load = useCallback(async () => {
    const received = await lexService.fetchTexts(LEX_SCREEN);
    setTexts(received);
    shownVersion.current = received?.version ?? null;
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    load();
  }, [load]);

  /* Le direct — ouvert tant que l'écran est regardé, fermé sinon. */
  useFocusEffect(
    useCallback(() => {
      const stopWatching = lexService.watchTexts((version) => {
        // La poignée de main annonce la version courante : elle sert donc
        // aussi à rattraper une mise en ligne survenue pendant l'absence.
        if (shownVersion.current !== null && version === shownVersion.current) return;
        load();
      });

      // iOS coupe les sockets en arrière-plan sans prévenir : au retour, la
      // seule certitude est qu'on ne sait plus, donc on redemande.
      const subscription = AppState.addEventListener('change', (next) => {
        if (next === 'active') load();
      });

      return () => {
        stopWatching();
        subscription.remove();
      };
    }, [load]),
  );

  const text = texts?.text ?? {};
  const entries = lexService.groupEntries(text, 'nouveautes.entree', ENTRY_FIELDS);

  return (
    <ScreenBackground>
      <AppHeader
        navigation={navigation}
        title={text['nouveautes.titre'] ?? HARDCODED.title}
        subtitle={texts ? undefined : ' '}
      />

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />
        }
      >
        {loading ? (
          <Skeletons />
        ) : !texts ? (
          <ErrorState title={HARDCODED.failed} onRetry={onRefresh} retrying={refreshing} />
        ) : (
          <>
            {texts.cached && (
              <View style={styles.offline}>
                <Ionicons name="cloud-offline-outline" size={16} color={colors.textMuted} />
                <Text style={styles.offlineText}>
                  {text['nouveautes.horsligne'] ?? 'Hors ligne.'}
                </Text>
              </View>
            )}

            {!!text['nouveautes.intro'] && (
              <Text style={styles.intro}>{text['nouveautes.intro']}</Text>
            )}

            {entries.length === 0 ? (
              <EmptyState
                icon="sparkles-outline"
                title={text['nouveautes.vide'] ?? 'Rien pour l’instant.'}
              />
            ) : (
              entries.map((entry, index) => (
                <Card key={`${entry.titre ?? index}`} style={styles.card}>
                  {!!entry.date && <Text style={styles.date}>{entry.date}</Text>}
                  {!!entry.titre && <Text style={styles.title}>{entry.titre}</Text>}
                  {!!entry.corps && <Text style={styles.body}>{entry.corps}</Text>}
                </Card>
              ))
            )}
          </>
        )}
      </ScrollView>
    </ScreenBackground>
  );
}

/** L'attente réseau, à la forme du contenu qui va la remplacer. */
function Skeletons() {
  return (
    <View>
      <Skeleton width="90%" height={18} style={styles.skeletonIntro} />
      <Skeleton width="70%" height={18} style={styles.skeletonIntro} />
      {[0, 1, 2].map((index) => (
        <Card key={index} style={styles.card}>
          <Skeleton width={110} height={12} />
          <Skeleton width="80%" height={20} style={styles.skeletonTitle} />
          <Skeleton width="100%" height={14} style={styles.skeletonBody} />
          <Skeleton width="60%" height={14} style={styles.skeletonBody} />
        </Card>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxl,
  },

  offline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
  },
  offlineText: {
    flex: 1,
    color: colors.textSecondary,
    fontFamily: fonts.regular,
    fontSize: fontSize.sm,
  },

  intro: {
    color: colors.textSecondary,
    fontFamily: fonts.regular,
    fontSize: fontSize.md,
    lineHeight: fontSize.md * 1.5,
    marginBottom: spacing.lg,
  },

  card: {
    marginBottom: spacing.md,
  },
  date: {
    color: colors.accent,
    fontFamily: fonts.medium,
    fontSize: fontSize.xs,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  title: {
    color: colors.textPrimary,
    fontFamily: fonts.bold,
    fontSize: fontSize.lg,
    marginTop: spacing.xs,
  },
  body: {
    color: colors.textSecondary,
    fontFamily: fonts.regular,
    fontSize: fontSize.md,
    lineHeight: fontSize.md * 1.5,
    marginTop: spacing.sm,
  },

  skeletonIntro: { marginBottom: spacing.sm },
  skeletonTitle: { marginTop: spacing.sm },
  skeletonBody: { marginTop: spacing.sm },
});
