import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, fonts, withAlpha, gradients, glow } from '../theme';
import { displayNameFonts } from '../theme/fonts';
import { OPTIONAL_TABS, MAX_OPTIONAL_TABS, OptionalTabKey } from '../services/navbarPreferences';
import { useFlag } from '../contexts/FeatureFlagContext';
import { FLAGS } from '../config/featureFlagKeys';

/**
 * Onboarding « Compose ta barre ».
 *
 * Le principe qui porte tout l'écran : l'utilisateur ne coche pas des cases,
 * il VOIT sa barre de navigation se construire en direct pendant qu'il
 * choisit. Un aperçu fidèle (socle verrouillé + emplacements libres) rend le
 * modèle mental évident sans une ligne d'explication, et l'objet qu'on a
 * assemblé soi-même est un objet sur lequel on revient.
 *
 * Règles de la DA « Pulse » respectées ici : noir plat, magenta de marque,
 * cyan réservé au signal « en direct », aucun effet de verre, un seul dégradé
 * décoratif — une lueur lente EN FOND derrière l'en-tête, jamais en
 * surimpression du contenu.
 *
 * Aucune animation d'apparition en cascade sur la liste : tout ce qui bouge
 * répond à un geste de l'utilisateur (un raccourci qui se pose dans un
 * emplacement, une jauge qui se remplit, un refus qui se signale).
 */

/** Onglets de base, jamais retirables — affichés verrouillés dans l'aperçu. */
const FIXED_TABS: Array<{ label: string; icon: keyof typeof Ionicons.glyphMap }> = [
  { label: 'Accueil', icon: 'home-outline' },
  { label: 'Recherche', icon: 'search-outline' },
  { label: 'Notifications', icon: 'notifications-outline' },
  { label: 'Profil', icon: 'person-outline' },
];

/**
 * Socle du fil « 2B » : Notifications en sort (la cloche est dans l'en-tête du
 * fil) et Messages y entre. L'aperçu doit montrer CE socle-là, sinon il promet
 * une barre que l'utilisateur ne verra pas.
 */
const FIXED_TABS_2B: Array<{ label: string; icon: keyof typeof Ionicons.glyphMap }> = [
  { label: 'Accueil', icon: 'home-outline' },
  { label: 'Recherche', icon: 'search-outline' },
  { label: 'Messages', icon: 'chatbubble-outline' },
  { label: 'Profil', icon: 'person-outline' },
];

/** Variante pleine de l'icône, comme dans la vraie navbar une fois l'onglet actif. */
const solid = (icon: string) => icon.replace('-outline', '') as keyof typeof Ionicons.glyphMap;

interface NavbarOnboardingModalProps {
  visible: boolean;
  /** `onboarding` ajoute l'étape « où retrouver le reste » ; `settings` reste sur le choix. */
  mode?: 'onboarding' | 'settings';
  initialSelected?: OptionalTabKey[];
  onComplete: (selected: OptionalTabKey[]) => void;
  onCancel?: () => void;
  /**
   * Rendu sans `<Modal>` ni fond absolu : juste le contenu, pour un appelant
   * qui fournit deja son propre habillage plein ecran (AppHeader compris).
   * Utilise par l'ecran de reglages ; laisse a `false` partout ailleurs.
   */
  embedded?: boolean;
}

/* ------------------------------------------------------------------ */
/* Aperçu en direct                                                    */
/* ------------------------------------------------------------------ */

/**
 * Un emplacement de la barre. Vide, c'est un contour en pointillé ; rempli,
 * l'icône s'y pose avec un ressort — mais uniquement si le remplissage vient
 * d'un geste (`animate`), pas de la réouverture d'une config déjà enregistrée.
 */
