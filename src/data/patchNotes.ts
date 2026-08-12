export interface PatchNote {
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
    date: '12 août 2026',
    title: 'Connexion avec G',
    items: [
      'Connecte-toi en un geste avec ton compte G — relie-le à un compte existant et récupère un bonus de 5 NF',
      'Correction d\'un plantage au lancement sur certains appareils',
      'Casino, écran d\'accueil, profil : plusieurs écrans retouchés pour mieux s\'afficher en thème clair',
    ],
  },
  {
    date: '9 août 2026',
    title: 'Tes données, tes choix',
    items: [
      'Nouvel écran de consentement : ce qui est nécessaire au service, ce qui reste libre — tu choisis',
      'Reviens sur ces choix à tout moment depuis les réglages',
    ],
  },
  {
    date: '5 août 2026',
    title: 'Le fil dans ta langue',
    items: [
      'Choisis ta langue de lecture : les publications traduites par leur auteur s\'affichent directement dedans',
      'Change d\'avis quand tu veux, depuis les réglages',
    ],
  },
  {
    date: '4 août 2026',
    title: 'Réponses à leur place',
    items: [
      'Une réponse s\'affiche désormais juste après le tweet auquel elle répond, plutôt que noyée plus loin dans le fil',
    ],
  },
  {
    date: '3 août 2026',
    title: 'Espace créateur',
    items: [
      'Vends du contenu à l\'unité directement dans tes tweets',
      'Programme tes publications à l\'avance, ou modifie un tweet déjà publié (dans les 30 minutes)',
      'Alerte si un compte usurpe ton identité, et radar des comptes qui décollent',
      'Vois qui visite ton profil',
      'Marché des noms d\'utilisateur : achète ou vends un pseudo',
    ],
  },
  {
    date: '1 août 2026',
    title: 'Pseudo plus grand sur le profil',
    items: [
      'Nouvelle taille de pseudo personnalisable (Normal, Grand, Très grand, Énorme, Géant) — réservée aux abonnés Pro',
      'Refonte des statistiques du compte : graphiques plus lisibles, suppression d\'une courbe de croissance hebdomadaire qui n\'était pas fiable',
    ],
  },
  {
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
    date: '28 juillet 2026',
    title: 'Signalement repensé',
    items: [
      'Motifs de signalement clarifiés et gravité évaluée automatiquement',
      'Suivi : tu es prévenu quand une décision est prise sur un compte que tu as signalé',
    ],
  },
  {
    date: '14 mai 2026',
    title: 'Mise à jour interface',
    items: [
      'Refonte de l\'intégralité de la page notifications et profil',
      'Ajout d\'un nouvel abonnement',
      'Optimisation des performances de la recherche',
    ],
  },
  {
    date: 'octobre 2024',
    title: 'Lancement initial',
    items: [
      'Lancement officiel de TwitNinf',
      'Système de tweets, retweets et likes',
      'Profils utilisateurs personnalisables',
    ],
  },
];
