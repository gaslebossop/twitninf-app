import { FadeIn, FadeInDown } from 'react-native-reanimated';
import { isReduceMotionEnabled } from '../../hooks/useReduceMotion';
import { duration } from '../../theme/motion';

/**
 * Les entrées de la page d'événement.
 *
 * ── Pourquoi ici on anime au montage, alors que l'app ne le fait jamais ───
 * Le vocabulaire de mouvement de twitninf pose une règle nette : « rien ne
 * s'anime au montage », parce qu'un écran qui se dévoile en fondu est un écran
 * qu'on attend. Elle vaut pour le fil, les réglages, un profil — tout ce qu'on
 * ouvre pour LIRE.
 *
 * Une page de fête est le cas où l'exception se justifie : on ne l'ouvre pas
 * pour consulter une information urgente, on l'ouvre pour regarder ce qu'on a
 * gagné. Le déroulé des cartes fait partie du plaisir, comme on découvre des
 * cadeaux les uns après les autres.
 *
 * L'exception reste tenue par trois garde-fous :
 *
 * 1. **Court** — 220 ms, dans la fourchette du vocabulaire (120-280 ms).
 * 2. **Décalage plafonné.** 40 ms par carte, mais jamais au-delà de 240 ms :
 *    sans plafond, la onzième carte apparaîtrait 440 ms après la première, et
 *    l'attente deviendrait mesurable. Au-delà du sixième rang, tout arrive
 *    ensemble.
 * 3. **Coupé net si « Réduire les animations » est actif.** Le réglage est
 *    coché par des gens à qui le mouvement donne la nausée ; une page qu'ils
 *    ouvrent tous les jours pendant huit jours est le dernier endroit où
 *    l'ignorer.
 */

const STAGGER_MS = 40;
/** Six rangs suffisent : au-delà, l'attente se voit plus que l'effet. */
const MAX_STAGGER_MS = STAGGER_MS * 6;

/**
 * Entrée d'un élément de liste : monte de quelques pixels en apparaissant.
 *
 * @param index rang dans la liste, pour le décalage.
 */
export function enterItem(index: number) {
  if (isReduceMotionEnabled()) return undefined;
  const delay = Math.min(index * STAGGER_MS, MAX_STAGGER_MS);
  return FadeInDown.duration(duration.base).delay(delay).springify().damping(22);
}

/**
 * Entrée d'un panneau entier, au changement d'onglet.
 *
 * Fondu seul, sans déplacement : le contenu change mais le cadre reste, et
 * faire glisser tout le panneau donnerait l'impression d'avoir navigué
 * ailleurs alors qu'on est sur la même page.
 */
export function enterPanel() {
  if (isReduceMotionEnabled()) return undefined;
  return FadeIn.duration(duration.fast);
}
