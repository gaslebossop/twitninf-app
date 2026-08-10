/**
 * Clés des drapeaux de fonctionnalité utilisées dans le code.
 *
 * Les regrouper ici sert au **retrait**, qui est le moment le plus négligé du
 * cycle de vie d'un drapeau : quand une fonctionnalité est acquise (ou
 * abandonnée), `git grep` sur la constante donne en une fois tous les endroits
 * à nettoyer. Une chaîne écrite à la main dans dix fichiers se retrouve mal et
 * finit par survivre des mois à la fonctionnalité qu'elle protégeait.
 *
 * Écrire ici la date de pose et la sortie prévue. Un drapeau sans date de
 * sortie est une dette qui ne se rembourse pas toute seule.
 */
export const FLAGS = {
  /**
   * Test : bouton de signalement rapide directement sur les lignes du fil,
   * à côté de « j'aime ».
   *
   * Posé le 2026-08-10. **Temporaire** — à retirer avec le bouton lui-même
   * une fois l'essai terminé (voir `components/feed/TweetRow.tsx`).
   */
  QUICK_REPORT: 'fil.test',
} as const;

export type FlagKey = (typeof FLAGS)[keyof typeof FLAGS];
