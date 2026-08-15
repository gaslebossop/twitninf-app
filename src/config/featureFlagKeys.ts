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

  /**
   * Joindre des images à un tweet.
   *
   * Posé le 2026-08-10, montée automatique vers 100 % le 2026-08-24 (abonnés
   * servis deux fois plus vite). **Ne protège que la PUBLICATION** : l'affichage
   * des images n'est jamais conditionné, sinon un tweet illustré apparaîtrait
   * vide à qui n'est pas encore dans le palier.
   *
   * À retirer une fois la montée terminée et la fonctionnalité acquise.
   */
  TWEET_IMAGES: 'tweet.images',

  /**
   * Carte NF : voir sur une carte les comptes qu'on suit, avec leur photo de
   * profil, là où ils ont accepté d'être vus.
   *
   * Posé le 2026-08-10, montée automatique sur 30 jours (100 % le 2026-09-09).
   * Conditionne TOUTE la fonctionnalité, lecture comprise — contrairement à
   * `TWEET_IMAGES`, il n'y a rien à afficher à qui n'y a pas accès.
   */
  NF_MAP: 'fil.cartenf',

  /**
   * Super Cœur : like arc-en-ciel en pression longue, réservé aux paliers
   * Plus/Pro.
   *
   * Posé le 2026-08-15, montée automatique sur ~6 jours (100 % le
   * 2026-08-21). Conditionne TOUTE la fonctionnalité comme `NF_MAP` — rien à
   * afficher à qui n'y a pas accès, pas juste la pose.
   */
  SUPER_HEART: 'fil.supercoeur',
} as const;

export type FlagKey = (typeof FLAGS)[keyof typeof FLAGS];