function SlotCell({
  tab,
  index,
  animate,
}: {
  tab: (typeof OPTIONAL_TABS)[number] | null;
  index: number;
  animate: boolean;
}) {
  const enter = useRef(new Animated.Value(tab ? 1 : 0)).current;
  const previousKey = useRef<string | null>(tab?.key ?? null);

  useEffect(() => {
    const key = tab?.key ?? null;
    if (key === previousKey.current) return;
    previousKey.current = key;

    if (!animate) {
      enter.setValue(key ? 1 : 0);
      return;
    }
    if (key) {
      enter.setValue(0);
      Animated.spring(enter, {
        toValue: 1,
        friction: 6,
        tension: 120,
        useNativeDriver: true,
      }).start();
    } else {
      Animated.timing(enter, {
        toValue: 0,
        duration: 130,
        easing: Easing.in(Easing.quad),
        useNativeDriver: true,
      }).start();
    }
  }, [tab?.key, animate, enter]);

  return (
    <View style={styles.slot}>
      {!tab && (
        <View style={styles.slotEmpty}>
          <Text style={styles.slotIndex}>{index + 1}</Text>
        </View>
      )}
      {tab && (
        <Animated.View
          style={[
            styles.slotFilled,
            {
              opacity: enter,
              transform: [
                { scale: enter.interpolate({ inputRange: [0, 1], outputRange: [0.45, 1] }) },
                { translateY: enter.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) },
              ],
            },
          ]}
        >
          <Ionicons name={solid(tab.icon)} size={19} color={colors.accent} />
        </Animated.View>
      )}
    </View>
  );
}

/** Maquette de la barre : socle verrouillé à gauche, emplacements choisis à droite. */
function NavbarPreview({
  selectedTabs,
  animate,
  compact = false,
  slotCount,
  fixedTabs,
}: {
  selectedTabs: Array<(typeof OPTIONAL_TABS)[number]>;
  animate: boolean;
  compact?: boolean;
  /** Nombre d'emplacements de la barre — dépend du fil servi, voir `maxTabs`. */
  slotCount: number;
  /** Socle affiché — il diffère entre l'ancienne barre et celle de « 2B ». */
  fixedTabs: typeof FIXED_TABS;
}) {
  const slots = useMemo(
    () => Array.from({ length: slotCount }, (_, i) => selectedTabs[i] ?? null),
    [selectedTabs, slotCount],
  );

  return (
    <View style={[styles.previewBar, compact && styles.previewBarCompact]}>
      <View style={styles.previewSection}>
        {fixedTabs.map((tab) => (
          <View key={tab.label} style={styles.fixedSlot}>
            <Ionicons name={tab.icon} size={18} color={colors.textMuted} />
          </View>
        ))}
      </View>

      <View style={styles.previewDivider} />

      <View style={styles.previewSection}>
        {slots.map((tab, i) => (
          <SlotCell key={i} tab={tab} index={i} animate={animate} />
        ))}
      </View>
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Carte d'un raccourci                                                */
/* ------------------------------------------------------------------ */

function OptionCard({
  tab,
  rank,
  disabled,
  onPress,
}: {
  tab: (typeof OPTIONAL_TABS)[number];
  /** Position dans la barre (1-based) si sélectionné, sinon `null`. */
  rank: number | null;
  disabled: boolean;
  onPress: () => void;
}) {
  const press = useRef(new Animated.Value(0)).current;
  const active = rank !== null;

  const to = useCallback(
    (value: number) => {
      Animated.spring(press, {
        toValue: value,
        friction: 7,
        tension: 220,
        useNativeDriver: true,
      }).start();
    },
    [press],
  );

  return (
    <Animated.View
      style={{
        transform: [
          { scale: press.interpolate({ inputRange: [0, 1], outputRange: [1, 0.975] }) },
        ],
      }}
    >
      <Pressable
        onPress={onPress}
        onPressIn={() => to(1)}
        onPressOut={() => to(0)}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: active }}
        accessibilityLabel={`${tab.label}. ${tab.description}`}
        accessibilityHint={
          active
            ? `Emplacement ${rank} de ta barre. Appuie pour retirer.`
            : disabled
              ? 'Barre complète. Retire un raccourci pour en ajouter un autre.'
              : 'Appuie pour ajouter à ta barre.'
        }
        style={[
          styles.optionCard,
          active && styles.optionCardActive,
          disabled && styles.optionCardDisabled,
        ]}
      >
        <View style={[styles.optionIcon, active && styles.optionIconActive]}>
          <Ionicons
            name={(active ? solid(tab.icon) : tab.icon) as keyof typeof Ionicons.glyphMap}
            size={19}
            color={active ? colors.accent : colors.textSecondary}
          />
        </View>

        <View style={styles.optionText}>
          <Text style={[styles.optionLabel, active && styles.optionLabelActive]} numberOfLines={1}>
            {tab.label}
          </Text>
          <Text style={styles.optionDescription} numberOfLines={1}>
            {tab.description}
          </Text>
        </View>

        {/* Le marqueur dit la position occupée, pas juste « coché » :
            l'utilisateur lit directement l'ordre de sa barre. */}
        <View style={[styles.rankBadge, active && styles.rankBadgeActive]}>
          {active ? (
            <Text style={styles.rankBadgeText}>{rank}</Text>
          ) : (
            <Ionicons
              name="add"
              size={15}
              color={disabled ? colors.textDisabled : colors.textMuted}
            />
          )}
        </View>
      </Pressable>
    </Animated.View>
  );
}

