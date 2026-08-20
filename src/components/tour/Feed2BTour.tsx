/**
 * Visite guidée du fil « 2B — Gouttière », en bulles posées sur la VRAIE
 * interface.
 *
 * ── Pourquoi pas une page de présentation ──
 * La première version était une page à part qui redessinait une ligne de fil,
 * une gouttière et une grille Explorer avec les jetons du test. Fidèle sur le
 * papier, ratée en pratique : une copie du fil reste une copie, elle se repère
 * immédiatement. Elle vieillit en plus toute seule — le jour où la vraie ligne
 * bouge d'un pixel, la démonstration ment.
 *
 * Ici il n'y a plus rien à imiter : le voile s'ouvre sur l'élément réel, à sa
 * vraie place, avec le vrai contenu de la personne.
 *
 * ── Deux pièges de mesure, et comment ils sont traités ──
 *
 * 1. **Mesurer trop tôt donne une position fausse.** Une mesure prise pendant
 *    que le fil se remplit renvoie une mise en page intermédiaire : le trou
 *    s'ouvre alors sur l'élément du dessus. On attend donc qu'une LIGNE
 *    réponde — la liste chargée, l'en-tête a fini de bouger — avant de mesurer
 *    quoi que ce soit, y compris la première étape.
 *
 * 2. **Une ancre inscrite n'est pas une ancre présente.** L'écran inscrit ses
 *    ancres au montage, bien avant que les vues correspondantes existent :
 *    attendre `anchors.has(...)` ne prouve rien. Seule une MESURE RÉUSSIE
 *    prouve que la vue est là.
 *
 * ── Le trou ──
 * Quatre rectangles autour de la zone, pas un masque : aucune dépendance à
 * `react-native-svg` ni au support inégal de `MaskedView`, et le rendu reste
 * une poignée de vues opaques.
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  ReactNode,
} from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  useWindowDimensions,
  InteractionManager,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { paper, paperFonts, ps } from '../../theme/paper2b';

/* ================================================================== */
/* Étapes                                                              */
/* ================================================================== */

export type TourAnchorId = 'tabs' | 'gutter' | 'algo' | 'explore';

/** Gestes que la visite peut demander à l'écran avant d'ouvrir une étape. */
export type TourActionId = 'openExplore';

interface Step {
  /**
   * Élément à désigner. `null` = bulle centrée sans trou : l'étape parle de
   * TOUT ce qui est à l'écran, et découper un trou de la taille de l'écran ne
   * désignerait rien tout en ne laissant nulle part où poser la bulle.
   */
  anchor: TourAnchorId | null;
  title: string;
  body: string;
  /** Geste à demander à l'écran avant d'ouvrir l'étape. */
  enter?: TourActionId;
  /** Marge autour de la zone éclairée, pour ne pas la coller au bord du trou. */
  pad?: number;
  /** Rayon du trou. Une ligne de fil se découpe carré, un onglet s'arrondit. */
  radius?: number;
}

const STEPS: Step[] = [
  {
    anchor: 'tabs',
    title: 'Trois fils, un seul geste',
    body:
      'Abonnements pour ceux que tu suis, Pour toi pour la découverte, Explorer pour voir '
      + 'large. Tu bascules en touchant, ou en glissant le fil sur le côté.',
    pad: 6,
    radius: 10,
  },
  {
    anchor: 'gutter',
    title: 'L’engagement est passé à gauche',
    body:
      'Cœur, repost et réponses vivent maintenant dans cette colonne, alignés sur toute la '
      + 'hauteur de la publication. Le texte récupère la largeur, et ton pouce retrouve les '
      + 'mêmes actions au même endroit sur chaque ligne.',
    pad: 4,
    radius: 12,
  },
  {
    anchor: 'algo',
    title: 'Le seul moment où tu parles à l’algorithme',
    body:
      'De temps en temps, le fil te demande si tu veux plus de ce genre de contenu. C’est le '
      + 'seul signal explicite du recommandeur — et le seul qui porte quand tu fais défiler '
      + 'sans rien toucher.',
    pad: 4,
    radius: 12,
  },
  {
    anchor: 'explore',
    title: 'Le troisième fil : Explorer',
    body: 'Touche « Suivant » : on y va, et je te montre à quoi il sert.',
    pad: 6,
    radius: 10,
  },
  {
    // Pas d’ancre : à ce moment-là, c’est le mur ENTIER dont on parle. Le voile
    // s’allège pour qu’il reste lisible derrière la bulle.
    anchor: null,
    enter: 'openExplore',
    title: 'Le mur, pour choisir toi-même',
    body:
      'Deux colonnes, et chaque publication garde sa hauteur : tu en vois une douzaine d’un '
      + 'coup au lieu d’une seule. Ce que tu ouvres ici compte double pour l’auteur — c’est '
      + 'un choix, pas un passage. Balaye vers le bas pour en tirer d’autres.',
  },
];

