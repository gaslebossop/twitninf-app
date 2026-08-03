import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import Constants from 'expo-constants';
import { colors, fonts } from '../theme';
import ReviewTutorial, { markTutorialSeen, tutorialSeen } from '../components/ReviewTutorial';
import {
  communityReviewService,
  ReviewIneligibility,
  ReviewItem,
  ReviewStats,
  ReviewVerdict,
} from '../services/communityReviewService';
import { ScreenSkeleton } from '../components/ui';

/**
 * Revue communautaire — BÊTA.
 *
 * Un contenu signalé est réécrit par un modèle (prénoms, pseudos, lieux et
 * coordonnées remplacés) puis confié à un jury de trois personnes tirées au
 * sort. Le juré ne voit ni l'auteur, ni le tweet d'origine, ni qui a signalé :
 * il n'a que le texte. C'est délibéré — savoir QUI a écrit change le jugement,
 * et rendrait l'outil utilisable pour du harcèlement ciblé.
 *
 * ⚠ CET ÉCRAN N'AFFICHE RIEN DE CE QUE PENSENT LES AUTRES. Pas de motifs de
 * signalement, pas de décompte de voix, pas de seuil, et surtout pas l'issue du
 * vote : le juré ne saura jamais si le compte a été suspendu. Un décompte
 * visible produit du suivisme, un motif affiché est une consigne déguisée, et
 * savoir qu'un bannissement est au bout fait hésiter sur des textes qui ne le
 * méritent pas. Le serveur ne renvoie d'ailleurs plus ces champs.
 *
 * Miroir de la page Windows (`twitninf-windows/src/pages/ReviewPage.tsx`) :
 * mêmes règles affichées, même didacticiel, mêmes deux issues. Les différences
 * sont d'idiome (blocs pleins et non du verre, boutons empilés et non côte à
 * côte), jamais de fond.
 */

const RULES = [
  'Insultes, harcèlement ou menaces visant une personne',
  "Haine ou mépris fondés sur l'origine, la religion, le genre ou l'orientation",
  'Contenu sexuel explicite, ou impliquant des mineurs',
  'Violence explicite, ou apologie de la violence',
  "Divulgation d'informations privées sur quelqu'un",
  "Spam, arnaque ou usurpation d'identité",
];

/** Ce qu'on dit à quelqu'un qui n'a pas le droit de siéger. */
const INELIGIBLE_LABEL: Record<ReviewIneligibility, string> = {
  compte_trop_recent: 'Votre compte est trop récent pour siéger dans un jury. Revenez dans quelques jours.',
  compte_inactif: 'Votre compte ne peut pas participer à la revue pour le moment.',
  compte_introuvable: 'Votre compte est introuvable. Reconnectez-vous.',
};

const SWAP_MS = 190;

interface Props {
  navigation: any;
}

