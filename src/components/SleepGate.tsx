/**
 * « Il est tard. » — la page de nuit.
 *
 * Affichée à l'ouverture de l'app entre 23 h et 5 h, une fois le socle légal
 * passé. C'est une suggestion, pas un verrou : les deux issues laissent entrer.
 *
 * ── Où se pose l'animation ──
 * Elle tient le haut de la page, dans une boîte proche du rapport pour lequel
 * les scènes sont composées, et s'éteint en fondu vers le bas. Le texte se lit
 * en dessous, sur du noir franc.
 *
 * Ce n'est pas la première version : la scène remplissait toute la page. Un
 * téléphone étant deux fois plus haut que large, elle y était étirée au point
 * de cadrer la mascotte en gros plan — sa chambre hors champ, et le texte sur
 * son manteau. Une scène ne se met pas à l'échelle de n'importe quel cadre.
 *
 * Elle n'est pas non plus une vignette posée en haut d'une page ordinaire :
 * c'est pour ça que `StartupStepPage` n'est pas utilisé ici, sa boîte
 * d'illustration aurait donné exactement le calque rapporté qu'on évite. Ici
 * le décor et le texte partagent le même noir, sans couture entre les deux.
 *
 * ── Pourquoi cette page est sombre dans les deux thèmes ──
 * C'est une page de NUIT. La scène qu'elle porte en est une aussi, et depuis
 * que la WebView est transparente, c'est le fond de la page qui passe derrière
 * elle : en thème clair, `colors.bg` aurait mis une chambre de nuit sur du
 * blanc. Les valeurs sont donc fixes ici — c'est le seul écran de l'app dans
 * ce cas, et il l'assume.
 *
 * ── Ce qui se passe si la scène ne charge pas ──
 * Rien de visible : il reste le fond de la page, et tout se lit normalement.
 * Aucune information n'est portée par l'animation.
 *
 * ── Deux composants, et pourquoi ──
 * `SleepPage` est la page. `SleepGate` décide de l'afficher. Le banc d'essai
 * des animations ouvre `SleepPage` directement : sans cette séparation, il
 * faudrait attendre 23 h pour la regarder, ou trafiquer l'horloge de
 * l'appareil.
 */

import React, { ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import {
  BackHandler,
  Platform,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';

import { colors, fonts } from '../theme';
import { useAuth } from '../contexts/AuthContext';
import { useStartupPopupSlot } from '../contexts/StartupPopupContext';
import { stepStyles } from './StartupStepPage';
import SceneCanvas, { SceneReveal, useSceneReveal } from './SceneCanvas';
import Skeleton from './ui/Skeleton';
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
export const heureCourante = (d: Date = new Date()) =>
  `${d.getHours()}h${String(d.getMinutes()).padStart(2, '0')}`;

interface SleepPageProps {
  /** Heure affichée dans la pastille. */
  heure: string;
  /** Dernier état, sans bouton : la question a reçu sa réponse. */
  bonneNuit?: boolean;
  onBonneNuit: () => void;
  onEncoreUneHeure: () => void;
  /** Coupe l'animation quand la page n'est pas regardée. */
  active?: boolean;
  /** Sortie posée par le banc d'essai, à la place des deux boutons. */
  footer?: ReactNode;
}

export function SleepPage({
  heure,
  bonneNuit = false,
  onBonneNuit,
  onEncoreUneHeure,
  active = true,
  footer,
}: SleepPageProps) {
  const insets = useSafeAreaInsets();

  /* La page attend son décor. Sans ça, le texte et les boutons s'affichent
     d'abord et la chambre apparaît par-dessus une demi-seconde plus tard : on
     ne lit pas une page qui se charge, on lit un décor qui « spawn ». */
  const { pret, onSettled } = useSceneReveal(active);
  const marges = {
    paddingTop: Math.max(insets.top, 16),
    paddingBottom: Math.max(insets.bottom, 18),
  };

  return (
    <View style={styles.page}>
      {/* Page sombre imposée : la barre d'état doit être claire, quel que
          soit le thème de l'app. */}
      <StatusBar
        barStyle="light-content"
        translucent={Platform.OS !== 'android'}
        backgroundColor="transparent"
      />

      {/* La scène tient le HAUT de la page, elle ne la remplit pas.

          Plein cadre sur un téléphone, elle est étirée du 4/5 pour lequel
          elle a été composée vers un 9/19,5 : la mascotte passe en gros plan,
          sa chambre sort du champ, et le texte atterrit sur son manteau. Dans
          une boîte proche de son rapport d'origine, on la voit entière, et le
          texte se lit sur du noir franc en dessous. */}
      <View style={styles.decor} pointerEvents="none">
        <SceneCanvas scene="01-chambre" active={active} onSettled={onSettled} />
        {/* La scène se fond dans la page au lieu de s'arrêter sur une arête. */}
        <LinearGradient
          colors={['transparent', 'rgba(14, 11, 9, 0.82)', NUIT]}
          locations={[0, 0.68, 1]}
          style={styles.fondu}
          pointerEvents="none"
        />
      </View>

      {!pret && (
        <View style={[styles.contenu, marges]} pointerEvents="none">
          <Skeleton width={104} height={31} rounded={999} />
          <View style={styles.bas}>
            <Skeleton width="62%" height={34} />
            <Skeleton width="100%" height={16} style={styles.attenteLigne} />
            <Skeleton width="88%" height={16} style={styles.attenteLigne} />
            <Skeleton width="100%" height={52} rounded={16} style={styles.attenteBouton} />
          </View>
        </View>
      )}

      <SceneReveal visible={pret} style={[styles.contenu, marges]}>
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
                  onPress={onBonneNuit}
                  activeOpacity={0.85}
                >
                  <Text style={stepStyles.primaryText}>Bonne nuit</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.plusTard}
                  onPress={onEncoreUneHeure}
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

          {footer}
        </View>
      </SceneReveal>
    </View>
  );
}

export default function SleepGate() {
  if (__DEV__) console.count('[loop-hunt] SleepGate render');
  const { isAuthenticated } = useAuth();
  const [wanted, setWanted] = useState(false);
  const [bonneNuit, setBonneNuit] = useState(false);
  const heure = useMemo(() => heureCourante(), [wanted]);

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
    <SleepPage
      heure={heure}
      bonneNuit={bonneNuit}
      onBonneNuit={handleBonneNuit}
      onEncoreUneHeure={handleEncoreUneHeure}
      active={visible}
    />
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
  decor: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    /**
     * 62 % : c'est ce qui ramène la boîte autour du rapport 3/4, proche du 4/5
     * dans lequel les scènes sont composées. Au-delà, la mascotte repasse en
     * gros plan ; en deçà, elle devient une vignette au sommet de l'écran.
     */
    height: '62%',
  },
  fondu: {
    ...StyleSheet.absoluteFillObject,
  },
  contenu: {
    ...StyleSheet.absoluteFillObject,
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
  attenteLigne: { marginTop: 10 },
  attenteBouton: { marginTop: 26 },
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