/* ================================================================== */
/* Contexte                                                            */
/* ================================================================== */

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

type Measurer = () => Promise<Rect | null>;
type Action = () => void;

interface TourContextValue {
  active: boolean;
  start: () => void;
  stop: () => void;
  register: (id: TourAnchorId, measure: Measurer) => () => void;
  registerAction: (id: TourActionId, run: Action) => () => void;
}

const TourContext = createContext<TourContextValue>({
  active: false,
  start: () => {},
  stop: () => {},
  register: () => () => {},
  registerAction: () => () => {},
});

export function useFeed2BTour() {
  const { active, start, stop } = useContext(TourContext);
  return { active, start, stop };
}

/**
 * Déclare un élément comme cible d'une étape.
 *
 * À poser sur la vue à désigner : `<View ref={ref} collapsable={false}>`.
 * `collapsable={false}` n'est pas décoratif : sur Android, une vue de mise en
 * page sans style propre est fusionnée avec son parent, et `measureInWindow`
 * renvoie alors le cadre du PARENT — un trou qui s'ouvre à côté de sa cible.
 */
export function useTourAnchor(id: TourAnchorId) {
  const { register } = useContext(TourContext);
  const ref = useRef<View | null>(null);

  useEffect(() => {
    const measure: Measurer = () =>
      new Promise((resolve) => {
        const node = ref.current;
        if (!node || typeof node.measureInWindow !== 'function') {
          resolve(null);
          return;
        }
        // Une vue démontée ou pas encore posée renvoie des zéros : on la traite
        // comme absente, sinon le trou s'ouvre dans le coin haut gauche.
        node.measureInWindow((x, y, width, height) => {
          if (!width || !height) resolve(null);
          else resolve({ x, y, width, height });
        });
      });

    return register(id, measure);
  }, [id, register]);

  return ref;
}

/** Déclare un geste que la visite peut demander (basculer sur Explorer…). */
export function useTourAction(id: TourActionId, run: Action) {
  const { registerAction } = useContext(TourContext);
  const latest = useRef(run);
  latest.current = run;

  useEffect(() => {
    // On inscrit un relais stable qui appelle la dernière version : sans lui,
    // chaque rendu de l'écran réinscrirait une fonction neuve.
    return registerAction(id, () => latest.current());
  }, [id, registerAction]);
}

/* ================================================================== */
/* Fournisseur                                                         */
/* ================================================================== */

