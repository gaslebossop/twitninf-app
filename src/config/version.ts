export const APP_VERSION = '1.2.0';

export interface PatchNote {
  version: string;
  date: string;
  title: string;
  changes: string[];
}

export const PATCH_NOTES: PatchNote[] = [
  {
    version: '1.2.0',
    date: '31 juillet 2026',
    title: 'Fil ultra-fluide',
    changes: [
      'Refonte complète du fil : défilement fluide même avec des centaines de tweets.',
      'Nouvelles animations sur les likes, retweets et le double-tap.',
      "Chargement en douceur avec des silhouettes animées à la place du logo qui tournait.",
      "Ta session ne se coupe plus : reste connecté durablement, y compris avec plusieurs comptes.",
      "L'application ne se fait plus bloquer par erreur par les systèmes de sécurité.",
    ],
  },
  {
    version: '1.1.1',
    date: '14 Mai 2026',
    title: 'Mise à jour Interface',
    changes: [
      "Refonte de l'intégralité de la page notification et profile.",
      "Ajout d'un nouvel abonnement.",
      'Optimisation des performances de la recherche.',
    ],
  },
  {
    version: '1.0.0',
    date: 'octobre 2024',
    title: 'Lancement Initial',
    changes: [
      'Lancement officiel de TwitNinf.',
      'Système de tweets, retweets et likes.',
      'Profils utilisateurs personnalisables.',
    ],
  },
];
