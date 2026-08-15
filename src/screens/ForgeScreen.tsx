import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import Svg, {
  Defs,
  LinearGradient as SvgGradient,
  RadialGradient as SvgRadialGradient,
  Rect,
  Stop,
} from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import { colors, fonts, statusBarStyle, towardWhite, withAlpha } from '../theme';
import { ScreenBackground, BackButton, ScreenSkeleton, Tappable } from '../components/ui';
import { toast } from '../components/ui/Toast';
import useSheetGesture from '../hooks/useSheetGesture';
import { isReduceMotionEnabled } from '../hooks/useReduceMotion';
import forgeService, {
  AREAS,
  BODY_MAX,
  BODY_MIN,
  BuiltProposal,
  ForgeStats,
  JOURNEY,
  Proposal,
  ProposalArea,
  ProposalStatus,
  STATUS_HINTS,
  STATUS_LABELS,
  TITLE_MAX,
  TITLE_MIN,
} from '../services/forgeService';

/**
 * La Forge — on y apporte de la matière brute, l'équipe la façonne.
 *
 * ── Pourquoi ce nom ───────────────────────────────────────────────────────
 * Les visuels premium de l'app parlent déjà de métal, de lumière et de poli
 * (voir `AvatarMaterial`). Une forge est l'endroit où l'on travaille le
 * métal : le nom n'est pas décoratif, il branche cet écran sur le vocabulaire
 * que l'app s'est déjà donné. Et il dit ce qui se passe ici — on apporte
 * quelque chose de brut, quelqu'un le façonne, et ce qui en sort est frappé.
 *
 * ── L'élément signature ───────────────────────────────────────────────────
 * Une idée est une pièce de matière qui avance dans le feu. Sa carte porte
 * quatre crans — Reçue, À l'étude, Retenue, Construite — et **seule la
 * dernière reçoit la lumière** : un liseré vif qui respire, et le montant
 * frappé en monospace doré.
 *
 * C'est un choix de retenue, pas d'économie de moyens. Si chaque carte
 * brillait, la carte construite ne voudrait plus rien dire — or c'est
 * exactement ce que cet écran doit donner envie d'atteindre.
 *
 * ── Ce que l'écran promet ─────────────────────────────────────────────────
 * Le montant n'est jamais annoncé à l'avance et l'écran ne le suggère nulle
 * part : il est choisi par le staff au moment de la décision. Afficher une
 * grille tarifaire serait un engagement que personne n'a pris, et la première
 * récompense en dessous de l'attente ferait plus de mal que pas de récompense
 * du tout.
 */

/**
 * La braise, derrière le titre.
 *
 * ── Pourquoi elle existe ──────────────────────────────────────────────────
 * L'élément signature de cet écran était le liseré de la carte CONSTRUITE. Il
 * fallait donc qu'une idée soit déjà construite pour voir la seule chose
 * mémorable de la page — autrement dit, personne ne la voyait au premier
 * jour, qui est précisément le moment où il faut convaincre. La matière
 * remonte ici, où tout le monde la voit tout de suite ; le liseré de la carte
 * en devient l'écho, plus l'unique occurrence.
 *
 * ── Pourquoi elle est BASSE et large ──────────────────────────────────────
 * Dans une forge, le feu est SOUS le métal. Une lueur centrée derrière un
 * titre est le halo générique qu'on voit partout ; une chaleur qui monte du
 * bas de la ligne se lit comme une source, et elle porte le seul mot qui
 * engage — « On te paie ».
 */
