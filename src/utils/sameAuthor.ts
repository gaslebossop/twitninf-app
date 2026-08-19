/**
 * Comparateur d'auteur partagé par les comparateurs `React.memo` des trois
 * composants qui rendent un tweet : `TweetCard`, `TweetRow` et
 * `TweetRowGutter`.
 *
 * ── Pourquoi il faut comparer l'auteur, champ par champ ──
 * `React.memo` bloque le re-rendu tant que ces champs sont égaux : sans eux,
 * changer sa photo, acheter un premium ou obtenir la certification laisse le
 * fil afficher l'ancien état jusqu'à ce que la ligne quitte puis revienne
 * dans la fenêtre de virtualisation (démontage/remontage de cellule).
 *
 * ── Pourquoi PAS une comparaison de référence sur `author` ──
 * Le fil reconstruit ses objets tweet à chaque réponse serveur : comparer
 * `a === b` serait vrai en permanence, et ferait re-rendre TOUTES les lignes
 * à chaque rafraîchissement — le défaut inverse, et plus coûteux que celui
 * corrigé ici.
 *
 * `profile_customization` reste comparé par référence : il vient tel quel de
 * la réponse serveur et n'est pas reconstruit ligne à ligne.
 */
export function sameAuthor(a: any, b: any): boolean {
  if (a === b) return true;
  if (!a || !b) return !a === !b;
  return (
    a.id === b.id &&
    a.avatar === b.avatar &&
    a.username === b.username &&
    a.full_name === b.full_name &&
    a.premium === b.premium &&
    a.subscription_tier === b.subscription_tier &&
    a.verified === b.verified &&
    a.verification_style === b.verification_style &&
    a.profile_customization === b.profile_customization
  );
}

export default sameAuthor;
