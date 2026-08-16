/**
 * « Il est tard. » — la page de nuit.
 *
 * Affichée à l'ouverture de l'app entre 23 h et 5 h, une fois le socle légal
 * passé. C'est une suggestion, pas un verrou : les deux issues laissent entrer.
 *
 * ── Pourquoi l'animation est le FOND et pas une vignette ──
 * Un visuel qui se superpose à l'écran existant est refusé depuis longtemps
 * ici : il habille, ou il n'existe pas. La scène occupe donc toute la page, et
 * le texte se pose dessus derrière un voile qui ne sert qu'à la lisibilité.
 * C'est aussi pour ça que cette page n'utilise pas `StartupStepPage`, dont la
 * mise en page réserve une boîte d'illustration en haut : ça aurait donné
 * exactement le calque posé par-dessus qu'on cherche à éviter.
 *
 * ── Pourquoi cette page est sombre dans les deux thèmes ──
 * C'est une page de NUIT. La scène qu'elle porte en est une aussi, et depuis
 * que la WebView est transparente, c'est le fond de la page qui passe derrière
 * elle : en thème clair, `colors.bg` aurait mis une chambre de nuit sur du
 * blanc. Les valeurs sont donc fixes ici — c'est le seul écran de l'app dans
 * ce cas, et il l'assume.
 *
 * ── Ce qui se passe si la scène ne charge pas ──
 * Rien de visible : il reste le fond de l'app, et toute la page se lit
 * normalement. Aucune information n'est portée par l'animation.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  BackHandler,
  Platform,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';

import { colors, fonts } from '../theme';
import { useAuth } from '../contexts/AuthContext';
import { useStartupPopupSlot } from '../contexts/StartupPopupContext';
import { stepStyles } from './StartupStepPage';
import SceneCanvas from './SceneCanvas';
import {
  doitRappeler,
  reporterJusquAuMatin,
  reporterUneHeure,
} from '../services/sleepReminder';

/**
 * Laisse le démarrage se faire avant de se déclarer, comme les autres étapes.
 * La file d'attente décide de l'ordre réel — voir `StartupPopupContext`.
 */
const STARTUP_SETTLE_MS = 300;

/**
 * Heure locale en clair.
 *
 * Formatée à la main plutôt que par `toLocaleTimeString` : on veut « 23h41 »
 * quelle que soit la locale de l'appareil, et surtout un format qui ne dépend
 * pas de la présence d'ICU dans le moteur JS.
 */
const heureCourante = (d: Date) => `${d.getHours()}h${String(d.getMinutes()).padStart(2, '0')}`;

