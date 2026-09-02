export interface PatchNote {
  /**
   * Version de l'app qui porte ces notes — `MAJEUR.MINEUR.CORRECTIF`.
   *
   * C'est ce qui lie une sortie a ce qu'elle a change. Sans ce champ, les
   * notes n'etaient qu'une liste de dates sans rapport avec le numero affiche
   * dans les Reglages, et rien n'obligeait a en ecrire pour une nouvelle
   * version.
   *
   * `tests/app-version` verifie que la premiere entree correspond exactement
   * a la version d'`app.config.js` : on ne peut donc pas sortir une version
   * sans dire ce qu'elle apporte.
   */
  version: string;
  date: string;
  title: string;
  items: string[];
}

/**
 * Source unique des notes de version — lue par `PatchNotesModal` (popup de
 * démarrage, seulement `PATCH_NOTES[0]`) et par l'écran « Notes de version »
 * des réglages (liste complète). Ne pas dupliquer cette liste ailleurs.
 *
 * Le plus récent en premier.
 */
export const PATCH_NOTES: PatchNote[] = [
  {
    version: '1.5.1',
    date: '2 septembre 2026',
    title: 'Correctifs du profil',
    items: [
      'La couleur de ton thème se voit enfin : un dégradé pleine largeur part du bas de ta bannière au lieu d’une tache ronde à moitié cachée derrière elle',
      'La lueur autour du nom était devenue une tache : elle redevient un halo qui s’éteint',
      'La pastille d’abonnement ne part plus seule à la ligne sous un nom long',
      'Plus de point de séparation isolé après la ville quand la date d’inscription manque',
    ],
  },
  {
    version: '1.5.0',
    date: '2 septembre 2026',
    title: 'Ton profil, refait',
    items: [
      'Ton nom et ta photo restent en haut de l’écran quand tu fais défiler ton profil — tu sais toujours chez qui tu es',
      'Tes chiffres sont regroupés à côté de ta photo, alignés et lisibles d’un coup d’œil',
      'Les onglets Posts, Réponses, Médias et J’aime restent à portée pendant que tu descends dans tes posts',
      'Ton abonnement est écrit sur ton profil, avec la date jusqu’à laquelle il court',
      '« Personnaliser » a sa propre place au lieu d’une petite icône ; partage, signets et déconnexion sont regroupés dans le menu ⋯',
      'Le profil des autres suit exactement la même mise en page que le tien, au pixel près',
      'Les parures d’avatar accrochent vraiment la lumière : un reflet passe, puis l’anneau se repose — au lieu de tourner sans fin',
      'Les fonds de profil ne montrent plus de bandes : ils sont calculés pixel par pixel, et rendent pareil sur iPhone et sur Android',
      'Les fonds de profil ont de la matière : leurs contours ne sont plus des ovales mais des nuages qui se déforment lentement',
      'Le néon du nom est un vrai tube lumineux, plus une ombre épaisse : la lueur décroît comme une vraie lumière',
    ],
  },
  {
    version: '1.4.0',
    date: '1er septembre 2026',
    title: 'Ton abonnement, en un seul endroit',
    items: [
      'Un nouvel écran d’abonnement : ton palier actif, ce qu’il te donne déjà, et ce que les paliers au-dessus ajoutent',
      'Les avantages que tu as déjà sont marqués comme tels — tu vois ce que tu paies, pas seulement ce qu’il reste à prendre',
      'Un comparatif Plus / Pro / Ultra ligne par ligne : frais de virement, taille des tweets, images, vocal, programmation',
      'Ultra ouvre trente-trois nouveaux plafonds : virements sans commission, 2 500 signes par tweet, huit images, vocaux de cinq minutes',
    ],
  },
  {
    version: '1.3.0',
    date: '1er septembre 2026',
    title: 'Tes tests A/B, en direct',
    items: [
      'Suis tes tests A/B depuis le Studio créateur : personnes touchées, interactions et version en tête, mis à jour à chaque passage',
      'Tant qu’une version n’a pas touché assez de monde, aucun pourcentage n’est affiché — un écart sur vingt personnes ne veut rien dire',
    ],
  },
  {
    version: '1.2.0',
    date: '1er septembre 2026',
    title: 'Tes abonnés savent quand tu publies',
    items: [
      'Ultra : préviens tes abonnés à la publication, avec ton propre message — ou passe en mode silencieux',
      'Tes avantages Ultra sont enfin lisibles : crédit publicitaire, recherche prioritaire, portée protégée',
      'Profil premium : la couleur éclaire la page au lieu de la repeindre, et le nom retrouve son relief',
      'Les notifications ne se perdent plus si ton téléphone était éteint',
    ],
  },
  {
    version: '1.1.5',
    date: '31 août 2026',
    title: 'Le tweet de la semaine',
    items: [
      'Vote pour le tweet de la semaine et vois monter les propositions de la communauté',
      'Teste deux formulations d’un même tweet et garde celle qui prend',
      'Sécurité renforcée : l’app vérifie elle-même à qui elle parle, même sur un réseau public',
      'Correction d’une notification de message qui ouvrait le site au lieu de la conversation',
    ],
  },
  {
    version: '1.1.4',
    date: '29 août 2026',
    title: 'Protège ton compte, partage tes tweets',
    items: [
      'Vérification en deux étapes : e-mail, application d’authentification et codes de secours',
      'Chaque tweet a désormais un lien partageable qui s’ouvre correctement hors de l’app',
      'Ultra : la marketplace des créateurs — sois réservable, fixe ton prix indicatif',
      'L’écran d’état du compte disait le faux sur la portée de tes publications',
    ],
  },
  {
    version: '1.1.3',
    date: '21 août 2026',
    title: 'Espace créateur et vraies statistiques',
    items: [
      'Tableau de bord créateur : revenus, ventes, meilleures heures de publication',
      'Statistiques repensées en relevé, avec des chiffres sur lesquels on peut décider',
      'Écrans Favoris et Comptes bloqués, et blocage directement depuis un profil',
      'Le fil sait enfin combien de temps tu lis vraiment un tweet — les recommandations s’affinent',
      'Une dizaine de correctifs sur le fil : retweets manquants, likes perdus, pagination qui sautait',
    ],
  },
  {
    version: '1.1.2',
    date: '18 août 2026',
    title: 'Explorer refait de zéro',
    items: [
      'Nouvel onglet Explorer : un mur de cartes dont la forme découle du tweet lui-même',
      'Agis sur une carte sans quitter le mur',
      'Recalibre ton algorithme quand tu veux : cinq tours de swipe, et ton fil change',
    ],
  },
  {
    version: '1.1.1',
    date: '15 août 2026',
    title: 'La Forge et les événements',
    items: [
      'La Forge : propose une fonctionnalité, vote pour celles des autres, suis ce qui est retenu',
      'Système d’événements refait, avec l’anniversaire de TwitNinf et ses récompenses à vie',
      'Passes d’événement : ton billet dans l’app, scannable à l’entrée',
    ],
  },
  {
    version: '1.1.0',
    date: '12 août 2026',
    title: 'Connexion avec G',
    items: [
      'Connecte-toi en un geste avec ton compte G — relie-le à un compte existant et récupère un bonus de 5 NF',
      'Correction d\’un plantage au lancement sur certains appareils',
      'Casino, écran d\’accueil, profil : plusieurs écrans retouchés pour mieux s\’afficher en thème clair',
    ],
  },
  {
    version: '1.0.6',
    date: '9 août 2026',
    title: 'Tes données, tes choix',
    items: [
      'Nouvel écran de consentement : ce qui est nécessaire au service, ce qui reste libre — tu choisis',
      'Reviens sur ces choix à tout moment depuis les réglages',
    ],
  },
  {
    version: '1.0.5',
    date: '5 août 2026',
    title: 'Le fil dans ta langue',
    items: [
      'Choisis ta langue de lecture : les publications traduites par leur auteur s\’affichent directement dedans',
      'Change d\’avis quand tu veux, depuis les réglages',
    ],
  },
  {
    version: '1.0.4',
    date: '4 août 2026',
    title: 'Réponses à leur place',
    items: [
      'Une réponse s\’affiche désormais juste après le tweet auquel elle répond, plutôt que noyée plus loin dans le fil',
    ],
  },
  {
    version: '1.0.3',
    date: '3 août 2026',
    title: 'Espace créateur',
    items: [
      'Vends du contenu à l\’unité directement dans tes tweets',
      'Programme tes publications à l\’avance, ou modifie un tweet déjà publié (dans les 30 minutes)',
      'Alerte si un compte usurpe ton identité, et radar des comptes qui décollent',
      'Vois qui visite ton profil',
      'Marché des noms d\’utilisateur : achète ou vends un pseudo',
    ],
  },
  {
    version: '1.0.2',
    date: '1 août 2026',
    title: 'Pseudo plus grand sur le profil',
    items: [
      'Nouvelle taille de pseudo personnalisable (Normal, Grand, Très grand, Énorme, Géant) — réservée aux abonnés Pro',
      'Refonte des statistiques du compte : graphiques plus lisibles, suppression d\’une courbe de croissance hebdomadaire qui n\’était pas fiable',
    ],
  },
  {
    version: '1.0.1',
    date: '31 juillet 2026',
    title: 'Fil ultra-fluide',
    items: [
      'Refonte complète du fil : défilement fluide même avec des centaines de tweets',
      'Nouvelles animations sur les likes, retweets et le double-tap',
      'Chargement en douceur avec des silhouettes animées à la place du logo qui tournait',
      'Ta session ne se coupe plus : reste connecté durablement, y compris avec plusieurs comptes',
    ],
  },
  {
    version: '0.9.1',
    date: '28 juillet 2026',
    title: 'Signalement repensé',
    items: [
      'Motifs de signalement clarifiés et gravité évaluée automatiquement',
      'Suivi : tu es prévenu quand une décision est prise sur un compte que tu as signalé',
    ],
  },
  {
    version: '0.9.0',
    date: '14 mai 2026',
    title: 'Mise à jour interface',
    items: [
      'Refonte de l\’intégralité de la page notifications et profil',
      'Ajout d\’un nouvel abonnement',
      'Optimisation des performances de la recherche',
    ],
  },
  {
    version: '0.1.0',
    date: 'octobre 2024',
    title: 'Lancement initial',
    items: [
      'Lancement officiel de TwitNinf',
      'Système de tweets, retweets et likes',
      'Profils utilisateurs personnalisables',
    ],
  },
];