const CommunityReviewScreen: React.FC<Props> = ({ navigation }) => {
  const [item, setItem] = useState<ReviewItem | null>(null);
  const [stats, setStats] = useState<ReviewStats | null>(null);
  const [ineligible, setIneligible] = useState<ReviewIneligibility | null>(null);
  const [loading, setLoading] = useState(true);
  const [voting, setVoting] = useState(false);
  const [error, setError] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [showTutorial, setShowTutorial] = useState(false);

  const swap = useRef(new Animated.Value(1)).current;
  const toast = useRef(new Animated.Value(0)).current;
  const confirmTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /* Doublon du state `voting` sous forme de ref : l'effet de focus est
     mémoïsé sur `load` seul, il ne verrait jamais la valeur à jour du state. */
  const votingRef = useRef(false);

  /**
   * Hauteur réelle de la barre d'état, appareil par appareil.
   *
   * L'écran dessine SOUS la barre d'état (`StatusBar translucent`, et en onglet
   * il n'y a aucun en-tête de navigateur au-dessus) : sans cette marge, le titre
   * et les boutons passent derrière l'heure et le niveau de batterie, et
   * deviennent illisibles — voire intouchables sur les téléphones à encoche.
   *
   * `StatusBar.currentHeight` ne renvoie rien sur iOS, et une constante par
   * plateforme se trompe forcément : 20 px sur un iPhone SE, 59 px sur un 14
   * Pro. `Constants.statusBarHeight` (expo-constants) donne la vraie valeur des
   * deux côtés — et on ne peut pas utiliser `useSafeAreaInsets` ici, il n'y a
   * pas de `SafeAreaProvider` dans cette app.
   */
  const topInset = Constants.statusBarHeight || (Platform.OS === 'ios' ? 44 : StatusBar.currentHeight || 24);
  const headerPaddingTop = topInset + 10;
  /** Faux quand l'écran est monté comme onglet : il n'y a rien derrière.
   * `canGoBack()` seul remonte jusqu'à un navigateur PARENT et peut renvoyer
   * vrai à tort dans ce cas — seul le type du navigateur qui possède CET
   * écran fait foi (voir components/ui/BackButton). */
  const isTabScreen = navigation?.getState?.()?.type === 'tab';
  const canGoBack = !isTabScreen && typeof navigation?.canGoBack === 'function' && navigation.canGoBack();

  /* Le didacticiel est lu au montage, pas à chaque rendu : le faire disparaître
     en pleine lecture parce qu'un autre écran a écrit le drapeau serait pire
     que de le remontrer une fois.
     ⚠ L'écran étant aussi un ONGLET, ce montage n'a lieu qu'au premier affichage
     de l'onglet (les onglets sont montés paresseusement) : le didacticiel ne
     surgit donc pas au lancement de l'app devant quelqu'un qui n'a jamais
     ouvert la revue. */
  useEffect(() => {
    let cancelled = false;
    tutorialSeen().then((seen) => { if (!cancelled && !seen) setShowTutorial(true); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => () => { if (confirmTimer.current) clearTimeout(confirmTimer.current); }, []);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError('');

    const next = await communityReviewService.next();
    setItem(next.item);
    setStats(next.stats);
    setIneligible(next.ineligible);
    if (next.error) setError(next.error);

    setLoading(false);
    Animated.timing(swap, { toValue: 1, duration: 220, useNativeDriver: true }).start();
  }, [swap]);

  /* Rechargement à chaque FOCUS, et pas seulement au montage : en onglet,
     l'écran reste monté une fois visité. Sans ça, quelqu'un qui revient sur
     l'onglet une heure plus tard retrouverait le contenu d'il y a une heure —
     éventuellement déjà tranché par les deux autres jurés.
     L'appel est idempotent côté serveur : tant qu'on n'a pas voté, il renvoie
     le contenu qu'on a déjà en main, il n'en consomme pas un de plus. */
  useFocusEffect(
    useCallback(() => {
      // Un aller-retour d'écran pendant l'envoi ne doit pas écraser la carte
      // en cours de bascule.
      if (!votingRef.current) void load(true);
    }, [load]),
  );

  const closeTutorial = useCallback(() => {
    void markTutorialSeen();
    setShowTutorial(false);
  }, []);

  const flashConfirmation = useCallback(() => {
    setConfirmed(true);
    Animated.timing(toast, { toValue: 1, duration: 180, useNativeDriver: true }).start();
    if (confirmTimer.current) clearTimeout(confirmTimer.current);
    confirmTimer.current = setTimeout(() => {
      Animated.timing(toast, { toValue: 0, duration: 200, useNativeDriver: true })
        .start(() => setConfirmed(false));
    }, 1600);
  }, [toast]);

  /**
   * Un seul chemin de vote pour les deux verdicts : ils ne diffèrent que par la
   * valeur envoyée, et c'est le point — « ne respecte pas » n'est plus un
   * parcours à part avec son formulaire de gravité.
   */
  const vote = useCallback(async (verdict: ReviewVerdict) => {
    if (!item || voting) return;
    votingRef.current = true;
    setVoting(true);
    setError('');

    // La carte sortante s'efface AVANT que la suivante entre : sans ce temps
    // mort, le texte change sous les yeux du juré pendant qu'il relit le sien.
    Animated.timing(swap, { toValue: 0, duration: SWAP_MS, useNativeDriver: true }).start();

    const result = await communityReviewService.vote(item.id, verdict);
    if (result.ok) flashConfirmation();
    // `stale` = le jury a conclu sans nous, ou la place a expiré. Ce n'est pas
    // une panne : on enchaîne sans rien dire.
    else if (!result.stale && result.message) setError(result.message);

    await new Promise((resolve) => setTimeout(resolve, SWAP_MS));
    await load(true);
    votingRef.current = false;
    setVoting(false);
  }, [item, voting, swap, load, flashConfirmation]);

  const renderBody = () => {
    if (loading) {
      return (
        <ScreenSkeleton variant="detail" />
      );
    }

    if (ineligible) {
      return (
        <View style={styles.blank}>
          <Ionicons name="time-outline" size={26} color={colors.textMuted} />
          <Text style={styles.blankTitle}>Pas encore</Text>
          <Text style={styles.blankText}>{INELIGIBLE_LABEL[ineligible]}</Text>
        </View>
      );
    }

    if (!item) {
      return (
        <View style={styles.blank}>
          <Ionicons name="shield-checkmark-outline" size={26} color={colors.textMuted} />
          <Text style={styles.blankTitle}>Rien à juger</Text>
          <Text style={styles.blankText}>
            Aucun contenu ne vous est confié pour le moment. Repassez plus tard.
          </Text>
        </View>
      );
    }

    return (
      <Animated.View
        style={{
          opacity: swap,
          transform: [{ translateY: swap.interpolate({ inputRange: [0, 1], outputRange: [-8, 0] }) }],
        }}
      >
        <View style={styles.card}>
          {/* Pastilles de provenance — des FAITS sur le texte (il a été réécrit,
              des passages sont masqués, un média existe), jamais un motif de
              signalement. D'où le gris : rien ici ne doit crier. */}
          <View style={styles.chips}>
            <View style={[styles.chip, styles.chipAnon]}>
              <Ionicons name="eye-off-outline" size={11} color={colors.cyan} />
              <Text style={[styles.chipText, { color: colors.cyan }]}>Anonymisé</Text>
            </View>
            {item.redactions > 0 && (
              <View style={styles.chip}>
                <Text style={styles.chipText}>
                  {item.redactions} élément{item.redactions > 1 ? 's' : ''} masqué
                  {item.redactions > 1 ? 's' : ''}
                </Text>
              </View>
            )}
            {item.had_media && (
              <View style={styles.chip}>
                <Ionicons name="image-outline" size={11} color={colors.textMuted} />
                <Text style={styles.chipText}>Média non affiché</Text>
              </View>
            )}
          </View>

          <Text style={styles.content}>{item.content}</Text>
        </View>

        <View style={styles.rules}>
          <Text style={styles.rulesTitle}>Ce message enfreint-il l'une de ces règles ?</Text>
          {RULES.map((rule) => (
            <View key={rule} style={styles.ruleRow}>
              <View style={styles.ruleBullet} />
              <Text style={styles.ruleText}>{rule}</Text>
            </View>
          ))}
        </View>

        {/* Même taille, même poids : la mise en forme ne penche pas d'un côté.
            Empilés plutôt que côte à côte — « Ne les respecte pas » ne tient pas
            sur une demi-largeur de téléphone sans se couper. */}
        <View style={styles.actions}>
          <TouchableOpacity
            style={[styles.btn, styles.btnOk, voting && styles.btnOff]}
            onPress={() => vote('compliant')}
            disabled={voting}
            activeOpacity={0.85}
          >
            <View style={[styles.btnIcon, { backgroundColor: colors.successMuted }]}>
              <Ionicons name="checkmark" size={17} color={colors.success} />
            </View>
            <Text style={[styles.btnText, { color: colors.success }]}>Respecte les règles</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.btn, styles.btnKo, voting && styles.btnOff]}
            onPress={() => vote('violation')}
            disabled={voting}
            activeOpacity={0.85}
          >
            <View style={[styles.btnIcon, { backgroundColor: colors.accentMuted }]}>
              <Ionicons name="close" size={17} color={colors.accentBright} />
            </View>
            <Text style={[styles.btnText, { color: colors.accentBright }]}>Ne les respecte pas</Text>
          </TouchableOpacity>
        </View>
      </Animated.View>
    );
  };

  return (
    <View style={styles.screen}>
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />

      <View style={[styles.header, { paddingTop: headerPaddingTop }]}>
        {/* L'écran sert à la fois d'onglet de la tab bar et d'écran empilé
            (réglages → Revue). En onglet il n'y a rien derrière : une flèche de
            retour y serait un bouton qui ne fait rien. On garde la place vide
            pour que le titre reste centré dans les deux cas. */}
        {canGoBack ? (
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.headerBtn} activeOpacity={0.7}>
            <Ionicons name="chevron-back" size={28} color={colors.textPrimary} />
          </TouchableOpacity>
        ) : (
          <View style={styles.headerBtn} />
        )}

        <View style={styles.headerTitleBox}>
          <View style={styles.headerTitleRow}>
            <Text style={styles.headerTitle}>Revue communautaire</Text>
            <View style={styles.betaTag}><Text style={styles.betaText}>BÊTA</Text></View>
          </View>
          <Text style={styles.headerSub}>Un texte anonymisé, une question</Text>
        </View>

        {/* Le didacticiel ne s'ouvre qu'une fois tout seul ; ce bouton est le
            seul moyen de le revoir. */}
        <TouchableOpacity onPress={() => setShowTutorial(true)} style={styles.headerBtn} activeOpacity={0.7}>
          <Ionicons name="help-circle-outline" size={22} color={colors.textMuted} />
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.notice}>
          <Ionicons name="shield-checkmark-outline" size={15} color={colors.cyan} />
          <Text style={styles.noticeText}>
            Ce texte a été réécrit automatiquement : prénoms, pseudos, lieux et coordonnées ont été
            remplacés. Vous ne savez pas qui l'a écrit, et vous ne saurez pas ce que d'autres en ont
            pensé — <Text style={styles.noticeStrong}>c'est ce qui rend votre avis utile</Text>.
          </Text>
        </View>

        {stats && (
          <View style={styles.tally}>
            <Text style={styles.tallyText}>
              <Text style={styles.tallyNum}>{stats.my_votes}</Text> avis rendus
            </Text>
            <View style={styles.tallySep} />
            <Text style={styles.tallyText}>
              <Text style={styles.tallyNum}>{stats.open}</Text> en attente
            </Text>
          </View>
        )}

        {!!error && (
          <View style={styles.error}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        {renderBody()}
      </ScrollView>

      {/* Confirmation strictement neutre : « enregistré », jamais ce qui en
          découle. Annoncer une suppression ou une suspension apprendrait au juré
          le poids de son clic, et le vote suivant s'en ressentirait. */}
      {confirmed && (
        <Animated.View
          style={[
            styles.toast,
            {
              opacity: toast,
              transform: [{ translateY: toast.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }],
            },
          ]}
          pointerEvents="none"
        >
          <Ionicons name="checkmark" size={14} color={colors.success} />
          <Text style={styles.toastText}>Avis enregistré</Text>
        </Animated.View>
      )}

      <ReviewTutorial visible={showTutorial} onDone={closeTutorial} />
    </View>
  );
};

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 6,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  headerBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitleBox: { flex: 1, alignItems: 'center' },
  headerTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  headerTitle: { color: colors.textPrimary, fontSize: 16, fontFamily: fonts.heading },
  betaTag: {
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 5,
    backgroundColor: colors.accentMuted,
  },
  betaText: { color: colors.accentBright, fontSize: 8.5, fontFamily: fonts.bold, letterSpacing: 0.5 },
  headerSub: { color: colors.textMuted, fontSize: 11.5, fontFamily: fonts.regular, marginTop: 2 },

  scroll: { flex: 1 },
  // La tab bar absolue de l'app recouvre le bas des écrans : sans cette marge,
  // le dernier bouton passe dessous et devient intouchable.
  scrollContent: { paddingHorizontal: 16, paddingTop: 14, paddingBottom: 110 },

  notice: {
    flexDirection: 'row',
    gap: 9,
    padding: 12,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  noticeText: { flex: 1, color: colors.textSecondary, fontSize: 12, fontFamily: fonts.regular, lineHeight: 19 },
  noticeStrong: { color: colors.textPrimary, fontFamily: fonts.semibold },

  tally: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 12, marginBottom: 2 },
  tallyText: { color: colors.textMuted, fontSize: 11.5, fontFamily: fonts.regular },
  tallyNum: { color: colors.textSecondary, fontFamily: fonts.semibold },
  tallySep: { width: 1, height: 10, backgroundColor: colors.border },

  error: {
    marginTop: 12,
    padding: 11,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.redMuted,
    backgroundColor: colors.redMuted,
  },
  errorText: { color: colors.red, fontSize: 12.5, fontFamily: fonts.medium },

  card: {
    marginTop: 14,
    padding: 18,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 14 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.surfaceAlt,
  },
  chipAnon: { borderColor: colors.cyanMuted, backgroundColor: colors.cyanSoft },
  chipText: { color: colors.textMuted, fontSize: 10.5, fontFamily: fonts.semibold },
  content: { color: colors.textPrimary, fontSize: 16, fontFamily: fonts.regular, lineHeight: 25 },

  rules: {
    marginTop: 14,
    padding: 15,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  rulesTitle: { color: colors.textPrimary, fontSize: 13, fontFamily: fonts.semibold, marginBottom: 11 },
  ruleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 9, marginBottom: 6 },
  ruleBullet: {
    width: 4,
    height: 4,
    borderRadius: 2,
    marginTop: 7,
    backgroundColor: colors.borderStrong,
  },
  ruleText: { flex: 1, color: colors.textSecondary, fontSize: 12.5, fontFamily: fonts.regular, lineHeight: 19 },

  actions: { marginTop: 16, gap: 10 },
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    height: 54,
    paddingHorizontal: 16,
    borderRadius: 15,
    borderWidth: StyleSheet.hairlineWidth,
  },
  btnOk: { borderColor: colors.successMuted, backgroundColor: colors.successMuted },
  btnKo: { borderColor: colors.accentMuted, backgroundColor: colors.accentSoft },
  btnOff: { opacity: 0.45 },
  btnIcon: { width: 28, height: 28, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  btnText: { fontSize: 14.5, fontFamily: fonts.semibold },

  blank: { alignItems: 'center', gap: 9, paddingVertical: 70, paddingHorizontal: 20 },
  blankTitle: { color: colors.textPrimary, fontSize: 15, fontFamily: fonts.heading },
  blankText: {
    color: colors.textSecondary,
    fontSize: 12.5,
    fontFamily: fonts.regular,
    lineHeight: 20,
    textAlign: 'center',
  },

  toast: {
    position: 'absolute',
    bottom: 34,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 15,
    paddingVertical: 9,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.successMuted,
    backgroundColor: colors.surfaceElevated,
  },
  toastText: { color: colors.success, fontSize: 12.5, fontFamily: fonts.semibold },
});

export default CommunityReviewScreen;
