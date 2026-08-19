/**
 * Retour tactile de l'app.
 *
 * ── Pourquoi `expo-haptics` et plus `Vibration` ──────────────────────────
 * Tout passait par `Vibration` du coeur de React Native, avec deux défauts
 * qu'aucun réglage ne pouvait corriger :
 *
 *  1. **iOS n'y a qu'une seule intensité**, celle du vibreur système
 *     (~400 ms perçue). Un « tap » léger était impossible à imiter : sur un
 *     geste aussi fréquent qu'un like, ça secouait le téléphone. La seule
 *     issue était de se taire sur iOS — donc aucun retour du tout.
 *  2. **`Vibration` est coupé par l'interrupteur Sonnerie/Silencieux.**
 *     C'est ce qui faisait que « le vibreur ne fonctionne qu'en mode
 *     sonnerie ». Ce n'est pas un bug de l'app : iOS refuse de jouer le
 *     vibreur système en silencieux.
 *
 * Le Taptic Engine (`expo-haptics`) répond aux deux : plusieurs intensités
 * réelles, et il joue quel que soit l'interrupteur — c'est ce qu'utilisent les
 * vraies apps pour le pull-to-refresh, le like, la sélection.
 *
 * ── Repli ────────────────────────────────────────────────────────────────
 * Le module est chargé en `require` GARDÉ, jamais en import statique : sur un
 * runtime qui ne l'embarque pas (vieux build sideloadé, Expo Go dépareillé),
 * un import statique planterait l'app AU DÉMARRAGE. Ici on retombe
 * silencieusement sur `Vibration`, avec l'ancien comportement.
 *
 * Android garde `Vibration` de bout en bout : il lit les durées d'un motif
 * (`[attente, vibre, ...]` en ms) et sait donc déjà faire léger.
 */
import { Platform, Vibration } from 'react-native';

let enabled = true;

/** Coupe/rallume tout le retour tactile (branché sur les réglages). */
export function setHapticsEnabled(value: boolean) {
  enabled = value;
}

export function areHapticsEnabled() {
  return enabled;
}

const isIOS = Platform.OS === 'ios';

/**
 * Chargement gardé — voir l'en-tête. `null` = on retombe sur `Vibration`.
 */
let Haptics: typeof import('expo-haptics') | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  Haptics = require('expo-haptics');
} catch {
  Haptics = null;
}

type ImpactKind = 'light' | 'medium' | 'heavy';
type NotifyKind = 'success' | 'warning' | 'error';

function impact(kind: ImpactKind) {
  if (!Haptics) return false;
  const style =
    kind === 'light'
      ? Haptics.ImpactFeedbackStyle.Light
      : kind === 'medium'
        ? Haptics.ImpactFeedbackStyle.Medium
        : Haptics.ImpactFeedbackStyle.Heavy;
  // `void` : ces promesses ne sont jamais attendues — un retour tactile ne
  // doit pas retarder l'action qu'il accompagne, ni la faire échouer.
  void Haptics.impactAsync(style).catch(() => {});
  return true;
}

function notify(kind: NotifyKind) {
  if (!Haptics) return false;
  const type =
    kind === 'success'
      ? Haptics.NotificationFeedbackType.Success
      : kind === 'warning'
        ? Haptics.NotificationFeedbackType.Warning
        : Haptics.NotificationFeedbackType.Error;
  void Haptics.notificationAsync(type).catch(() => {});
  return true;
}

/**
 * @param androidPattern motif `Vibration` (Android, et repli iOS sans Taptic).
 * @param taptic ce qu'on joue sur le Taptic Engine quand il est disponible.
 * @param iosFallbackPulses nombre de secousses système si le Taptic manque.
 *   `0` = muet, l'ancien comportement pour les gestes ordinaires.
 */
function play(
  androidPattern: number[],
  taptic: (() => boolean) | null,
  iosFallbackPulses: number,
) {
  if (!enabled) return;
  try {
    if (isIOS) {
      if (taptic && taptic()) return;
      // Pas de Taptic : on retombe sur l'ancienne règle — plutôt muet que de
      // faire trembler le téléphone pour un appui ordinaire.
      if (iosFallbackPulses <= 0) return;
      if (iosFallbackPulses === 1) {
        Vibration.vibrate();
        return;
      }
      Vibration.vibrate(
        Array.from({ length: iosFallbackPulses * 2 }, (_, i) => (i === 0 ? 0 : 90)),
      );
      return;
    }
    Vibration.vibrate(androidPattern, false);
  } catch {
    // Un appareil sans moteur de vibration ne doit jamais faire tomber l'action.
  }
}

/** Appui ordinaire : bouton, onglet, sélection. */
export function tapFeedback() {
  play([0, 10], () => impact('light'), 0);
}

/** Appui appuyé : appui long, glissement validé, bascule d'un réglage. */
export function selectFeedback() {
  play([0, 18], () => impact('medium'), 0);
}

/** L'action a abouti : publication, achat, envoi. */
export function successFeedback() {
  play([0, 16, 55, 26], () => notify('success'), 2);
}

/** L'action a échoué côté serveur ou réseau. */
export function errorFeedback() {
  play([0, 32, 70, 32, 70, 32], () => notify('error'), 3);
}

/** L'action est refusée d'avance : solde insuffisant, champ vide, verrou. */
export function refuseFeedback() {
  play([0, 45], () => notify('warning'), 1);
}

/**
 * Cœur ou repost posé depuis le fil.
 *
 * Impact LÉGER, comme dans les vraies apps : le fil « 2B » remonte
 * l'engagement dans une gouttière où le doigt masque l'icône qu'il touche,
 * donc sans ce retour on ne sait pas si le geste est passé. C'est précisément
 * le cas que `Vibration` ne savait pas servir — sa seule intensité était bien
 * trop lourde pour un geste aussi fréquent, d'où le silence sur iOS jusqu'ici.
 */
export function likeFeedback() {
  play([0, 22], () => impact('light'), 0);
}

/**
 * Le seuil du tiré-pour-actualiser vient d'être franchi.
 *
 * Impact MOYEN, joué PENDANT la traction et non au relâchement : c'est ce que
 * font les vraies listes iOS, et c'est tout l'intérêt — la secousse dit
 * « lâche maintenant, ça va se recharger » au moment où c'est encore
 * actionnable. La jouer au relâchement n'apprendrait plus rien.
 */
export function pullThresholdFeedback() {
  play([0, 20], () => impact('medium'), 0);
}

/** Un gain vient de tomber (casino, quête, récompense). */
export function rewardFeedback() {
  play([0, 14, 40, 14, 40, 40], () => notify('success'), 3);
}

export const feedback = {
  tap: tapFeedback,
  like: likeFeedback,
  select: selectFeedback,
  success: successFeedback,
  error: errorFeedback,
  refuse: refuseFeedback,
  reward: rewardFeedback,
  pullThreshold: pullThresholdFeedback,
};

export default feedback;