/* ------------------------------------------------------------------ */
/* Écran                                                               */
/* ------------------------------------------------------------------ */

export default function NavbarOnboardingModal({
  visible,
  mode = 'onboarding',
  initialSelected = [],
  onComplete,
  onCancel,
  embedded = false,
}: NavbarOnboardingModalProps) {
  const [selected, setSelected] = useState<OptionalTabKey[]>(initialSelected);
  const [step, setStep] = useState<'select' | 'tutorial'>('select');
  /** Un geste a-t-il déjà eu lieu ? Sinon l'aperçu s'affiche sans animation. */
  const [interacted, setInteracted] = useState(false);

  // Lueur de marque, en fond derrière l'en-tête.
  const halo = useRef(new Animated.Value(0)).current;
  // Point « en direct » de l'aperçu.
  const livePulse = useRef(new Animated.Value(0)).current;
  // Refus quand la barre est pleine.
  const capShake = useRef(new Animated.Value(0)).current;
  // Transition entre les deux étapes.
  const stepAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      setSelected(initialSelected);
      setStep('select');
      setInteracted(false);
      stepAnim.setValue(0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  useEffect(() => {
    if (!visible) return;
    const loops = Animated.parallel([
      Animated.loop(
        Animated.sequence([
          Animated.timing(halo, {
            toValue: 1,
            duration: 3200,
            easing: Easing.inOut(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.timing(halo, {
            toValue: 0,
            duration: 3200,
            easing: Easing.inOut(Easing.quad),
            useNativeDriver: true,
          }),
        ]),
      ),
      Animated.loop(
        Animated.sequence([
          Animated.timing(livePulse, {
            toValue: 1,
            duration: 900,
            easing: Easing.out(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.timing(livePulse, {
            toValue: 0,
            duration: 900,
            easing: Easing.in(Easing.quad),
            useNativeDriver: true,
          }),
        ]),
      ),
    ]);
    loops.start();
    return () => loops.stop();
  }, [visible, halo, livePulse]);

  /**
   * Les onglets réellement proposables à CE compte.
   *
   * Un onglet peut dépendre d'un drapeau (voir `flag` dans
   * `navbarPreferences`). Proposer une Carte NF à qui n'y a pas encore droit
   * donnerait un onglet qui ouvre un écran vide : le drapeau ferme la
   * fonctionnalité côté API, qui répond 404.
   */
  const nfMapEnabled = useFlag(FLAGS.NF_MAP);
  const feed2B = useFlag(FLAGS.FEED_2B);
  const fixedTabs = feed2B ? FIXED_TABS_2B : FIXED_TABS;

  const availableTabs = useMemo(
    () =>
      OPTIONAL_TABS.filter((tab) => {
        if (tab.flag && !(tab.flag === FLAGS.NF_MAP && nfMapEnabled)) return false;
        // Sous « 2B », Messages est dans le socle : le proposer en raccourci
        // donnerait un doublon dans la barre.
        if (feed2B && tab.key === 'messages') return false;
        return true;
      }),
    [nfMapEnabled, feed2B],
  );

  const selectedTabs = useMemo(
    () =>
      selected
        .map((key) => availableTabs.find((t) => t.key === key))
        .filter(Boolean) as Array<(typeof OPTIONAL_TABS)[number]>,
    [selected, availableTabs],
  );

  const hiddenTabs = availableTabs.filter((tab) => !selected.includes(tab.key));

  /**
   * Raccourcis qui occupent RÉELLEMENT un emplacement.
   *
   * `selected` est la préférence brute et peut contenir des clés qui ne sont
   * plus servies : `messages`, passé dans le socle du fil 2B, ou un onglet
   * dont le drapeau s'est refermé depuis. Ces clés n'apparaissent ni dans la
   * barre ni dans l'aperçu — mais elles étaient comptées, ce qui produisait le
   * blocage suivant :
   *
   *   préférence ['messages', 'monetization'] sous 2B
   *     → aperçu : 1 raccourci + 1 emplacement vide
   *     → compteur : 2 sur 2, « Barre complète »
   *     → impossible d'en ajouter un : le plafond est atteint
   *
   * L'écran affirmait donc une barre pleine tout en en montrant une à moitié
   * vide, sans aucun moyen d'en sortir.
   */
  const effective = useMemo(
    () => selected.filter((key) => availableTabs.some((tab) => tab.key === key)),
    [selected, availableTabs],
  );

  /**
   * Nombre d'emplacements libres, selon la barre que verra l'utilisateur.
   *
   * Le fil « 2B » (drapeau `fil.refonte2b`) tient deux raccourcis, pas cinq :
   * sa barre a des cibles plus larges et un bouton « Publier » au centre, donc
   * moins de colonnes. Proposer cinq choix à quelqu'un qui n'en verrait que
   * deux serait un mensonge de l'interface.
   *
   * Les 99 % restants gardent `MAX_OPTIONAL_TABS` — le test ne change rien
   * pour eux.
   */
  const maxTabs = feed2B ? 2 : MAX_OPTIONAL_TABS;

  /**
   * Nombre MINIMUM de raccourcis : aucun, dans les deux fils.
   *
   * Le fil « 2B » imposait d'en choisir deux, au motif que sa barre n'a que
   * trois entrées de socle. Ce n'est plus vrai : Messages y est passé (voir le
   * filtre `key === 'messages'` dans `BottomTabNavigator2B`), le socle en
   * compte donc quatre — Accueil, Recherche, Messages, Profil. À zéro
   * raccourci la barre affiche cinq colonnes bouton compris, réparties
   * 2 | Publier | 2 : équilibrée, et bien assez fournie.
   *
   * La règle qui reste est celle de la PARITÉ, pas d'un plancher : zéro ou
   * deux, jamais un (voir `FEED_2B_SLOTS`). Comme le plafond est ici de deux,
   * un plancher à zéro suffit à l'exprimer — on ne peut valider qu'à zéro,
   * un, ou deux, et le `belowFloor` ci-dessous écarte le cas « un ».
   */
  const minTabs = 0;

  /**
   * Le cas « un seul raccourci » est refusé à part : il ne viole ni le
   * plancher ni le plafond, mais il décentre le bouton « Publier » en rendant
   * le nombre de colonnes impair.
   */
  const oddSelection = feed2B && effective.length === 1;
  const atCap = effective.length >= maxTabs;
  const belowFloor = effective.length < minTabs || oddSelection;

  /** Refuser en silence est un cul-de-sac : on montre pourquoi ça ne prend pas. */
  /** Secousse de refus — plafond atteint, ou plancher pas encore atteint. */
  const rejectAtCap = useCallback(() => {
    capShake.setValue(0);
    Animated.sequence([
      Animated.timing(capShake, { toValue: 1, duration: 55, useNativeDriver: true }),
      Animated.timing(capShake, { toValue: -1, duration: 55, useNativeDriver: true }),
      Animated.timing(capShake, { toValue: 0.6, duration: 55, useNativeDriver: true }),
      Animated.timing(capShake, { toValue: 0, duration: 55, useNativeDriver: true }),
    ]).start();
  }, [capShake]);

  const toggle = useCallback(
    (key: OptionalTabKey) => {
      setInteracted(true);
      // Décision prise ici, pas dans l'updater : celui-ci doit rester pur
      // (React peut le rejouer), et le refus déclenche une animation.
      if (selected.includes(key)) {
        setSelected((current) => current.filter((k) => k !== key));
        return;
      }
      if (effective.length >= maxTabs) {
        rejectAtCap();
        return;
      }
      setSelected((current) => [...current, key]);
    },
    [selected, rejectAtCap],
  );

  const goToTutorial = useCallback(() => {
    setStep('tutorial');
    stepAnim.setValue(0);
    Animated.timing(stepAnim, {
      toValue: 1,
      duration: 260,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [stepAnim]);

  const handleValidate = () => {
    // Refuser en silence est un cul-de-sac : la jauge dit déjà ce qui manque,
    // la secousse relie le geste au message.
    if (belowFloor) {
      rejectAtCap();
      return;
    }
    if (mode === 'onboarding' && hiddenTabs.length > 0) {
      goToTutorial();
      return;
    }
    // On persiste `effective`, pas `selected` : sans ça, une clé morte
    // (`messages` sous 2B, un onglet à drapeau refermé) resterait écrite et
    // continuerait de manger un emplacement au prochain lancement.
    onComplete(effective);
  };

  // Ce qu'il manque pour valider. Sur une sélection impaire, il manque une
  // seule entrée pour retomber sur un compte pair.
  const missing = oddSelection ? 1 : Math.max(0, minTabs - effective.length);
  const meterMessage = atCap
    ? 'Barre complète — retire un raccourci pour en changer'
    : belowFloor
      ? `Encore ${missing} raccourci${missing > 1 ? 's' : ''} à choisir`
      : effective.length === 0
        ? 'Aucun raccourci — ta barre gardera seulement le socle'
        : `${effective.length} sur ${maxTabs} emplacement${maxTabs > 1 ? 's' : ''} utilisé${maxTabs > 1 ? 's' : ''}`;

  const stepTranslate = stepAnim.interpolate({ inputRange: [0, 1], outputRange: [18, 0] });

  // Au démarrage c'est une étape du parcours : page plein écran, comme les
  // autres. Depuis les réglages, ça reste une feuille qui remonte du bas.
  const isOnboarding = mode === 'onboarding';

  const body = (
    <View style={[styles.sheet, isOnboarding && styles.sheetFull, embedded && styles.sheetEmbedded]}>
          {/* Lueur de marque : en fond, sous tout le contenu. */}
          <Animated.View
            pointerEvents="none"
            style={[
              styles.halo,
              {
                opacity: halo.interpolate({ inputRange: [0, 1], outputRange: [0.55, 1] }),
                transform: [
                  { scale: halo.interpolate({ inputRange: [0, 1], outputRange: [1, 1.18] }) },
                ],
              },
            ]}
          >
            <LinearGradient colors={gradients.glow} style={StyleSheet.absoluteFill} />
          </Animated.View>

          {/* Poignee de feuille : n'a de sens que pour un habillage sheet/page,
              pas quand l'appelant fournit deja son propre AppHeader. */}
          {!embedded && <View style={styles.grabber} />}

          {step === 'select' ? (
            <>
              {mode === 'onboarding' && (
                <View style={styles.rail}>
                  <Text style={styles.railLabel}>ÉTAPE 1 / 2</Text>
                  <View style={styles.railTrack}>
                    <View style={[styles.railSegment, styles.railSegmentOn]} />
                    <View style={styles.railSegment} />
                  </View>
                </View>
              )}

              <Text style={styles.title}>
                {mode === 'onboarding' ? 'Compose ta barre' : 'Ta barre de navigation'}
              </Text>
              {/* Le socle est ÉNUMÉRÉ depuis `fixedTabs`, jamais écrit en dur :
                  celui du fil 2B remplace Notifications par Messages, et la
                  phrase annonçait donc une barre que l'aperçu, juste en
                  dessous, contredisait. */}
              <Text style={styles.subtitle}>
                Le socle — {fixedTabs.map((tab) => tab.label).join(', ')} — ne bouge jamais. À toi
                de remplir les {maxTabs} emplacements restants avec ce que tu ouvres le plus.
              </Text>

              {/* ------- Aperçu en direct ------- */}
              <View style={styles.previewBlock}>
                <View style={styles.previewHeader}>
                  <Animated.View
                    style={[
                      styles.liveDot,
                      {
                        opacity: livePulse.interpolate({
                          inputRange: [0, 1],
                          outputRange: [0.35, 1],
                        }),
                      },
                    ]}
                  />
                  <Text style={styles.previewHeaderLabel}>APERÇU EN DIRECT</Text>
                </View>

                <NavbarPreview selectedTabs={selectedTabs} animate={interacted} slotCount={maxTabs} fixedTabs={fixedTabs} />

                <View style={styles.legendRow}>
                  <View style={styles.legendItem}>
                    <Ionicons name="lock-closed" size={10} color={colors.textMuted} />
                    <Text style={styles.legendText}>Socle</Text>
                  </View>
                  <View style={styles.legendItem}>
                    <View style={styles.legendDot} />
                    <Text style={styles.legendText}>Tes raccourcis</Text>
                  </View>
                </View>
              </View>

              {/* ------- Jauge d'emplacements ------- */}
              <Animated.View
                style={[
                  styles.meterRow,
                  {
                    transform: [
                      {
                        translateX: capShake.interpolate({
                          inputRange: [-1, 1],
                          outputRange: [-6, 6],
                        }),
                      },
                    ],
                  },
                ]}
              >
                <View style={styles.meterTrack}>
                  {Array.from({ length: maxTabs }, (_, i) => (
                    <View
                      key={i}
                      style={[styles.meterPip, i < effective.length && styles.meterPipOn]}
                    />
                  ))}
                </View>
                <Text style={[styles.meterText, atCap && styles.meterTextCap]} numberOfLines={1}>
                  {meterMessage}
                </Text>
              </Animated.View>

              {/* ------- Raccourcis disponibles ------- */}
              <Text style={styles.sectionLabel}>RACCOURCIS DISPONIBLES</Text>
              <ScrollView
                style={styles.optionsList}
                showsVerticalScrollIndicator={false}
                contentContainerStyle={styles.optionsContent}
              >
                {availableTabs.map((tab) => {
                  // Rang dans ce qui occupe vraiment la barre : sur la
                  // préférence brute, une clé morte décalait tous les numéros.
                  const rank = effective.indexOf(tab.key);
                  return (
                    <OptionCard
                      key={tab.key}
                      tab={tab}
                      rank={rank === -1 ? null : rank + 1}
                      disabled={rank === -1 && atCap}
                      onPress={() => toggle(tab.key)}
                    />
                  );
                })}
              </ScrollView>

              <Pressable
                style={({ pressed }) => [
                  styles.primaryBtn,
                  pressed && styles.primaryBtnPressed,
                  // Éteint mais TAPABLE : un bouton inerte ne dit pas pourquoi
                  // il l'est. Celui-ci secoue la jauge, qui porte le message.
                  belowFloor && styles.primaryBtnMuted,
                ]}
                onPress={handleValidate}
                accessibilityState={{ disabled: belowFloor }}
              >
                <Text style={styles.primaryBtnText}>
                  {mode === 'onboarding' && hiddenTabs.length > 0 ? 'Continuer' : 'Enregistrer ma barre'}
                </Text>
                <Ionicons name="arrow-forward" size={16} color={colors.onAccent} />
              </Pressable>

              <Pressable style={styles.cancelBtn} onPress={() => onCancel?.()}>
                <Text style={styles.cancelBtnText}>
                  {mode === 'settings' ? 'Annuler' : 'Plus tard'}
                </Text>
              </Pressable>
            </>
          ) : (
            <Animated.View
              style={{ opacity: stepAnim, transform: [{ translateY: stepTranslate }] }}
            >
              <View style={styles.rail}>
                <Text style={styles.railLabel}>ÉTAPE 2 / 2</Text>
                <View style={styles.railTrack}>
                  <View style={[styles.railSegment, styles.railSegmentOn]} />
                  <View style={[styles.railSegment, styles.railSegmentOn]} />
                </View>
              </View>

              <Text style={styles.title}>Rien n'est perdu</Text>
              <Text style={styles.subtitle}>
                Ce que tu n'as pas mis dans ta barre reste dans l'app — tu le rouvres quand tu veux
                depuis Réglages, et tu peux recomposer ta barre à tout moment.
              </Text>

              <View style={styles.previewBlock}>
                <View style={styles.previewHeader}>
                  <Ionicons name="checkmark-circle" size={12} color={colors.accent} />
                  <Text style={styles.previewHeaderLabel}>TA BARRE</Text>
                </View>
                <NavbarPreview selectedTabs={selectedTabs} animate={false} compact slotCount={maxTabs} fixedTabs={fixedTabs} />
              </View>

              <Text style={styles.sectionLabel}>RANGÉ DANS LES RÉGLAGES</Text>
              <ScrollView
                style={styles.tutorialList}
                showsVerticalScrollIndicator={false}
                contentContainerStyle={styles.optionsContent}
              >
                {hiddenTabs.map((tab) => (
                  <View key={tab.key} style={styles.tutorialRow}>
                    <View style={styles.tutorialIcon}>
                      <Ionicons
                        name={tab.icon as keyof typeof Ionicons.glyphMap}
                        size={16}
                        color={colors.textSecondary}
                      />
                    </View>
                    <Text style={styles.tutorialLabel} numberOfLines={1}>
                      {tab.label}
                    </Text>
                    <Ionicons name="arrow-forward" size={13} color={colors.textMuted} />
                    <View style={styles.tutorialTarget}>
                      <Ionicons name="settings-outline" size={12} color={colors.accent} />
                      <Text style={styles.tutorialTargetText}>Réglages</Text>
                    </View>
                  </View>
                ))}
              </ScrollView>

              <Pressable
                style={({ pressed }) => [styles.primaryBtn, pressed && styles.primaryBtnPressed]}
                onPress={() => onComplete(effective)}
              >
                <Text style={styles.primaryBtnText}>Terminer</Text>
                <Ionicons name="checkmark" size={17} color={colors.onAccent} />
              </Pressable>

              <Pressable style={styles.cancelBtn} onPress={() => setStep('select')}>
                <Text style={styles.cancelBtnText}>Revenir au choix</Text>
              </Pressable>
            </Animated.View>
          )}
    </View>
  );

  if (embedded) {
    if (!visible) return null;
    return body;
  }

  if (isOnboarding) {
    if (!visible) return null;
    return <View style={styles.page}>{body}</View>;
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={() => onCancel?.()}>
      <View style={styles.overlay}>{body}</View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  page: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.bg,
    zIndex: 100,
  },
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: colors.overlay,
  },
  sheetFull: {
    flex: 1,
    maxHeight: '100%',
    borderTopLeftRadius: 0,
    borderTopRightRadius: 0,
    // Barre d'état en haut, navbar système en bas : marges fixes, aucun
    // SafeAreaProvider n'est monté dans cette app.
    paddingTop: 54,
  },
  sheetEmbedded: {
    flex: 1,
    maxHeight: '100%',
    borderTopLeftRadius: 0,
    borderTopRightRadius: 0,
    backgroundColor: 'transparent',
    // Pas de gros paddingTop ici : l'appelant a deja son propre AppHeader
    // au-dessus, contrairement au mode onboarding qui est seul sur l'ecran.
    paddingTop: 6,
  },
  sheet: {
    backgroundColor: colors.bgElevated,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderSubtle,
    paddingHorizontal: 20,
    // La navbar système recouvre le bas des écrans : marge fixe, pas d'insets
    // (aucun SafeAreaProvider n'est monté dans cette app).
    paddingBottom: 30,
    paddingTop: 10,
    maxHeight: '92%',
    overflow: 'hidden',
  },
  halo: {
    position: 'absolute',
    top: -170,
    left: -40,
    right: -40,
    height: 340,
  },
  grabber: {
    alignSelf: 'center',
    width: 38,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.borderStrong,
    marginBottom: 18,
  },

  /* En-tête */
  rail: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 14,
  },
  railLabel: {
    fontFamily: displayNameFonts.mono,
    fontSize: 9.5,
    letterSpacing: 1.1,
    color: colors.textMuted,
  },
  railTrack: {
    flexDirection: 'row',
    gap: 4,
    flex: 1,
  },
  railSegment: {
    flex: 1,
    height: 2,
    borderRadius: 1,
    backgroundColor: colors.border,
  },
  railSegmentOn: {
    backgroundColor: colors.accent,
  },
  title: {
    fontSize: 25,
    fontFamily: fonts.displayHeavy,
    color: colors.textPrimary,
    letterSpacing: -0.5,
    marginBottom: 7,
  },
  subtitle: {
    fontSize: 13,
    fontFamily: fonts.regular,
    color: colors.textSecondary,
    lineHeight: 19,
    marginBottom: 18,
  },

  /* Aperçu */
  previewBlock: {
    marginBottom: 16,
  },
  previewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.cyan,
  },
  previewHeaderLabel: {
    fontFamily: displayNameFonts.mono,
    fontSize: 9,
    letterSpacing: 1.2,
    color: colors.textMuted,
  },
  previewBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.bg,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    paddingVertical: 11,
    paddingHorizontal: 10,
  },
  previewBarCompact: {
    paddingVertical: 9,
  },
  previewSection: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 1,
  },
  previewDivider: {
    width: StyleSheet.hairlineWidth,
    alignSelf: 'stretch',
    backgroundColor: colors.borderStrong,
    marginHorizontal: 8,
  },
  fixedSlot: {
    width: 30,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
    opacity: 0.55,
  },
  slot: {
    width: 30,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 1,
  },
  slotEmpty: {
    width: 26,
    height: 26,
    borderRadius: 9,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  slotIndex: {
    fontFamily: displayNameFonts.mono,
    fontSize: 9,
    color: colors.textMuted,
  },
  slotFilled: {
    width: 28,
    height: 28,
    borderRadius: 9,
    backgroundColor: colors.accentMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  legendRow: {
    flexDirection: 'row',
    gap: 16,
    marginTop: 9,
    paddingHorizontal: 2,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  legendDot: {
    width: 7,
    height: 7,
    borderRadius: 2,
    backgroundColor: colors.accent,
  },
  legendText: {
    fontSize: 10.5,
    fontFamily: fonts.medium,
    color: colors.textMuted,
  },

  /* Jauge */
  meterRow: {
    marginBottom: 18,
  },
  meterTrack: {
    flexDirection: 'row',
    gap: 4,
    marginBottom: 7,
  },
  meterPip: {
    flex: 1,
    height: 3,
    borderRadius: 2,
    backgroundColor: colors.border,
  },
  meterPipOn: {
    backgroundColor: colors.accent,
  },
  meterText: {
    fontSize: 11.5,
    fontFamily: fonts.medium,
    color: colors.textMuted,
  },
  meterTextCap: {
    color: colors.accent,
  },

  /* Liste */
  sectionLabel: {
    fontFamily: displayNameFonts.mono,
    fontSize: 9,
    letterSpacing: 1.2,
    color: colors.textMuted,
    marginBottom: 9,
  },
  optionsList: {
    maxHeight: 268,
    marginBottom: 16,
  },
  optionsContent: {
    paddingBottom: 2,
    gap: 8,
  },
  optionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 14,
    padding: 11,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  optionCardActive: {
    backgroundColor: colors.accentSoft,
    borderColor: withAlpha(colors.accent, 0.45),
  },
  optionCardDisabled: {
    opacity: 0.38,
  },
  optionIcon: {
    width: 36,
    height: 36,
    borderRadius: 11,
    backgroundColor: colors.surfaceElevated,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 11,
  },
  optionIconActive: {
    backgroundColor: colors.accentMuted,
  },
  optionText: {
    flex: 1,
    paddingRight: 8,
  },
  optionLabel: {
    fontSize: 14,
    fontFamily: fonts.heading,
    color: colors.textPrimary,
  },
  optionLabelActive: {
    color: colors.textPrimary,
  },
  optionDescription: {
    fontSize: 11.5,
    fontFamily: fonts.regular,
    color: colors.textMuted,
    marginTop: 1,
  },
  rankBadge: {
    width: 26,
    height: 26,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rankBadgeActive: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  rankBadgeText: {
    fontFamily: displayNameFonts.mono,
    fontSize: 11,
    color: colors.onAccent,
  },

  /* Actions */
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.accent,
    borderRadius: 14,
    paddingVertical: 15,
    ...glow(colors.accent, 12),
  },
  primaryBtnMuted: {
    opacity: 0.45,
  },
  primaryBtnPressed: {
    backgroundColor: colors.accentPressed,
  },
  primaryBtnText: {
    color: colors.onAccent,
    fontSize: 15,
    fontFamily: fonts.display,
    letterSpacing: -0.1,
  },
  cancelBtn: {
    alignItems: 'center',
    paddingVertical: 13,
  },
  cancelBtnText: {
    color: colors.textSecondary,
    fontSize: 13,
    fontFamily: fonts.medium,
  },

  /* Étape 2 */
  tutorialList: {
    maxHeight: 250,
    marginBottom: 16,
  },
  tutorialRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    backgroundColor: colors.surface,
    borderRadius: 12,
    paddingVertical: 9,
    paddingHorizontal: 11,
  },
  tutorialIcon: {
    width: 28,
    height: 28,
    borderRadius: 9,
    backgroundColor: colors.surfaceElevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tutorialLabel: {
    flex: 1,
    fontSize: 13,
    fontFamily: fonts.medium,
    color: colors.textPrimary,
  },
  tutorialTarget: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.accentMuted,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  tutorialTargetText: {
    fontSize: 10.5,
    fontFamily: fonts.semibold,
    color: colors.accent,
  },
});