function Ember({ accent }: { accent: string }) {
  const value = useSharedValue(0);

  useEffect(() => {
    if (isReduceMotionEnabled()) {
      value.value = 0.5;
      return;
    }
    value.value = withRepeat(
      withTiming(1, { duration: 5200, easing: Easing.inOut(Easing.sin) }),
      -1,
      true,
    );
  }, [value]);

  // Le souffle est LENT et de faible amplitude : une braise respire, elle ne
  // clignote pas. Au-delà, on regarde l'animation au lieu de lire le titre.
  const style = useAnimatedStyle(() => ({ opacity: 0.5 + value.value * 0.5 }));

  return (
    <Animated.View pointerEvents="none" style={[styles.ember, style]}>
      <Svg width="100%" height="100%" preserveAspectRatio="none">
        <Defs>
          {/*
            Le rayon et le centre sont calés pour que la lueur meure LARGEMENT
            avant les bords de sa boîte : 45 % ± 38 % couvre 7 %–83 %, dans les
            deux axes. Une première version centrée à 88 % de hauteur avec un
            rayon de 62 % n'avait que 12 % pour s'éteindre par le bas : elle
            sortait en rectangle clair aux arêtes franches derrière le titre.
            C'est le même défaut que le fond de profil a déjà eu — un dégradé
            ne doit jamais atteindre le bord de sa forme.
          */}
          <SvgRadialGradient id="forge-ember" cx="45%" cy="45%" r="38%">
            <Stop offset="0" stopColor={towardWhite(accent, 0.62)} stopOpacity={0.32} />
            <Stop offset="0.5" stopColor={accent} stopOpacity={0.13} />
            <Stop offset="1" stopColor={accent} stopOpacity={0} />
          </SvgRadialGradient>
        </Defs>
        <Rect x={0} y={0} width="100%" height="100%" fill="url(#forge-ember)" />
      </Svg>
    </Animated.View>
  );
}

/** Position d'un statut sur le chemin. `-1` pour une idée écartée. */
function journeyIndex(status: ProposalStatus): number {
  return JOURNEY.indexOf(status);
}

/**
 * Le liseré de la carte construite.
 *
 * Même recette que la matière du profil, à la seule échelle qui convient ici :
 * un dégradé qui passe par du presque-blanc en son milieu. Un liseré d'une
 * seule teinte ferait une bordure colorée ; c'est le passage par la lumière
 * qui le fait lire comme du métal chauffé.
 */
function BuiltEdge({ accent, id }: { accent: string; id: string }) {
  const value = useSharedValue(0);

  useEffect(() => {
    if (isReduceMotionEnabled()) {
      value.value = 0.6;
      return;
    }
    // Boucle décorative permanente : c'est l'exception assumée à la règle
    // « rien ne s'anime au montage » (voir `theme/motion`). Une récompense
    // figée n'a aucune valeur perçue.
    value.value = withRepeat(
      withTiming(1, { duration: 3200, easing: Easing.inOut(Easing.sin) }),
      -1,
      true,
    );
  }, [value]);

  const style = useAnimatedStyle(() => ({ opacity: 0.45 + value.value * 0.55 }));
  const hot = towardWhite(accent, 0.3);

  return (
    <Animated.View pointerEvents="none" style={[styles.builtEdge, style]}>
      <Svg width="100%" height="100%" preserveAspectRatio="none">
        <Defs>
          <SvgGradient id={id} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={accent} stopOpacity={0.65} />
            <Stop offset="0.5" stopColor={hot} stopOpacity={1} />
            <Stop offset="1" stopColor={accent} stopOpacity={0.65} />
          </SvgGradient>
        </Defs>
        <Rect x={0} y={0} width="100%" height="100%" fill={`url(#${id})`} />
      </Svg>
    </Animated.View>
  );
}

/** Les quatre crans. Une vraie séquence, donc une vraie barre de progression. */
function JourneyRail({ status, accent }: { status: ProposalStatus; accent: string }) {
  const index = journeyIndex(status);
  const declined = status === 'declined';

  return (
    <View style={styles.rail}>
      {JOURNEY.map((step, i) => {
        const done = !declined && i <= index;
        return (
          <View
            key={step}
            style={[
              styles.notch,
              // Le cran courant est plein, les précédents sont tenus : on voit
              // d'où ça vient sans que le passé crie aussi fort que le présent.
              done && { backgroundColor: i === index ? accent : withAlpha(accent, 0.45) },
              declined && styles.notchDeclined,
            ]}
          />
        );
      })}
    </View>
  );
}