/** Attente maximale qu'une ligne du fil réponde, au démarrage. */
const READY_WAIT_MS = 6000;
const POLL_MS = 150;
/** Laps laissé à l'écran après un geste (bascule d'onglet) avant de mesurer. */
const AFTER_ACTION_MS = 650;

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export function Feed2BTourProvider({ children }: { children: ReactNode }) {
  const [active, setActive] = useState(false);
  /** Étapes réellement disponibles, décidées une fois au démarrage. */
  const [plan, setPlan] = useState<Step[]>([]);
  const [stepIndex, setStepIndex] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);
  const [ready, setReady] = useState(false);

  const anchors = useRef(new Map<TourAnchorId, Measurer>()).current;
  const actions = useRef(new Map<TourActionId, Action>()).current;
  const runId = useRef(0);

  const register = useCallback(
    (id: TourAnchorId, measure: Measurer) => {
      anchors.set(id, measure);
      return () => {
        // Comparaison avant suppression : deux lignes peuvent s'enregistrer
        // sous la même ancre pendant un recyclage de `FlatList`, et celle qui
        // se démonte ne doit pas effacer l'inscription de celle qui arrive.
        if (anchors.get(id) === measure) anchors.delete(id);
      };
    },
    [anchors]
  );

  const registerAction = useCallback(
    (id: TourActionId, run: Action) => {
      actions.set(id, run);
      return () => {
        if (actions.get(id) === run) actions.delete(id);
      };
    },
    [actions]
  );

  const measureAnchor = useCallback(
    async (id: TourAnchorId): Promise<Rect | null> => {
      const measure = anchors.get(id);
      if (!measure) return null;
      return measure();
    },
    [anchors]
  );

  const stop = useCallback(() => {
    runId.current += 1;
    setActive(false);
    setReady(false);
    setRect(null);
    setPlan([]);
  }, []);

  /**
   * Attend que le fil soit VRAIMENT posé.
   *
   * Le test est une mesure réussie de la gouttière, pas la présence de son
   * inscription : l'écran inscrit ses ancres au montage, bien avant que la
   * première ligne existe. Tant que la liste se remplit, l'en-tête bouge
   * encore — mesurer la barre d'onglets à ce moment-là la place un cran trop
   * haut, sur le mot-marque.
   */
  const waitForFeed = useCallback(async () => {
    await new Promise<void>((resolve) => {
      InteractionManager.runAfterInteractions(() => resolve());
    });
    const deadline = Date.now() + READY_WAIT_MS;
    while (Date.now() < deadline) {
      if (await measureAnchor('gutter')) return;
      await wait(POLL_MS);
    }
  }, [measureAnchor]);

  /**
   * Fige la liste des étapes avant d'en montrer une seule.
   *
   * Le compteur « 2 / 4 » ne peut être honnête que si le total est connu
   * d'avance, et une étape découverte manquante en cours de route ferait
   * bondir le compteur. Les étapes sans ancre sont toujours retenues ; celles
   * dont l'ancre n'existe pas (la question de l'algorithme, posée seulement
   * de temps en temps) sont écartées d'emblée.
   */
  const buildPlan = useCallback(async (): Promise<Step[]> => {
    const available: Step[] = [];
    for (const step of STEPS) {
      if (step.anchor === null) {
        available.push(step);
        continue;
      }
      if (await measureAnchor(step.anchor)) available.push(step);
    }
    return available;
  }, [measureAnchor]);

  /** Ouvre l'étape `i` du plan : geste éventuel, puis mesure fraîche. */
  const openStep = useCallback(
    async (candidate: Step[], i: number, id: number): Promise<boolean> => {
      const step = candidate[i];
      if (!step) return false;

      if (step.enter) {
        actions.get(step.enter)?.();
        await wait(AFTER_ACTION_MS);
        if (runId.current !== id) return false;
      }

      if (step.anchor === null) {
        setStepIndex(i);
        setRect(null);
        setReady(true);
        return true;
      }

      // Re-mesure juste avant l'affichage : entre le plan et maintenant, une
      // image a pu se charger et tout décaler.
      const measured = await measureAnchor(step.anchor);
      if (runId.current !== id) return false;
      if (!measured) return false;

      setStepIndex(i);
      setRect(measured);
      setReady(true);
      return true;
    },
    [actions, measureAnchor]
  );

  const start = useCallback(async () => {
    const id = (runId.current += 1);
    setStepIndex(0);
    setRect(null);
    setReady(false);
    setActive(true);

    await waitForFeed();
    if (runId.current !== id) return;

    const candidate = await buildPlan();
    if (runId.current !== id) return;
    if (candidate.length === 0) {
      setActive(false);
      return;
    }

    setPlan(candidate);
    for (let i = 0; i < candidate.length; i += 1) {
      if (await openStep(candidate, i, id)) return;
      // Une visite relancée entre-temps a déjà pris la main : sortir sans
      // toucher à l'état, sinon on éteindrait la nouvelle.
      if (runId.current !== id) return;
    }
    setActive(false);
  }, [waitForFeed, buildPlan, openStep]);

  const next = useCallback(async () => {
    const id = runId.current;
    for (let i = stepIndex + 1; i < plan.length; i += 1) {
      if (await openStep(plan, i, id)) return;
      if (runId.current !== id) return;
    }
    stop();
  }, [openStep, plan, stepIndex, stop]);

  const value = useMemo(
    () => ({ active, start, stop, register, registerAction }),
    [active, start, stop, register, registerAction]
  );

  return (
    <TourContext.Provider value={value}>
      {children}
      {active && ready && plan.length > 0 && (
        <TourOverlay
          step={plan[stepIndex]}
          stepNumber={stepIndex + 1}
          total={plan.length}
          rect={rect}
          onNext={next}
          onSkip={stop}
        />
      )}
    </TourContext.Provider>
  );
}

