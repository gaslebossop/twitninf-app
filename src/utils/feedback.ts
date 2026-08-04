/**
 * Retour tactile de l'app.
 *
 * `expo-haptics` n'est pas installé (et l'ajouter imposerait un rebuild natif) :
 * tout passe par `Vibration` du coeur de React Native. Les deux plateformes ne
 * lisent pas un motif de la même façon, et c'est la seule subtilité à retenir :
 *
 *  - Android lit les durées : `[attente, vibre, attente, vibre, ...]` en ms.
 *  - iOS n'en lit QUE le rythme — chaque entrée déclenche une secousse
 *    d'intensité fixe (~400 ms perçue). Un « tap » léger y est donc impossible
 *    à imiter : mieux vaut ne rien jouer que de faire trembler le téléphone
 *    pour un simple appui.
 *
 * D'où la règle appliquée ici : sur iOS on ne vibre que pour ce qui compte
 * vraiment (un gain, un échec, un refus), jamais pour un appui ordinaire.
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

function play(androidPattern: number[], iosPulses: number) {
  if (!enabled) return;
  try {
    if (isIOS) {
      if (iosPulses <= 0) return;
      // Sur iOS le tableau est une suite de délais ; sa longueur fait le
      // nombre de secousses. On construit donc un motif de `iosPulses` temps.
      if (iosPulses === 1) {
        Vibration.vibrate();
        return;
      }
      Vibration.vibrate(Array.from({ length: iosPulses * 2 }, (_, i) => (i === 0 ? 0 : 90)));
      return;
    }
    Vibration.vibrate(androidPattern, false);
  } catch {
    // Un appareil sans moteur de vibration ne doit jamais faire tomber l'action.
  }
}

/** Appui ordinaire : bouton, onglet, sélection. Muet sur iOS (voir en-tête). */
export function tapFeedback() {
  play([0, 10], 0);
}

/** Appui appuyé : appui long, glissement validé, bascule d'un réglage. */
export function selectFeedback() {
  play([0, 18], 0);
}

/** L'action a abouti : publication, achat, envoi. */
export function successFeedback() {
  play([0, 16, 55, 26], 2);
}

/** L'action a échoué côté serveur ou réseau. */
export function errorFeedback() {
  play([0, 32, 70, 32, 70, 32], 3);
}

/** L'action est refusée d'avance : solde insuffisant, champ vide, verrou. */
export function refuseFeedback() {
  play([0, 45], 1);
}

/** Un gain vient de tomber (casino, quête, récompense). */
export function rewardFeedback() {
  play([0, 14, 40, 14, 40, 40], 3);
}

export const feedback = {
  tap: tapFeedback,
  select: selectFeedback,
  success: successFeedback,
  error: errorFeedback,
  refuse: refuseFeedback,
  reward: rewardFeedback,
};

export default feedback;
