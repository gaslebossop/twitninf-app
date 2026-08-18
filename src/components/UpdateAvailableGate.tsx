import React, { useEffect, useState } from 'react';
import { useWindowDimensions } from 'react-native';
import { View, Text, StyleSheet, TouchableOpacity, Platform, Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { colors, fonts } from '../theme';
import { useStartupPopupSlot } from '../contexts/StartupPopupContext';
import StartupStepPage, { stepStyles } from './StartupStepPage';
import LogoInjectionAnimation from './LogoInjectionAnimation';
import {
  checkForUpdate,
  dismissUpdate,
  INSTALL_CHANNEL,
  STORE_DEEP_LINK,
  STORE_WEB_URL,
  type UpdateInfo,
} from '../services/updateCheck';

/**
 * Page « une mise à jour existe », affichée quand le build installé est
 * antérieur à celui publié dans le flux de versions.
 *
 * L'app n'étant sur aucun store, rien ne prévient l'utilisateur qu'une version
 * plus récente est sortie : il faut le lui dire, et lui dire OÙ l'installer —
 * le canal n'est pas le même selon la plateforme.
 *
 * La page est écartable, pas bloquante. Une vérification de version dépend d'un
 * appel réseau à un service tiers ; en faire une condition d'accès à l'app
 * reviendrait à laisser GitHub décider si l'application démarre. Le refus vaut
 * pour ce build-là seulement : la publication suivante le repropose (voir
 * `dismissUpdate`).
 */

/**
 * Laisse le démarrage se faire avant d'annoncer quoi que ce soit. La file
 * d'attente (StartupPopupContext) décide de l'ordre réel d'affichage ; ce délai
 * ne fait qu'éviter de peser sur les toutes premières frames.
 */
const STARTUP_SETTLE_MS = 400;

/** Marches à suivre, dans l'ordre, propres à chaque canal d'installation. */
const STEPS = Platform.select({
  ios: [
    `Ouvre ${INSTALL_CHANNEL} sur ton iPhone.`,
    'TwitNinf apparaît avec une mise à jour disponible.',
    'Lance la mise à jour et laisse-la aller au bout.',
  ],
  default: [
    `Le bouton ci-dessous ouvre ${INSTALL_CHANNEL} directement sur TwitNinf.`,
    'Appuie sur « Mettre à jour ».',
    'Tes comptes et tes brouillons sont conservés.',
  ],
}) as string[];

export default function UpdateAvailableGate() {
  if (__DEV__) console.count('[loop-hunt] UpdateAvailableGate render');
  const [update, setUpdate] = useState<UpdateInfo | null>(null);
  const { width } = useWindowDimensions();

  /**
   * Taille du visuel : 400, borné par la largeur de l'écran.
   *
   * Elle valait 200 en dur, ce qui laissait l'illustration flotter dans le
   * vide. Le plafond de 400 est le format voulu ; le `min` sur la largeur
   * existe pour qu'un téléphone plus étroit ne se retrouve pas avec un visuel
   * plus large que son écran.
   *
   * Déborder la marge du texte est SANS conséquence ici : les bords de
   * l'illustration sont un halo transparent, pas du trait. Le sujet lui-même
   * n'occupe qu'environ deux tiers de la boîte.
   */
  const heroSize = Math.round(Math.min(400, width));
  const visible = useStartupPopupSlot('update', !!update);

  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;

    timer = setTimeout(() => {
      checkForUpdate()
        .then((found) => {
          if (active) setUpdate(found);
        })
        // `checkForUpdate` avale déjà ses erreurs ; ce garde-fou couvre
        // l'imprévu, car une promesse rejetée ici ferait tomber le démarrage.
        .catch(() => {});
    }, STARTUP_SETTLE_MS);

    return () => {
      active = false;
      if (timer) clearTimeout(timer);
    };
  }, []);

  /**
   * Ouvre G-Store sur la fiche TwitNinf.
   *
   * `openURL` echoue si aucune app ne repond au schema — c'est le cas quand
   * G-Store n'est pas installe. On bascule alors sur la page d'installation
   * publique, qui explique quoi faire. Dans les deux cas la page se ferme :
   * l'utilisateur a repondu.
   */
  const handleOpenStore = async () => {
    const dismissed = update;
    setUpdate(null);
    try {
      await Linking.openURL(STORE_DEEP_LINK);
    } catch {
      await Linking.openURL(STORE_WEB_URL).catch(() => {});
    }
    if (dismissed) await dismissUpdate(dismissed.buildVersion);
  };

  const handleDismiss = async () => {
    const dismissed = update;
    // Libère le créneau tout de suite : l'écriture du refus ne doit pas
    // retarder l'étape suivante du parcours de démarrage.
    setUpdate(null);
    if (dismissed) await dismissUpdate(dismissed.buildVersion);
  };

  if (!visible || !update) return null;

  return (
    <StartupStepPage
      visible={visible}
      icon="arrow-up-circle"
      // L'injection tourne en continu : c'est le geste que la page demande —
      // aller chercher la version dans Kospor Injection — et il n'y a rien
      // d'autre à regarder pendant qu'on lit les trois étapes.
      hero={<LogoInjectionAnimation size={heroSize} active={visible} />}
      title="Une nouvelle version est disponible"
      subtitle={
        update.label
          ? `Version ${update.label} — à installer depuis ${INSTALL_CHANNEL}`
          : `À installer depuis ${INSTALL_CHANNEL}`
      }
      footer={
        Platform.OS === 'android' ? (
          <View style={S.actions}>
            <TouchableOpacity
              style={stepStyles.primaryButton}
              onPress={handleOpenStore}
              activeOpacity={0.85}
            >
              <Text style={stepStyles.primaryText}>Continuer</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={handleDismiss} activeOpacity={0.7} style={S.laterButton}>
              <Text style={S.laterText}>Plus tard</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity
            style={stepStyles.primaryButton}
            onPress={handleDismiss}
            activeOpacity={0.85}
          >
            <Text style={stepStyles.primaryText}>J'ai compris</Text>
          </TouchableOpacity>
        )
      }
    >
      <View style={S.channelCard}>
        <Ionicons name="cube-outline" size={18} color={colors.accent} />
        <Text style={S.channelText}>{INSTALL_CHANNEL}</Text>
      </View>

      {STEPS.map((step, index) => (
        <View key={index} style={S.stepRow}>
          <View style={S.stepBadge}>
            <Text style={S.stepBadgeText}>{index + 1}</Text>
          </View>
          <Text style={S.stepText}>{step}</Text>
        </View>
      ))}

      <Text style={S.note}>
        Tu peux continuer à utiliser cette version, mais les nouveautés et les
        corrections ne seront là qu'après la mise à jour.
      </Text>
    </StartupStepPage>
  );
}

const S = StyleSheet.create({
  actions: {
    gap: 6,
  },
  laterButton: {
    alignItems: 'center',
    paddingVertical: 12,
  },
  laterText: {
    color: colors.textMuted,
    fontFamily: fonts.semibold,
    fontSize: 14,
  },
  channelCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 9,
    marginBottom: 18,
    borderRadius: 12,
    backgroundColor: colors.accentMuted,
  },
  channelText: {
    color: colors.accent,
    fontSize: 14,
    fontFamily: fonts.bold,
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 14,
    paddingRight: 8,
  },
  stepBadge: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    backgroundColor: colors.surfaceElevated,
  },
  stepBadgeText: {
    color: colors.textSecondary,
    fontSize: 12,
    fontFamily: fonts.bold,
  },
  stepText: {
    flex: 1,
    color: colors.textPrimary,
    fontSize: 14,
    lineHeight: 21,
    fontFamily: fonts.regular,
    paddingTop: 1,
  },
  note: {
    marginTop: 8,
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 18,
    fontFamily: fonts.regular,
  },
});
