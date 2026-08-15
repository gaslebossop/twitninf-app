import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import Animated, {
  FadeInDown,
  FadeOut,
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { ScreenBackground, BackButton, Tappable } from '../components/ui';
import { toast } from '../components/ui/Toast';
import { useHeaderMetrics, HEADER_CONTENT_HEIGHT } from '../hooks/useHeaderMetrics';
import { isReduceMotionEnabled, motionDuration, useReduceMotion } from '../hooks/useReduceMotion';
import { colors, fonts, statusBarStyle, duration } from '../theme';
import { displayNameFonts } from '../theme/fonts';
import { ease, springs } from '../utils/gesture';
import {
  collectDiagnostics,
  describeAge,
  getTrail,
  labelForRoute,
  type Crumb,
  type DiagnosticLine,
} from '../services/breadcrumbs';
import { createTicket } from '../services/supportService';

/**
 * Signalement de bug.
 *
 * Le formulaire de bug habituel demande « décrivez le problème » et récolte
 * « ça marche pas ». Ce n'est pas un défaut de l'utilisateur : ce qu'un
 * développeur a besoin de savoir — la version, l'appareil, l'écran, le chemin
 * parcouru — n'est pas quelque chose qu'on garde en tête, alors que l'app,
 * elle, le sait déjà.
 *
 * L'écran est donc bâti sur une inversion : le rapport s'écrit tout seul, et
 * l'utilisateur ne fait que POINTER le moment (« le fil ») puis dire ce qu'il
 * attendait. La question « quelles sont les étapes pour reproduire ? », que
 * personne ne remplit correctement, devient un geste.
 *
 * Trois moments, dans cet ordre : OÙ (le fil), COMBIEN ÇA GÊNE (une question
 * concrète plutôt qu'une échelle de gravité, que tout le monde met au
 * maximum), QUOI (le seul champ à saisir). Le bloc de diagnostic ferme
 * l'écran, replié : il est là pour prouver qu'il n'y a rien d'autre.
 *
 * ── Le mouvement ─────────────────────────────────────────────────────────
 * Rien ne s'anime au montage : le fil, les cartes et le bouton sont là tout de
 * suite, à leur état de départ. Ce qui bouge, c'est ce qui RÉPOND au doigt —
 * le curseur qui rejoint l'écran choisi, la carte qui prend l'accent, le bloc
 * de diagnostic qui se déplie, le bouton qui s'allume quand la phrase est
 * assez longue pour être envoyée.
 *
 * Les courbes viennent de `utils/gesture` et NON de `theme/motion` : les
 * béziers de `theme/motion` sont celles du moteur `Animated` du cœur de React
 * Native, et ce sont des fonctions JS ordinaires. Passées à `withTiming` de
 * Reanimated, elles seraient appelées depuis le thread UI — le cas exact qui
 * tue l'app sans laisser une seule ligne de log. `utils/gesture` expose les
 * mêmes courbes, compilées en worklets.
 *
 * Côté serveur, rien de nouveau : le rapport part comme un ticket de support
 * de catégorie « bug » (`supportService`), et l'utilisateur atterrit dans le
 * fil de discussion — un bug signalé devient une conversation, pas un
 * formulaire jeté dans le vide.
 */

/** Au-delà, le parcours remonte trop loin pour dire quoi que ce soit du bug. */
const MAX_TRAIL_SHOWN = 6;
const TRAIL_ROW_H = 52;
const RAIL_X = 19;
const DOT = 11;

/** En dessous, il n'y a pas de rapport — juste une phrase à rallonge. */
const MIN_CHARS = 10;

/**
 * Les constructeurs d'animation de disposition sont créés UNE fois, hors du
 * composant : reconstruits à chaque rendu, ils repartiraient de zéro à chaque
 * frappe au clavier.
 */
const DIAG_ENTER = FadeInDown.duration(duration.fast).easing(ease.out);
const DIAG_EXIT = FadeOut.duration(duration.instant);

type ImpactId = 'cosmetic' | 'blocking' | 'broken';

/**
 * La gêne, posée comme une question qu'on peut réellement se poser.
 *
 * Une échelle « mineur / majeur / critique » ne trie rien : tout le monde
 * choisit critique, et à raison — c'est critique pour lui. En demandant ce que
 * l'utilisateur PEUT ENCORE FAIRE, la réponse redevient discriminante.
 */
const IMPACTS: { id: ImpactId; label: string; hint: string }[] = [
  { id: 'cosmetic', label: 'Je peux continuer', hint: "C'est bizarre ou mal affiché, mais ça marche" },
  { id: 'blocking', label: 'Ça me bloque par moments', hint: 'Je dois recommencer ou passer par un détour' },
  { id: 'broken', label: "Je ne peux plus m'en servir", hint: "L'app plante ou reste bloquée" },
];

/**
 * Transition d'état sélectionné / non sélectionné.
 *
 * `motionDuration` rend 0 quand « Réduire les animations » est actif : la
 * valeur atteint sa cible immédiatement, mais le code garde une seule branche
 * — donc aucun risque qu'un état de fin d'animation ne soit jamais posé.
 */
function selectTiming(selected: boolean) {
  return withTiming(selected ? 1 : 0, {
    duration: motionDuration(duration.fast),
    easing: ease.out,
  });
}

/** Une étape du fil. Chaque ligne porte sa propre valeur animée. */
function CrumbRow({
  crumb,
  selected,
  openedAt,
  onPress,
}: {
  crumb: Crumb;
  selected: boolean;
  openedAt: number;
  onPress: () => void;
}) {
  const progress = useSharedValue(selected ? 1 : 0);
  const label = labelForRoute(crumb.route);

  useEffect(() => {
    progress.value = selectTiming(selected);
  }, [progress, selected]);

  // Les couleurs sont extraites AVANT le worklet : capturer `colors` entier
  // ferait voyager tout l'objet de palette vers le thread UI à chaque rendu.
  const dim = colors.textSecondary;
  const bright = colors.textPrimary;

  /** L'anneau s'efface sous le curseur : deux pastilles superposées se voient. */
  const ringStyle = useAnimatedStyle(() => ({ opacity: 1 - progress.value }));
  const labelStyle = useAnimatedStyle(() => ({
    color: interpolateColor(progress.value, [0, 1], [dim, bright]),
  }));

  return (
    <Tappable
      style={styles.crumbRow}
      scaleTo={0.99}
      haptic="select"
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={`${label}, ${describeAge(crumb.at, openedAt)}`}
    >
      <View style={styles.crumbInner}>
        <View style={styles.dotSlot}>
          <Animated.View style={[styles.ring, ringStyle]} />
        </View>
        <Animated.Text style={[styles.crumbLabel, labelStyle]} numberOfLines={1}>
          {label}
        </Animated.Text>
        <Text style={styles.crumbAge}>{describeAge(crumb.at, openedAt)}</Text>
      </View>
    </Tappable>
  );
}

/** Un niveau de gêne. */
function ImpactRow({
  entry,
  selected,
  onPress,
}: {
  entry: (typeof IMPACTS)[number];
  selected: boolean;
  onPress: () => void;
}) {
  const progress = useSharedValue(selected ? 1 : 0);

  useEffect(() => {
    progress.value = selectTiming(selected);
  }, [progress, selected]);

  const dim = colors.textSecondary;
  const bright = colors.textPrimary;
  // Le bord part d'un accent totalement transparent plutôt que de
  // `'transparent'` : interpoler depuis le mot-clé passe par du noir.
  const borderOff = 'rgba(254,44,85,0)';
  const borderOn = colors.accent;

  const frameStyle = useAnimatedStyle(() => ({
    borderColor: interpolateColor(progress.value, [0, 1], [borderOff, borderOn]),
  }));
  const tintStyle = useAnimatedStyle(() => ({ opacity: progress.value }));
  /** La barre pousse depuis le centre au lieu d'apparaître d'un bloc. */
  const markStyle = useAnimatedStyle(() => ({ transform: [{ scaleY: progress.value }] }));
  const labelStyle = useAnimatedStyle(() => ({
    color: interpolateColor(progress.value, [0, 1], [dim, bright]),
  }));

  return (
    <Tappable
      style={styles.impactRow}
      scaleTo={0.99}
      haptic="select"
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={entry.label}
    >
      <Animated.View style={[styles.impactInner, frameStyle]}>
        <Animated.View pointerEvents="none" style={[styles.impactTint, tintStyle]} />
        <View style={styles.impactMarkSlot}>
          <Animated.View style={[styles.impactMark, markStyle]} />
        </View>
        <View style={styles.impactText}>
          <Animated.Text style={[styles.impactLabel, labelStyle]}>{entry.label}</Animated.Text>
          <Text style={styles.impactHint}>{entry.hint}</Text>
        </View>
      </Animated.View>
    </Tappable>
  );
}

interface Props {
  navigation: any;
}

export default function ReportBugScreen({ navigation }: Props) {
  const { top: headerTopInset } = useHeaderMetrics();
  const reduceMotion = useReduceMotion();

  /**
   * Le fil est figé à l'ouverture : il doit décrire le parcours qui a MENÉ au
   * bug, pas se réécrire pendant qu'on remplit le formulaire. On retire l'écran
   * courant, qui ne peut évidemment pas être celui qui a cassé.
   */
  const options = useMemo<Crumb[]>(
    () =>
      getTrail()
        .filter((crumb) => crumb.route !== 'ReportBug')
        .slice(-MAX_TRAIL_SHOWN)
        .reverse(),
    [],
  );

  /**
   * On arrive forcément par Paramètres : ce n'est donc presque jamais là que
   * le bug s'est produit. L'écran d'avant est le bon défaut. Paramètres reste
   * dans la liste — le bug peut très bien y être, et c'est à l'utilisateur de
   * le dire, pas à nous de le décider pour lui.
   */
  const defaultIndex = useMemo(
    () => (options.length > 1 && options[0].route === 'Settings' ? 1 : 0),
    [options],
  );

  const [selected, setSelected] = useState(defaultIndex);
  const [impact, setImpact] = useState<ImpactId>('blocking');
  const [description, setDescription] = useState('');
  const [sending, setSending] = useState(false);
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const [diagnostics, setDiagnostics] = useState<DiagnosticLine[]>([]);

  /** Instant d'ouverture : les âges affichés restent stables pendant la saisie. */
  const openedAt = useMemo(() => Date.now(), []);

  // Position de départ posée directement, sans animation : le curseur est déjà
  // au bon endroit à l'ouverture, il ne vient pas s'y installer sous nos yeux.
  const cursorY = useSharedValue(defaultIndex * TRAIL_ROW_H);
  const halo = useSharedValue(1);
  const chevron = useSharedValue(0);
  const ready = useSharedValue(0);

  useEffect(() => {
    let alive = true;
    collectDiagnostics().then((lines) => {
      if (alive) setDiagnostics(lines);
    });
    return () => {
      alive = false;
    };
  }, []);

  /**
   * Le mouvement le plus visible de l'écran, et il répond à un geste : le
   * curseur rejoint l'écran choisi.
   *
   * Un ressort plutôt qu'une durée fixe, parce que la distance varie — deux
   * lignes ou cinq. Une durée fixe rendrait le saut court mou et le long
   * précipité ; le ressort d'amortissement critique de l'app arrive à la même
   * vivacité dans les deux cas, et se pose sans osciller.
   *
   * Le halo se contracte puis se rouvre : c'est ce qui donne au curseur
   * l'impression de décoller et d'atterrir, plutôt que de glisser à plat.
   */
  const selectCrumb = useCallback(
    (index: number) => {
      setSelected(index);
      const target = index * TRAIL_ROW_H;
      if (isReduceMotionEnabled()) {
        cursorY.value = target;
        halo.value = 1;
        return;
      }
      cursorY.value = withSpring(target, springs.settle);
      halo.value = withSequence(
        withTiming(0.68, { duration: duration.instant, easing: ease.out }),
        withTiming(1, { duration: duration.base, easing: ease.out }),
      );
    },
    [cursorY, halo],
  );

  const toggleDiagnostics = useCallback(() => {
    const next = !showDiagnostics;
    setShowDiagnostics(next);
    chevron.value = withTiming(next ? 1 : 0, {
      duration: motionDuration(duration.fast),
      easing: ease.out,
    });
  }, [chevron, showDiagnostics]);

  const trimmed = description.trim();
  const isReady = trimmed.length >= MIN_CHARS;
  const canSend = isReady && !sending;
  const selectedCrumb = options[selected];
  const impactLabel = IMPACTS.find((entry) => entry.id === impact)!.label;

  /**
   * Le bouton s'allume au moment où la phrase devient assez longue.
   *
   * `isReady` et non `canSend` : pendant l'envoi le bouton est désactivé, mais
   * le voir s'éteindre juste après l'appui donnerait l'impression que l'appui
   * n'a pas été pris en compte.
   */
  useEffect(() => {
    ready.value = withTiming(isReady ? 1 : 0, {
      duration: motionDuration(duration.base),
      easing: ease.out,
    });
  }, [isReady, ready]);

  const sendOff = colors.surfaceAlt;
  const sendOn = colors.accent;
  const sendTextOff = colors.textMuted;
  const sendTextOn = colors.onAccent;

  const cursorStyle = useAnimatedStyle(() => ({ transform: [{ translateY: cursorY.value }] }));
  const haloStyle = useAnimatedStyle(() => ({ transform: [{ scale: halo.value }] }));
  const chevronStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${chevron.value * 180}deg` }],
  }));
  const sendStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(ready.value, [0, 1], [sendOff, sendOn]),
  }));
  const sendLabelStyle = useAnimatedStyle(() => ({
    color: interpolateColor(ready.value, [0, 1], [sendTextOff, sendTextOn]),
  }));

  const handleSend = useCallback(async () => {
    if (!canSend) return;
    setSending(true);

    const screenLabel = selectedCrumb ? labelForRoute(selectedCrumb.route) : 'Écran non précisé';
    // Le parcours se relit dans le sens de la marche, pas dans celui de
    // l'affichage : c'est ce que le développeur va rejouer.
    const path = options
      .slice()
      .reverse()
      .map((crumb) => labelForRoute(crumb.route))
      .join(' → ');

    const context = [
      `Écran concerné : ${screenLabel}`,
      `Gêne : ${impactLabel}`,
      path ? `Parcours : ${path}` : null,
      ...diagnostics.map((line) => `${line.label} : ${line.value}`),
    ]
      .filter(Boolean)
      .join('\n');

    const result = await createTicket({
      category: 'bug',
      subject: `Bug — ${screenLabel}`.slice(0, 120),
      message: `${trimmed}\n\n---\nContexte relevé automatiquement par l'app :\n${context}`,
    });

    setSending(false);

    if (!result.ok) {
      toast.error(result.message || "Le rapport n'est pas parti.");
      return;
    }

    toast.success('Rapport envoyé', {
      description: 'Tu peux suivre la réponse dans ce fil.',
    });

    const ticketId = result.data?.ticket?.id;
    if (ticketId) {
      // `replace` plutôt que `navigate` : revenir en arrière sur un formulaire
      // déjà envoyé n'a aucun sens, et invite à l'envoyer deux fois.
      if (typeof navigation.replace === 'function') {
        navigation.replace('SupportTicket', { ticketId });
      } else {
        navigation.navigate('SupportTicket', { ticketId });
      }
      return;
    }
    navigation.goBack();
  }, [canSend, diagnostics, impactLabel, navigation, options, selectedCrumb, trimmed]);

  return (
    <ScreenBackground>
      <StatusBar barStyle={statusBarStyle()} backgroundColor="transparent" translucent />

      <View style={[styles.headerShell, { paddingTop: headerTopInset }]}>
        <View style={[styles.header, { minHeight: HEADER_CONTENT_HEIGHT }]}>
          <View style={styles.roundSlot}>
            <BackButton navigation={navigation} style={styles.roundButton} />
          </View>
          <View style={styles.titleGroup}>
            <Text style={styles.title}>Signaler un bug</Text>
          </View>
          <View style={styles.roundSlot} />
        </View>
      </View>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={headerTopInset + HEADER_CONTENT_HEIGHT}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
        >
          {/* La thèse de l'écran, en une ligne : ce qu'on te demande, et ce
              qu'on ne te demande pas. */}
          <Text style={styles.thesis}>
            Tu pointes le moment.{'\n'}
            <Text style={styles.thesisDim}>L'app écrit le reste.</Text>
          </Text>

          {/* 1 — OÙ. Le fil : l'élément signature de l'écran. */}
          <Text style={styles.step}>Où ça s'est passé</Text>
          {options.length > 0 ? (
            <>
              <Text style={styles.stepHint}>Tes derniers écrans, du plus récent au plus ancien.</Text>
              <View style={[styles.trail, { height: options.length * TRAIL_ROW_H }]}>
                <View style={styles.rail} />
                <Animated.View pointerEvents="none" style={[styles.cursor, cursorStyle]}>
                  <Animated.View style={[styles.cursorHalo, haloStyle]} />
                  <View style={styles.cursorDot} />
                </Animated.View>

                {options.map((crumb, index) => (
                  <CrumbRow
                    key={`${crumb.route}-${crumb.at}`}
                    crumb={crumb}
                    selected={index === selected}
                    openedAt={openedAt}
                    onPress={() => selectCrumb(index)}
                  />
                ))}
              </View>
            </>
          ) : (
            <View style={styles.emptyTrail}>
              <Ionicons name="help-circle-outline" size={18} color={colors.textMuted} />
              <Text style={styles.emptyTrailText}>
                Je n'ai pas retenu ton parcours cette fois-ci. Précise l'écran dans ta description.
              </Text>
            </View>
          )}

          {/* 2 — COMBIEN ÇA GÊNE. */}
          <Text style={styles.step}>Ce que tu peux encore faire</Text>
          <View style={styles.impacts}>
            {IMPACTS.map((entry) => (
              <ImpactRow
                key={entry.id}
                entry={entry}
                selected={entry.id === impact}
                onPress={() => setImpact(entry.id)}
              />
            ))}
          </View>

          {/* 3 — QUOI. Le seul champ à saisir. */}
          <Text style={styles.step}>Ce que tu attendais</Text>
          <TextInput
            style={styles.input}
            value={description}
            onChangeText={setDescription}
            placeholder="J'ai appuyé sur Envoyer et le tweet n'est jamais apparu."
            placeholderTextColor={colors.textMuted}
            selectionColor={colors.accent}
            multiline
            textAlignVertical="top"
            accessibilityLabel="Description du bug"
          />

          {/* Le bloc qui prouve qu'il n'y a rien d'autre. Replié : c'est une
              garantie, pas le sujet de l'écran. */}
          <Tappable
            style={styles.diagToggle}
            scaleTo={0.995}
            onPress={toggleDiagnostics}
            accessibilityRole="button"
            accessibilityState={{ expanded: showDiagnostics }}
            accessibilityLabel="Voir ce qui part avec le message"
          >
            <View style={styles.diagToggleInner}>
              <Ionicons name="shield-checkmark-outline" size={16} color={colors.cyan} />
              <Text style={styles.diagToggleText}>Ce qui part avec ton message</Text>
              <Animated.View style={chevronStyle}>
                <Ionicons name="chevron-down" size={16} color={colors.textMuted} />
              </Animated.View>
            </View>
          </Tappable>

          {showDiagnostics && (
            <Animated.View
              style={styles.diagBody}
              entering={reduceMotion ? undefined : DIAG_ENTER}
              exiting={reduceMotion ? undefined : DIAG_EXIT}
            >
              {diagnostics.map((line) => (
                <View key={line.label} style={styles.diagLine}>
                  <Text style={styles.diagLabel}>{line.label}</Text>
                  <Text style={styles.diagValue} numberOfLines={1}>
                    {line.value}
                  </Text>
                </View>
              ))}
              <Text style={styles.diagFoot}>
                Rien d'autre : ni le contenu de tes messages, ni ta position, ni tes mots de passe.
                Ce parcours n'est gardé qu'en mémoire, le temps de la session.
              </Text>
            </Animated.View>
          )}
        </ScrollView>

        <View style={styles.footer}>
          <Tappable
            style={styles.sendWrap}
            scaleTo={0.98}
            disabled={!canSend}
            onPress={handleSend}
            accessibilityRole="button"
            accessibilityState={{ disabled: !canSend, busy: sending }}
            accessibilityLabel="Envoyer le rapport"
          >
            <Animated.View style={[styles.send, sendStyle]}>
              {sending ? (
                <ActivityIndicator color={colors.onAccent} />
              ) : (
                <Animated.Text style={[styles.sendText, sendLabelStyle]}>
                  Envoyer le rapport
                </Animated.Text>
              )}
            </Animated.View>
          </Tappable>
          <Text style={styles.footerNote}>
            {isReady
              ? 'Ça ouvre un ticket que tu pourras suivre.'
              : 'Écris une phrase, même courte, pour pouvoir envoyer.'}
          </Text>
        </View>
      </KeyboardAvoidingView>
    </ScreenBackground>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },

  headerShell: { backgroundColor: 'transparent' },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16 },
  roundSlot: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  roundButton: {
    width: 40,
    height: 40,
    padding: 0,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 20,
    backgroundColor: colors.surface,
  },
  titleGroup: { flex: 1, minWidth: 0, paddingHorizontal: 10 },
  title: {
    color: colors.textPrimary,
    fontSize: 17,
    textAlign: 'center',
    fontFamily: fonts.heading,
  },

  content: { padding: 16, paddingBottom: 24 },

  thesis: {
    fontFamily: fonts.display,
    fontSize: 26,
    lineHeight: 32,
    letterSpacing: -0.6,
    color: colors.textPrimary,
    marginTop: 4,
    marginBottom: 28,
  },
  thesisDim: { color: colors.textMuted },

  step: {
    fontFamily: fonts.semibold,
    fontSize: 12,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    color: colors.textMuted,
    marginBottom: 8,
  },
  stepHint: {
    fontFamily: fonts.regular,
    fontSize: 13,
    color: colors.textSecondary,
    marginBottom: 10,
  },

  // ---- Le fil ----------------------------------------------------------
  trail: { position: 'relative', marginBottom: 28 },
  /**
   * Le rail s'arrête à mi-hauteur de la première et de la dernière pastille :
   * un trait qui déborde donnerait l'impression que le parcours continue
   * au-delà de ce qu'on montre.
   */
  rail: {
    position: 'absolute',
    left: RAIL_X,
    top: TRAIL_ROW_H / 2,
    bottom: TRAIL_ROW_H / 2,
    width: 1,
    backgroundColor: colors.border,
  },
  cursor: {
    position: 'absolute',
    left: RAIL_X - 13,
    top: TRAIL_ROW_H / 2 - 13,
    width: 27,
    height: 27,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cursorHalo: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 14,
    backgroundColor: colors.accentMuted,
  },
  cursorDot: {
    width: DOT,
    height: DOT,
    borderRadius: DOT / 2,
    backgroundColor: colors.accent,
  },
  crumbRow: { height: TRAIL_ROW_H, justifyContent: 'center' },
  crumbInner: { flexDirection: 'row', alignItems: 'center' },
  dotSlot: { width: RAIL_X * 2, alignItems: 'center' },
  ring: {
    width: DOT,
    height: DOT,
    borderRadius: DOT / 2,
    borderWidth: 1.5,
    borderColor: colors.borderStrong,
    backgroundColor: colors.bg,
  },
  crumbLabel: {
    flex: 1,
    fontFamily: fonts.medium,
    fontSize: 15,
  },
  crumbAge: {
    fontFamily: fonts.regular,
    fontSize: 12,
    color: colors.textMuted,
    marginLeft: 10,
  },

  emptyTrail: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'flex-start',
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 14,
    marginBottom: 28,
  },
  emptyTrailText: {
    flex: 1,
    fontFamily: fonts.regular,
    fontSize: 13,
    lineHeight: 19,
    color: colors.textSecondary,
  },

  // ---- La gêne ---------------------------------------------------------
  impacts: { marginBottom: 28 },
  impactRow: { marginBottom: 8 },
  impactInner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    paddingRight: 14,
    overflow: 'hidden',
  },
  /** Le voile accent, posé par-dessus la surface plutôt qu'en remplaçant sa
      couleur : une opacité s'anime sur le thread UI, pas un fond. */
  impactTint: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.accentSoft,
  },
  /** La colonne garde sa largeur dans les deux états : la carte ne saute pas
      d'un choix à l'autre. */
  impactMarkSlot: { width: 3, alignSelf: 'stretch' },
  impactMark: { flex: 1, backgroundColor: colors.accent },
  impactText: { flex: 1, paddingVertical: 12, paddingLeft: 13 },
  impactLabel: {
    fontFamily: fonts.medium,
    fontSize: 15,
    marginBottom: 2,
  },
  impactHint: {
    fontFamily: fonts.regular,
    fontSize: 12.5,
    color: colors.textMuted,
  },

  // ---- La description --------------------------------------------------
  input: {
    minHeight: 116,
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 14,
    fontFamily: fonts.regular,
    fontSize: 15,
    lineHeight: 21,
    color: colors.textPrimary,
    marginBottom: 24,
  },

  // ---- Le diagnostic ---------------------------------------------------
  diagToggle: { marginBottom: 0 },
  diagToggleInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 12,
  },
  diagToggleText: {
    flex: 1,
    fontFamily: fonts.medium,
    fontSize: 13.5,
    color: colors.cyan,
  },
  diagBody: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 14,
    borderLeftWidth: 2,
    borderLeftColor: colors.cyanMuted,
  },
  diagLine: { flexDirection: 'row', alignItems: 'center', paddingVertical: 3 },
  diagLabel: {
    width: 78,
    fontFamily: fonts.regular,
    fontSize: 12,
    color: colors.textMuted,
  },
  /** Monospace : ces lignes sont des mesures, pas de la prose. */
  diagValue: {
    flex: 1,
    fontFamily: displayNameFonts.mono,
    fontSize: 11.5,
    color: colors.textSecondary,
  },
  diagFoot: {
    fontFamily: fonts.regular,
    fontSize: 12,
    lineHeight: 18,
    color: colors.textMuted,
    marginTop: 10,
  },

  // ---- L'envoi ---------------------------------------------------------
  footer: {
    paddingHorizontal: 16,
    paddingTop: 10,
    // La barre d'onglets absolue de l'app recouvrirait le bouton.
    paddingBottom: 96,
    backgroundColor: colors.bg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  sendWrap: { borderRadius: 14 },
  send: {
    height: 52,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendText: {
    fontFamily: fonts.semibold,
    fontSize: 16,
    letterSpacing: 0.2,
  },
  footerNote: {
    fontFamily: fonts.regular,
    fontSize: 12,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: 10,
  },
});