function ProposalCard({ item, accent }: { item: Proposal; accent: string }) {
  const built = item.status === 'built';
  const declined = item.status === 'declined';
  // Identifiant de dégradé SVG : global au document, donc dérivé de la ligne.
  const edgeId = useMemo(() => `forge-edge-${item.id.slice(0, 8)}`, [item.id]);

  return (
    <View style={[styles.card, built && { borderColor: withAlpha(accent, 0.5) }]}>
      {built && <BuiltEdge accent={accent} id={edgeId} />}

      <View style={styles.cardHead}>
        <Text style={styles.cardTitle} numberOfLines={2}>
          {item.title}
        </Text>
        {built && item.reward_nf !== null && (
          // Le montant est frappé en monospace : c'est une valeur, pas une
          // phrase. La graisse et l'or ne servent qu'ici, dans tout l'écran.
          <Text style={styles.reward}>+{item.reward_nf} NF</Text>
        )}
      </View>

      <JourneyRail status={item.status} accent={accent} />

      <Text style={[styles.cardStatus, declined && { color: colors.textMuted }]}>
        {STATUS_LABELS[item.status]}
        <Text style={styles.cardHint}>{`  ·  ${STATUS_HINTS[item.status]}`}</Text>
      </Text>

      {!!item.staff_note && (
        <View style={[styles.note, { borderLeftColor: declined ? colors.border : accent }]}>
          <Text style={styles.noteText}>{item.staff_note}</Text>
        </View>
      )}
    </View>
  );
}

function BuiltRow({
  item,
  accent,
  last,
}: {
  item: BuiltProposal;
  accent: string;
  /** La dernière ligne ne porte pas de séparateur : il pendrait sous le bloc. */
  last?: boolean;
}) {
  return (
    <View style={[styles.builtRow, last && styles.builtRowLast]}>
      <View style={styles.builtDot} />
      <View style={styles.flex}>
        <Text style={styles.builtTitle} numberOfLines={1}>
          {item.title}
        </Text>
        {!!item.author?.username && (
          <Text style={styles.builtAuthor}>proposée par @{item.author.username}</Text>
        )}
      </View>
      {item.reward_nf !== null && (
        <Text style={[styles.reward, { color: accent }]}>+{item.reward_nf} NF</Text>
      )}
    </View>
  );
}

