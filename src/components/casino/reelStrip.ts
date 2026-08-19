/**
 * La bande de symboles du rouleau, et rien d'autre.
 *
 * ── Pourquoi ce fichier existe ──
 * `cellForSymbol` vivait dans `SlotReel3D.tsx`, qui importe `three`,
 * `expo-three` et `expo-gl` — les trois seules bibliothèques graphiques du
 * dépôt, tirées par cette unique machine à sous. `CasinoScreen` importait la
 * fonction NOMMÉMENT, donc rendre le rouleau 3D paresseux n'aurait rien changé :
 * l'import nommé aurait rappelé le module lourd et annulé tout le bénéfice.
 *
 * Ces quelques lignes d'arithmétique n'ont aucune raison de dépendre d'un
 * moteur 3D. Elles vivent donc à part, et `SlotReel3D` les réexporte pour ne
 * casser aucun appelant existant.
 */

/** Ordre des symboles sur la bande — doit suivre `STRIP` du script Python. */
export const REEL_STRIP = [
  'cherry', 'lemon', 'cherry', 'bell',
  'star', 'cherry', 'lemon', 'diamond',
  'cherry', 'bell', 'lemon', 'star',
  'cherry', 'lemon', 'bell', 'seven',
] as const;

export type ReelSymbol = (typeof REEL_STRIP)[number];

/** Première case portant ce symbole, ou `null` si le serveur en envoie un inconnu. */
export function cellForSymbol(symbol: string): number | null {
  const index = REEL_STRIP.indexOf(symbol as ReelSymbol);
  return index < 0 ? null : index;
}
