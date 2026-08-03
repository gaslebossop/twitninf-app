export interface PatchNote {
  date: string;
  title: string;
  items: string[];
}

/** Le plus récent en premier. */
export const PATCH_NOTES: PatchNote[] = [
  {
    date: '1 août 2026',
    title: 'Pseudo plus grand sur le profil',
    items: [
      'Nouvelle taille de pseudo personnalisable (Normal, Grand, Très grand, Énorme, Géant) — réservée aux abonnés Pro',
      'Refonte des statistiques du compte : graphiques plus lisibles, suppression d\'une courbe de croissance hebdomadaire qui n\'était pas fiable',
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
];