/** La feuille de rédaction. Glissé pris en charge par le hook maison. */
function ComposeSheet({
  accent,
  onClose,
  onSent,
}: {
  accent: string;
  onClose: () => void;
  onSent: () => void;
}) {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [area, setArea] = useState<ProposalArea>('feed');
  const [sending, setSending] = useState(false);

  const { gesture, sheetStyle, scrimStyle, open, close } = useSheetGesture({
    onClosed: onClose,
    travel: 420,
  });

  useEffect(() => {
    open();
  }, [open]);

  const titleOk = title.trim().length >= TITLE_MIN;
  const bodyOk = body.trim().length >= BODY_MIN;
  const ready = titleOk && bodyOk && !sending;

  const send = useCallback(async () => {
    if (!ready) return;
    setSending(true);
    const result = await forgeService.submitProposal({
      title: title.trim(),
      body: body.trim(),
      area,
    });
    setSending(false);
    if (!result.success) {
      toast.error(result.message || 'Envoi impossible');
      return;
    }
    toast.success('Idée envoyée', { description: 'Tu verras son avancement ici.' });
    onSent();
    close();
  }, [ready, title, body, area, onSent, close]);

  return (
    <View style={styles.sheetHost}>
      <Animated.View style={[styles.scrim, scrimStyle]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={() => close()} />
      </Animated.View>

      <GestureDetector gesture={gesture}>
        <Animated.View style={[styles.sheet, sheetStyle]}>
          <View style={styles.grabber} />
          {/* Pas de `KeyboardAvoidingView` ici : sans `flex`, il se dimensionne
              sur son contenu et se bat avec le `maxHeight` de la feuille — la
              zone de saisie finit repoussee hors de l'ecran des que le clavier
              monte. La liste decale ses propres encarts, ce qui donne le meme
              resultat avec une piece mobile en moins. */}
          <ScrollView
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            automaticallyAdjustKeyboardInsets
            contentContainerStyle={styles.sheetContent}
          >
              <Text style={styles.sheetTitle}>Ton idée</Text>

              <Text style={styles.label}>Ce que tu veux voir</Text>
              <TextInput
                style={styles.input}
                value={title}
                onChangeText={setTitle}
                placeholder="Ex. Des sondages dans les tweets"
                placeholderTextColor={colors.textMuted}
                maxLength={TITLE_MAX}
              />

              <Text style={styles.label}>Où, dans l’app</Text>
              <View style={styles.areaRow}>
                {AREAS.map((option) => {
                  const active = area === option.key;
                  return (
                    <Tappable
                      key={option.key}
                      haptic="select"
                      onPress={() => setArea(option.key)}
                      style={[
                        styles.areaChip,
                        active && { borderColor: accent, backgroundColor: withAlpha(accent, 0.14) },
                      ]}
                    >
                      <Ionicons
                        name={option.icon as any}
                        size={14}
                        color={active ? accent : colors.textSecondary}
                      />
                      <Text style={[styles.areaText, active && { color: colors.textPrimary }]}>
                        {option.label}
                      </Text>
                    </Tappable>
                  );
                })}
              </View>

              <Text style={styles.label}>Le problème que ça règle</Text>
              <TextInput
                style={styles.textarea}
                value={body}
                onChangeText={setBody}
                placeholder="Dis ce qui te manque aujourd’hui, et ce que tu ferais avec. C’est ce qui décide."
                placeholderTextColor={colors.textMuted}
                multiline
                maxLength={BODY_MAX}
              />
              {/* Le compteur dit ce qu'il MANQUE tant que le minimum n'est pas
                  atteint, puis ce qui reste. Un « 12/2000 » ne dit pas qu'on
                  est trop court. */}
              <Text style={styles.counter}>
                {bodyOk
                  ? `${BODY_MAX - body.trim().length} caractères restants`
                  : `encore ${BODY_MIN - body.trim().length} caractères`}
              </Text>

              <Tappable
                onPress={send}
                disabled={!ready}
                style={[styles.send, { backgroundColor: accent }, !ready && styles.sendOff]}
              >
                <Text style={styles.sendText}>{sending ? 'Envoi…' : 'Envoyer l’idée'}</Text>
              </Tappable>
          </ScrollView>
        </Animated.View>
      </GestureDetector>
    </View>
  );
}

export default function ForgeScreen({ navigation }: any) {
  const [mine, setMine] = useState<Proposal[]>([]);
  const [built, setBuilt] = useState<BuiltProposal[]>([]);
  const [stats, setStats] = useState<ForgeStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [composing, setComposing] = useState(false);

  const accent = colors.accent;

  const load = useCallback(async () => {
    const [mineRes, builtRes, statsRes] = await Promise.all([
      forgeService.fetchMine(),
      forgeService.fetchBuilt(),
      forgeService.fetchStats(),
    ]);
    if (mineRes.success) setMine(mineRes.data || []);
    if (builtRes.success) setBuilt(builtRes.data || []);
    if (statsRes.success) setStats(statsRes.data || null);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  /** Total déjà gagné. Ne s'affiche que s'il y a quelque chose à annoncer. */
  const earned = useMemo(
    () => mine.reduce((sum, p) => sum + (p.reward_paid && p.reward_nf ? p.reward_nf : 0), 0),
    [mine],
  );

  if (loading) {
    return (
      <ScreenBackground>
        <ScreenSkeleton variant="list" />
      </ScreenBackground>
    );
  }

  return (
    <ScreenBackground>
      <SafeAreaView style={styles.flex}>
        <StatusBar barStyle={statusBarStyle()} backgroundColor="transparent" translucent />

        <View style={styles.header}>
          <BackButton navigation={navigation} />
          <Text style={styles.headerTitle}>La Forge</Text>
          <View style={styles.headerSpacer} />
        </View>

        <ScrollView
          style={styles.flex}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          {/* La thèse de l'écran, dite une fois et sans emballage. */}
          <View style={styles.heroWrap}>
            <Ember accent={accent} />
            <Text style={styles.hero}>
              Tu proposes.{'\n'}On construit.{'\n'}
              <Text style={{ color: accent }}>On te paie.</Text>
            </Text>
          </View>
          <Text style={styles.heroBody}>
            Une fonctionnalité qui te manque ? Décris-la. Si on la construit, le staff décide
            d’une récompense en NF et elle arrive sur ton portefeuille.
          </Text>

          {earned > 0 && (
            <Text style={styles.earned}>
              Déjà gagné : <Text style={styles.earnedValue}>{earned} NF</Text>
            </Text>
          )}

          <Tappable
            onPress={() => setComposing(true)}
            style={[styles.cta, { backgroundColor: accent }]}
          >
            <Ionicons name="add" size={18} color="#FFFFFF" />
            <Text style={styles.ctaText}>Proposer une idée</Text>
          </Tappable>

          {/* L'état de la forge.
              La question que se pose vraiment quelqu'un devant cet écran
              n'est pas « comment je propose » mais « est-ce que ça paie ».
              Une grille tarifaire serait un engagement que personne n'a
              pris ; ce qui a déjà été versé ne promet rien et prouve tout. */}
          {!!stats && stats.built > 0 && (
            <View style={styles.stats}>
              <View style={styles.stat}>
                <Text style={styles.statValue}>{stats.total}</Text>
                <Text style={styles.statLabel}>déposées</Text>
              </View>
              <View style={styles.statSep} />
              <View style={styles.stat}>
                <Text style={styles.statValue}>{stats.built}</Text>
                <Text style={styles.statLabel}>construites</Text>
              </View>
              <View style={styles.statSep} />
              <View style={styles.stat}>
                <Text style={[styles.statValue, styles.statMoney]}>{stats.paid_nf}</Text>
                <Text style={styles.statLabel}>NF versés</Text>
              </View>
            </View>
          )}

          <Text style={styles.section}>Tes idées</Text>
          {mine.length === 0 ? (
            // Un écran vide est une invitation, pas un constat.
            <Text style={styles.empty}>
              Rien encore. La prochaine fois que l’app te frustre, c’est ici que ça se dit.
            </Text>
          ) : (
            mine.map((item) => <ProposalCard key={item.id} item={item} accent={accent} />)
          )}

          {/*
            Le déroulé, tant que la forge n'a rien construit.
            Une page qui ne peut encore rien PROUVER doit au moins EXPLIQUER :
            les quatre étapes disent le marché en entier — ce qui se passe
            après l'envoi, et où ça s'arrête. Dès qu'une idée est construite,
            la vitrine et les chiffres prennent le relais et ce bloc disparaît :
            on n'explique plus ce qu'on peut montrer.
          */}
          {(!stats || stats.built === 0) && (
            <>
              <Text style={styles.section}>Comment ça se passe</Text>
              <View style={styles.steps}>
                {JOURNEY.map((step, index) => (
                  <View key={step} style={styles.step}>
                    <View
                      style={[
                        styles.stepDot,
                        index === JOURNEY.length - 1 && { backgroundColor: accent },
                      ]}
                    />
                    <View style={styles.flex}>
                      <Text style={styles.stepTitle}>{STATUS_LABELS[step]}</Text>
                      <Text style={styles.stepHint}>{STATUS_HINTS[step]}</Text>
                    </View>
                  </View>
                ))}
              </View>
              <Text style={styles.stepsFoot}>
                Le montant n’est pas barémé : le staff le décide idée par idée, selon ce
                qu’elle apporte et ce qu’elle a demandé.
              </Text>
            </>
          )}

          {built.length > 0 && (
            <>
              <Text style={styles.section}>Déjà construites</Text>
              <Text style={styles.sectionHint}>
                Des idées d’utilisateurs, en ligne aujourd’hui.
              </Text>
              <View style={styles.builtBlock}>
                {built.map((item, index) => (
                  <BuiltRow
                    key={item.id}
                    item={item}
                    accent={accent}
                    last={index === built.length - 1}
                  />
                ))}
              </View>
            </>
          )}
        </ScrollView>

        {composing && (
          <ComposeSheet
            accent={accent}
            onClose={() => setComposing(false)}
            onSent={load}
          />
        )}
      </SafeAreaView>
    </ScreenBackground>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  headerTitle: { color: colors.textPrimary, fontSize: 17, fontFamily: fonts.display },
  headerSpacer: { width: 60 },

  content: { paddingHorizontal: 16, paddingTop: 20, paddingBottom: 40 },

  /**
   * La ligne d'ouverture. Trois propositions courtes sur trois lignes : c'est
   * un marché, et un marché se lit en trois temps. La couleur ne tombe que
   * sur le troisième — celui qui engage.
   */
  heroWrap: { position: 'relative' },
  /**
   * La boîte de la braise est BEAUCOUP plus grande que la lueur qu'elle
   * contient — c'est la marge qui permet au dégradé de s'éteindre avant les
   * bords, et donc de ne pas se voir découper (voir le commentaire du
   * dégradé). Elle descend nettement plus bas qu'elle ne monte : dans une
   * forge, le feu est sous le métal.
   */
  ember: { position: 'absolute', left: -80, right: -80, top: -40, bottom: -160 },
  hero: {
    color: colors.textPrimary,
    fontFamily: fonts.displayHeavy,
    fontSize: 32,
    lineHeight: 37,
    letterSpacing: -0.6,
  },

  stats: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 22,
    paddingVertical: 14,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  stat: { flex: 1, alignItems: 'center', gap: 3 },
  statSep: { width: StyleSheet.hairlineWidth, alignSelf: 'stretch', backgroundColor: colors.border },
  /** Chasse fixe : ce sont des valeurs, elles doivent s'aligner et se compter. */
  statValue: { color: colors.textPrimary, fontFamily: fonts.mono, fontSize: 17 },
  /** L'or reste réservé à l'argent, ici comme sur les cartes. */
  statMoney: { color: colors.gold },
  statLabel: { color: colors.textMuted, fontSize: 11, fontFamily: fonts.medium },

  steps: {
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: 16,
    gap: 16,
  },
  step: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  stepDot: { width: 7, height: 7, borderRadius: 4, marginTop: 5, backgroundColor: colors.border },
  stepTitle: { color: colors.textPrimary, fontSize: 13.5, fontFamily: fonts.semibold },
  stepHint: { color: colors.textMuted, fontSize: 12.5, lineHeight: 18, marginTop: 2 },
  /** Dit une fois ce que l'écran ne promettra jamais : un barème. */
  stepsFoot: {
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 18,
    marginTop: 12,
    paddingHorizontal: 2,
  },
  heroBody: {
    color: colors.textSecondary,
    fontFamily: fonts.regular,
    fontSize: 14,
    lineHeight: 21,
    marginTop: 12,
  },
  earned: { color: colors.textSecondary, fontSize: 13, fontFamily: fonts.medium, marginTop: 14 },
  earnedValue: { color: colors.gold, fontFamily: fonts.mono },

  cta: {
    marginTop: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 14,
    paddingVertical: 14,
  },
  ctaText: { color: '#FFFFFF', fontSize: 15, fontFamily: fonts.bold },

  section: {
    color: colors.textPrimary,
    fontSize: 15,
    fontFamily: fonts.semibold,
    marginTop: 30,
    marginBottom: 10,
  },
  sectionHint: { color: colors.textMuted, fontSize: 12, marginTop: -6, marginBottom: 12 },
  empty: { color: colors.textMuted, fontSize: 13, lineHeight: 20 },

  card: {
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: 16,
    paddingLeft: 19,
    marginBottom: 12,
    overflow: 'hidden',
  },
  /** Le liseré vif de la carte construite, sur son flanc gauche. */
  builtEdge: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 3 },

  cardHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  cardTitle: {
    flex: 1,
    color: colors.textPrimary,
    fontSize: 15,
    lineHeight: 21,
    fontFamily: fonts.semibold,
  },
  /** La seule occurrence d'or de l'écran : une valeur frappée. */
  reward: { color: colors.gold, fontFamily: fonts.mono, fontSize: 13 },

  rail: { flexDirection: 'row', gap: 4, marginTop: 14 },
  /**
   * Le cran éteint prend `colors.border` — qui vaut déjà exactement les deux
   * gris voulus, un par thème. Le calculer ici avec `isDarkTheme()` aurait
   * fige la valeur au chargement du module, alors que `StyleSheet.create`
   * s'évalue à l'import : un jeton du thème est la seule forme sûre.
   */
  notch: { flex: 1, height: 3, borderRadius: 2, backgroundColor: colors.border },
  notchDeclined: { backgroundColor: 'transparent' },

  cardStatus: {
    marginTop: 10,
    color: colors.textPrimary,
    fontSize: 12.5,
    fontFamily: fonts.semibold,
  },
  cardHint: { color: colors.textMuted, fontFamily: fonts.regular },

  note: { marginTop: 12, paddingLeft: 10, borderLeftWidth: 2 },
  noteText: { color: colors.textSecondary, fontSize: 13, lineHeight: 19 },

  builtBlock: {
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: 14,
  },
  builtRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 13,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: withAlpha(colors.border, 0.6),
  },
  builtRowLast: { borderBottomWidth: 0 },
  builtDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.gold },
  builtTitle: { color: colors.textPrimary, fontSize: 14, fontFamily: fonts.medium },
  builtAuthor: { color: colors.textMuted, fontSize: 12, marginTop: 2 },

  sheetHost: { ...StyleSheet.absoluteFillObject, justifyContent: 'flex-end' },
  scrim: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.55)' },
  sheet: {
    backgroundColor: colors.bgElevated,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    maxHeight: '88%',
  },
  grabber: {
    alignSelf: 'center',
    width: 38,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    marginTop: 10,
  },
  sheetContent: { padding: 18, paddingBottom: 30 },
  sheetTitle: {
    color: colors.textPrimary,
    fontSize: 19,
    fontFamily: fonts.display,
    marginBottom: 18,
  },

  label: {
    color: colors.textSecondary,
    fontSize: 12.5,
    fontFamily: fonts.semibold,
    marginBottom: 8,
    marginTop: 16,
  },
  input: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: colors.textPrimary,
    fontSize: 14,
  },
  textarea: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    padding: 14,
    color: colors.textPrimary,
    fontSize: 14,
    minHeight: 120,
    textAlignVertical: 'top',
  },
  counter: { color: colors.textMuted, fontSize: 11, textAlign: 'right', marginTop: 6 },

  areaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  areaChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  areaText: { color: colors.textSecondary, fontSize: 13, fontFamily: fonts.medium },

  send: { marginTop: 24, borderRadius: 14, paddingVertical: 14, alignItems: 'center' },
  sendOff: { opacity: 0.45 },
  sendText: { color: '#FFFFFF', fontSize: 15, fontFamily: fonts.bold },
});
