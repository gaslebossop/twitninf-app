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

  /**
   * Refonte du fil « 2B — Gouttiere » : palette papier, engagement sorti du
   * texte et remonte dans une gouttiere tactile, navbar en pilule flottante a
   * quatre entrees.
   *
   * Pose le 2026-08-19 a 1 %, SANS montee automatique : c'est une refonte
   * visuelle qu'on regarde avant de l'elargir, pas une fonctionnalite qui
   * monte toute seule. Conditionne TOUT l'ecran d'accueil et la barre de
   * navigation — les originaux (`TweetsScreen`, `BottomTabNavigator`) sont
   * intacts et servis a tous les autres.
   *
   * ⚠️ Depuis le 2026-08-22, ce drapeau n'est PLUS tire au sort : il est de
   * type `audience = 'beta'`. Il suit l'appartenance au programme beta
   * (`contexts/BetaContext`, `/api/beta`), et son palier global n'est plus
   * consulte DU TOUT par l'evaluateur — le relever ne sert la refonte a
   * personne. C'est la console beta qui decide qui la voit.
   *
   * Seule la liste d'acces continue de passer avant : quelques comptes de test
   * internes voient la refonte sans etre membres.
   *
   * A retirer avec `screens/FeedGutterScreen.tsx`,
   * `components/feed/TweetRowGutter.tsx`, `navigation/BottomTabNavigator2B.tsx`
   * et `theme/paper2b.ts` — que le test soit adopte ou abandonne.
   */
  FEED_2B: 'fil.refonte2b',

  /**
   * Variantes A/B des tweets, jusque-là réservées à Windows.
   *
   * Posé le 2026-08-20 à 10 %, SANS montée automatique : ouverture
   * progressive délibérée, pas une fonctionnalité qui monte toute seule.
   * Bucket sur `user_id` (défaut) pour qu'un même lecteur ne voie pas le
   * texte d'un tweet changer à chaque rafraîchissement.
   *
   * ⚠ Il ouvre les DEUX côtés de la même cohorte, et c'est délibéré :
   *
   *   - en LECTURE, il décide si le fil demande `enableExperiments` au moteur
   *     et sert donc des variantes (côté API, `neuralRankRoutes.js`) ;
   *   - en ÉCRITURE, depuis le 2026-08-31, il fait apparaître la puce
   *     « TEST A/B » du composeur (`screens/CreateTweetScreen.tsx`) et il
   *     autorise le client mobile à lancer une expérience (côté API,
   *     `services/tweetAbTestService.js`).
   *
   * Deux drapeaux séparés auraient permis d'écrire un test que personne dans sa
   * propre cohorte ne peut voir.
   *
   * Le drapeau ne remplace pas les conditions de compte, qui restent au
   * serveur : compte certifié, plus de dix abonnés, deux expériences
   * simultanées au maximum. Un auteur qui a le drapeau sans remplir ces
   * conditions voit la puce et reçoit un refus expliqué — mieux qu'un bouton
   * absent sans raison.
   */
  AB_TEST: 'fil.abtest',
} as const;

export type FlagKey = (typeof FLAGS)[keyof typeof FLAGS];