/* ================================================================== */
/* Voile + bulle                                                       */
/* ================================================================== */

const SCRIM = 'rgba(0,0,0,0.72)';
/** Voile allégé quand l'étape parle de tout l'écran : il doit rester lisible. */
const SCRIM_SOFT = 'rgba(0,0,0,0.55)';
const BUBBLE_MAX_W = 360;

function TourOverlay({
  step,
  stepNumber,
  total,
  rect,
  onNext,
  onSkip,
}: {
  step: Step;
  stepNumber: number;
  total: number;
  rect: Rect | null;
  onNext: () => void;
  onSkip: () => void;
}) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  const last = stepNumber >= total;

  const card = (
    <View style={styles.bubble}>
      <Text style={styles.counter}>
        {stepNumber} / {total}
      </Text>
      <Text style={styles.title}>{step.title}</Text>
      <Text style={styles.body}>{step.body}</Text>

      <View style={styles.actions}>
        <Pressable
          onPress={onSkip}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          accessibilityRole="button"
          accessibilityLabel="Passer la visite"
        >
          <Text style={styles.skip}>Passer</Text>
        </Pressable>

        <Pressable
          onPress={last ? onSkip : onNext}
          style={styles.cta}
          accessibilityRole="button"
          accessibilityLabel={last ? 'Terminer' : 'Suivant'}
        >
          <Text style={styles.ctaText}>{last ? 'C’est parti' : 'Suivant'}</Text>
        </Pressable>
      </View>
    </View>
  );

  /* --- Étape sans cible : bulle centrée, voile allégé ------------------- */
  if (!rect) {
    return (
      <View style={StyleSheet.absoluteFill}>
        <Pressable style={[StyleSheet.absoluteFill, { backgroundColor: SCRIM_SOFT }]} onPress={onNext} />
        <View style={styles.centered} pointerEvents="box-none">
          <View style={{ width: Math.min(width - ps(32), BUBBLE_MAX_W) }}>{card}</View>
        </View>
      </View>
    );
  }

  /* --- Étape avec cible ------------------------------------------------ */
  const pad = step.pad ?? 6;
  const hole = {
    x: Math.max(0, rect.x - pad),
    y: Math.max(0, rect.y - pad),
    width: Math.min(width, rect.width + pad * 2),
    height: rect.height + pad * 2,
  };
  const holeBottom = hole.y + hole.height;

  // La bulle se pose sous la zone quand il y a la place, sinon au-dessus. Le
  // seuil compte la bulle ET la marge basse : une bulle qui déborde sous
  // l'écran laisse « Suivant » hors d'atteinte, et la visite finit en impasse.
  const ESTIMATED_BUBBLE_H = ps(190);
  const roomBelow = height - holeBottom - insets.bottom - ps(16);
  const below = roomBelow >= ESTIMATED_BUBBLE_H;

  const bubbleWidth = Math.min(width - ps(32), BUBBLE_MAX_W);
  const bubbleLeft = Math.max(
    ps(16),
    Math.min(width - bubbleWidth - ps(16), hole.x + hole.width / 2 - bubbleWidth / 2)
  );

  // Le triangle vise le CENTRE de la zone éclairée, borné aux coins arrondis
  // de la bulle pour ne pas dépasser sur le côté.
  const pointerSize = ps(10);
  const pointerLeft = Math.max(
    ps(14),
    Math.min(
      bubbleWidth - ps(14) - pointerSize * 2,
      hole.x + hole.width / 2 - bubbleLeft - pointerSize
    )
  );

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      {/* Voile en quatre pièces autour du trou. Chacune intercepte le toucher :
          pendant la visite, l'app ne doit pas bouger sous les bulles. */}
      <Pressable style={[styles.scrim, { top: 0, left: 0, right: 0, height: hole.y }]} onPress={onNext} />
      <Pressable
        style={[styles.scrim, { top: holeBottom, left: 0, right: 0, bottom: 0 }]}
        onPress={onNext}
      />
      <Pressable
        style={[styles.scrim, { top: hole.y, left: 0, width: hole.x, height: hole.height }]}
        onPress={onNext}
      />
      <Pressable
        style={[
          styles.scrim,
          { top: hole.y, left: hole.x + hole.width, right: 0, height: hole.height },
        ]}
        onPress={onNext}
      />

      {/* Contour du trou : sans lui, la zone claire se lit comme un défaut
          d'affichage plutôt que comme une désignation. */}
      <View
        pointerEvents="none"
        style={[
          styles.ring,
          {
            top: hole.y,
            left: hole.x,
            width: hole.width,
            height: hole.height,
            borderRadius: step.radius ?? 12,
          },
        ]}
      />

      <View
        style={[
          styles.bubbleWrap,
          {
            left: bubbleLeft,
            width: bubbleWidth,
            ...(below
              ? { top: holeBottom + pointerSize }
              : { bottom: height - hole.y + pointerSize }),
          },
        ]}
      >
        {below && <View style={[styles.pointer, styles.pointerUp, { left: pointerLeft }]} />}
        {card}
        {!below && <View style={[styles.pointer, styles.pointerDown, { left: pointerLeft }]} />}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  scrim: { position: 'absolute', backgroundColor: SCRIM },

  ring: {
    position: 'absolute',
    borderWidth: ps(2),
    borderColor: paper.accent,
  },

  centered: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: ps(16),
  },

  bubbleWrap: { position: 'absolute' },

  bubble: {
    backgroundColor: paper.bgBand,
    borderRadius: ps(14),
    padding: ps(16),
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: paper.hairline,
  },

  // Un carré tourné : le triangle en bordures CSS ne se rend pas
  // identiquement sur les deux plateformes, celui-ci si.
  pointer: {
    position: 'absolute',
    width: ps(20),
    height: ps(20),
    backgroundColor: paper.bgBand,
    transform: [{ rotate: '45deg' }],
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: paper.hairline,
  },
  pointerUp: { top: -ps(10) },
  pointerDown: { bottom: -ps(10) },

  counter: {
    fontFamily: paperFonts.mono,
    fontSize: ps(10),
    letterSpacing: ps(1),
    color: paper.accent,
    marginBottom: ps(8),
  },
  title: {
    fontFamily: paperFonts.display,
    fontSize: ps(17),
    lineHeight: ps(22),
    color: paper.ink,
  },
  body: {
    marginTop: ps(6),
    fontFamily: paperFonts.body,
    fontSize: ps(13.5),
    lineHeight: ps(20),
    color: paper.inkSoft,
  },

  actions: {
    marginTop: ps(16),
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  skip: {
    fontFamily: paperFonts.strong,
    fontSize: ps(13),
    color: paper.inkMeta,
  },
  cta: {
    paddingHorizontal: ps(18),
    paddingVertical: ps(9),
    borderRadius: ps(999),
    backgroundColor: paper.accent,
  },
  ctaText: {
    fontFamily: paperFonts.strong,
    fontSize: ps(13),
    color: paper.onAccent,
  },
});