export default function SleepGate() {
  const { isAuthenticated } = useAuth();
  const [wanted, setWanted] = useState(false);
  const [bonneNuit, setBonneNuit] = useState(false);
  const heure = useMemo(() => heureCourante(new Date()), [wanted]);
  const insets = useSafeAreaInsets();

  const visible = useStartupPopupSlot('sleep', wanted);

  useEffect(() => {
    if (!isAuthenticated) {
      setWanted(false);
      return;
    }
    let actif = true;
    const t = setTimeout(() => {
      doitRappeler()
        .then((oui) => {
          if (actif) setWanted(oui);
        })
        .catch(() => {});
    }, STARTUP_SETTLE_MS);
    return () => {
      actif = false;
      clearTimeout(t);
    };
  }, [isAuthenticated]);

  /**
   * « Bonne nuit ».
   *
   * Sur Android, fermer l'app est le geste demandé, et le système l'autorise.
   * Sur iOS il n'existe aucun moyen légitime de quitter — une app qui se ferme
   * elle-même est un motif de refus au review. On y affiche donc un dernier
   * écran calme, sans bouton : c'est à la personne de poser le téléphone, et
   * l'app ne rouvrira pas la question avant le matin.
   */
  const handleBonneNuit = useCallback(async () => {
    await reporterJusquAuMatin();
    if (Platform.OS === 'android') {
      BackHandler.exitApp();
      return;
    }
    setBonneNuit(true);
  }, []);

  const handleEncoreUneHeure = useCallback(async () => {
    // Le créneau est libéré tout de suite : l'écriture du report ne doit pas
    // retarder l'entrée dans l'app.
    setWanted(false);
    await reporterUneHeure();
  }, []);

  if (!visible) return null;

  return (
    <View style={styles.page}>
      {/* Page sombre imposée : la barre d'état doit être claire, quel que
          soit le thème de l'app. */}
      <StatusBar
        barStyle="light-content"
        translucent={Platform.OS !== 'android'}
        backgroundColor="transparent"
      />

      {/* La scène occupe toute la page. Elle est décorative : rien de ce qui
          suit n'en dépend. */}
      <SceneCanvas scene="01-chambre" active={visible} />

      {/* Voile de lisibilité, concentré là où le texte se pose. Il part de
          transparent pour ne pas éteindre la scène dans le haut du cadre. */}
      <LinearGradient
        colors={['transparent', 'rgba(14, 11, 9, 0.74)', NUIT]}
        locations={[0, 0.52, 0.82]}
        style={styles.voile}
        pointerEvents="none"
      />

      <View
        style={[
          styles.contenu,
          { paddingTop: Math.max(insets.top, 16), paddingBottom: Math.max(insets.bottom, 18) },
        ]}
      >
        <View style={styles.horloge}>
          <Ionicons name="moon" size={15} color={colors.accent} />
          <Text style={styles.horlogeTexte}>{heure}</Text>
        </View>

        <View style={styles.bas}>
          {bonneNuit ? (
            <>
              <Text style={styles.titre}>Bonne nuit.</Text>
              <Text style={styles.texte}>
                Pose le téléphone. Ce qui se passe ici sera toujours là demain —
                on ne te fera pas rater grand-chose entre {heure} et le matin.
              </Text>
            </>
          ) : (
            <>
              <Text style={styles.titre}>Il est tard.</Text>
              <Text style={styles.texte}>
                Le fil ne s'arrête jamais, c'est fait pour. Toi si. Rien de ce
                qui est publié cette nuit ne vaut une heure de sommeil — tu le
                retrouveras demain, exactement pareil.
              </Text>

              <View style={styles.actions}>
                <TouchableOpacity
                  style={stepStyles.primaryButton}
                  onPress={handleBonneNuit}
                  activeOpacity={0.85}
                >
                  <Text style={stepStyles.primaryText}>Bonne nuit</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.plusTard}
                  onPress={handleEncoreUneHeure}
                  activeOpacity={0.7}
                >
                  <Text style={styles.plusTardTexte}>Encore une heure</Text>
                </TouchableOpacity>
              </View>

              <Text style={stepStyles.footnote}>
                On ne te le redemandera pas avant une heure.
              </Text>
            </>
          )}
        </View>
      </View>
    </View>
  );
}

/** Le noir des scènes, et l'ivoire qui s'y lit. Fixes — voir l'en-tête. */
const NUIT = '#0E0B09';
const ENCRE = '#F4EFE7';

const styles = StyleSheet.create({
  page: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: NUIT,
    zIndex: 100,
  },
  voile: {
    ...StyleSheet.absoluteFillObject,
  },
  contenu: {
    flex: 1,
    paddingHorizontal: 24,
    justifyContent: 'space-between',
  },
  horloge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: 'rgba(14, 11, 9, 0.55)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(254, 44, 85, 0.4)',
  },
  horlogeTexte: {
    color: ENCRE,
    fontFamily: fonts.semibold,
    fontSize: 13,
    fontVariant: ['tabular-nums'],
  },
  bas: {
    paddingBottom: 4,
  },
  titre: {
    color: ENCRE,
    fontFamily: fonts.display,
    fontSize: 34,
    lineHeight: 39,
    letterSpacing: -0.9,
  },
  texte: {
    marginTop: 12,
    color: 'rgba(244, 239, 231, 0.74)',
    fontFamily: fonts.regular,
    fontSize: 15,
    lineHeight: 23,
  },
  actions: {
    marginTop: 28,
    gap: 4,
  },
  plusTard: {
    alignItems: 'center',
    paddingVertical: 13,
  },
  plusTardTexte: {
    color: 'rgba(244, 239, 231, 0.58)',
    fontFamily: fonts.semibold,
    fontSize: 14,
  },
});
