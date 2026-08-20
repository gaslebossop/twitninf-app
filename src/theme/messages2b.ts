/**
 * 🧪 Surfaces propres aux écrans MESSAGES du test « 2B — Gouttière ».
 *
 * ── Pourquoi un fichier à part, et pas deux valeurs dans `paper2b.ts` ──
 * `paper.bg` et `paper.bgBand` sont des alias de `colors.bg`/`colors.surface` :
 * le fond du test est, volontairement, celui de l'app. Les changer dans
 * `paper2b.ts` repeindrait le FIL — `FeedGutterScreen`, `TweetRowGutter`,
 * `TweetDetailGutterScreen` et la barre de navigation — alors que la refonte
 * demandée ne porte que sur Messages. Ce fichier n'est importé que par
 * `MessagesScreen2B` et `ConversationThreadScreen2B` ; le fil ne le lit
 * jamais et ne peut donc pas bouger à cause de lui.
 *
 * ── Ce qu'il ajoute ──
 * Une vraie feuille de papier, là où `paper.bg` est un blanc pur : blanc cassé
 * chaud en clair, quasi-noir chaud en sombre. Assez pour qu'on voie le grain,
 * assez peu pour que ce ne soit pas de la crème.
 *
 * ── Pourquoi les gris sont ré-encrés ──
 * Teinter le papier coûte du contraste. Sur `#F7F4ED`, les gris de `paper2b`
 * (`#6E6C75` / `#77747E`) tombent à 4,70:1 et 4,17:1 — ce dernier sous le
 * seuil du petit texte, et tous deux sous le seuil sur la bande. Ré-encrés
 * d'un cran, ils tiennent 5,80:1 et 4,96:1 sur le papier, 5,35:1 et 4,58:1
 * sur la bande. En sombre les gris d'origine passent déjà, ils ne bougent pas.
 *
 * Tout le reste — encre, accent, filets, gouttière, polices — vient de
 * `paper2b.ts` sans modification : Messages et le fil parlent la même langue,
 * seule la feuille change.
 */
import { isPaperDark } from './paper2b';

export interface Messages2BSheet {
  /** Le papier de la page. */
  bg: string;
  /** Un cran de fond : bande, champ de saisie, bulle reçue. */
  band: string;
  /** Texte secondaire, ré-encré pour tenir sur le papier. */
  inkSoft: string;
  /** Méta en chasse fixe (horodatage, durée), ré-encrée de même. */
  inkMeta: string;
}

const LIGHT: Messages2BSheet = {
  bg: '#F7F4ED',
  band: '#EFEBE1',
  inkSoft: '#605E68',
  inkMeta: '#6B6873',
};

const DARK: Messages2BSheet = {
  // Quasi-noir CHAUD, pas le `#0A0A0A` neutre de Pulse : la même feuille vue
  // de nuit. L'écart bg → bande garde le palier d'élévation dont le sombre a
  // besoin, l'ombre n'y portant pas.
  bg: '#131210',
  band: '#1C1A17',
  // Inchangés : sur `#131210` ils tiennent déjà 7,28:1 et 5,82:1.
  inkSoft: '#A3A0AA',
  inkMeta: '#918E99',
};

/** Feuille du test, figée pour la session comme `paper`. */
export const sheet: Messages2BSheet = isPaperDark ? DARK : LIGHT;

export default sheet;
