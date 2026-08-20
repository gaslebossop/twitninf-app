import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  ReactNode,
} from 'react';

/**
 * File d'attente des popups de démarrage.
 *
 * Quatre modales peuvent vouloir s'ouvrir dans la même seconde après le
 * lancement, et elles étaient montées à quatre endroits différents sans se
 * connaître : la langue (App.tsx), les patch notes (TweetsScreen, 1 s),
 * l'anniversaire Kospor (MainNavigator, 2 s) et le choix des onglets de la
 * navbar (MainNavigator, 2,5 s).
 *
 * Ce sont toutes des `<Modal>` React Native. Deux modales ouvertes en même
 * temps ne cohabitent pas sur Android : la seconde ne s'affiche pas, mais sa
 * fenêtre continue d'intercepter les touches — d'où l'écran qui semble figé,
 * et la popup « qui ne spawn pas ».
 *
 * Ici, chaque popup déclare vouloir s'afficher ; une seule à la fois obtient
 * le créneau, dans l'ordre de priorité ci-dessous. Elle libère le créneau en
 * cessant de le demander (fermeture), et la suivante prend le relais.
 */
export type StartupPopupId =
  | 'language' | 'patch' | 'birthday' | 'navbar' | 'profile'
  | 'consent' | 'follow_onboarding' | 'update' | 'sleep' | 'feed2b';

/**
 * Du plus bloquant au plus accessoire.
 *
 * `consent` passe AVANT tout le reste, et ce n'est pas un choix esthétique :
 * `profile` demande l'âge, la date de naissance et la localisation. Collecter
 * ces données avant que la politique de confidentialité ait été acceptée
 * reviendrait à traiter des données personnelles sans base légale. Le socle
 * légal doit donc être posé en premier.
 *
 * C'est aussi la seule popup qui ne se referme pas sans réponse : elle garde le
 * créneau tant qu'elle n'a pas obtenu son accord, ce qui met mécaniquement les
 * autres en attente.
 *
 * Ensuite : la langue de lecture conditionne tout le contenu du fil, et le
 * choix des onglets est le seul réellement reportable, il ferme la marche.
 */
/**
 * Delai laisse aux etapes pour se declarer avant qu'on designe la premiere.
 * Doit couvrir le plus long des delais d'amorcage des etapes elles-memes
 * (voir `STARTUP_SETTLE_MS` dans chaque composant), sinon une etape
 * prioritaire arrivee en retard viendrait remplacer celle deja affichee.
 */
const REGISTRATION_WINDOW_MS = 700;

const PRIORITY: StartupPopupId[] = [
  // Avant tout le reste : l'app installée est périmée, et les étapes qui
  // suivent (patch notes, choix d'onglets) décrivent parfois des écrans que
  // cette version-là n'a pas encore. Annoncer la mise à jour d'abord évite de
  // présenter des nouveautés introuvables.
  'update',
  'consent',
  // Juste apres le socle legal, et avant tout le reste : dire « il est
  // tard » a quelqu'un qui vient de remplir cinq formulaires n'a plus
  // aucun sens. Cette etape n'engage a rien - les deux issues laissent
  // entrer - donc la placer tot ne bloque personne.
  'sleep',
  // Juste derrière le socle légal : sans abonnement, le recommandeur n'a aucun
  // signal et sert un fil générique. Cette étape conditionne donc tout ce que
  // la personne verra ensuite, y compris pendant les popups suivantes.
  'follow_onboarding',
  'language', 'patch', 'birthday',
  // Avant le choix des onglets : `navbar` fait choisir des raccourcis DANS une
  // barre que la personne n'a jamais vue. Présenter le fil d'abord donne le
  // contexte qui rend ce choix compréhensible.
  'feed2b',
  'navbar', 'profile',
];

/**
 * Étapes qui se posent SUR l'application au lieu de la remplacer.
 *
 * Toutes les autres sont des pages plein écran : le fond opaque du parcours
 * (`StartupFlowBackdrop`) les sert, en empêchant le fil de réapparaître dans
 * les interstices. `feed2b` est l'exception — c'est une visite guidée dont les
 * bulles désignent le VRAI fil, avec un voile percé d'un trou sur l'élément
 * montré. Masquer l'application sous elle vide le trou de son contenu, et
 * pendant les secondes ou la visite mesure ses ancres il ne reste plus rien du
 * tout à l'écran : un aplat `colors.bg`, donc noir en thème sombre et blanc en
 * clair. C'est ce qu'on voyait à l'étape 2 du parcours de connexion.
 *
 * Une étape listée ici garde l'exclusivité du créneau — une modale native
 * ouverte en même temps passerait par-dessus son voile — mais renonce au
 * masque.
 */
const TRANSPARENT: StartupPopupId[] = ['feed2b'];

interface StartupPopupContextValue {
  request: (id: StartupPopupId) => void;
  release: (id: StartupPopupId) => void;
  current: StartupPopupId | null;
  /** Rang de l'étape courante dans le parcours (1-based), 0 si aucune. */
  stepIndex: number;
  /** Nombre d'étapes de ce parcours, y compris celles déjà passées. */
  stepCount: number;
  /** Étapes encore en attente, recensement initial compris. */
  pendingCount: number;
  /** Faut-il masquer l'application derrière le parcours (voir `TRANSPARENT`). */
  masked: boolean;
}

const StartupPopupContext = createContext<StartupPopupContextValue>({
  request: () => {},
  release: () => {},
  current: null,
  stepIndex: 0,
  stepCount: 0,
  pendingCount: 0,
  masked: false,
});

export function StartupPopupProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<StartupPopupId[]>([]);

  const request = useCallback((id: StartupPopupId) => {
    setPending((prev) => (prev.includes(id) ? prev : [...prev, id]));
  }, []);

  const release = useCallback((id: StartupPopupId) => {
    setPending((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : prev));
  }, []);

  const rawCurrent = useMemo(
    () => PRIORITY.find((id) => pending.includes(id)) ?? null,
    [pending],
  );

  /**
   * Fenetre de recensement avant d'afficher quoi que ce soit.
   *
   * Les etapes ne s'annoncent pas toutes au meme instant : la langue sait
   * immediatement qu'elle est necessaire, le consentement doit d'abord laisser
   * le profil se charger. Sans ce palier, la langue prenait le creneau a
   * t=0 et le consentement — pourtant prioritaire — la remplacait une seconde
   * plus tard sous les yeux de l'utilisateur.
   *
   * On laisse donc toutes les etapes se declarer avant de designer la
   * premiere. Le palier ne joue qu'a l'OUVERTURE du parcours : une fois
   * lance, chaque etape passe la main a la suivante immediatement, sans blanc.
   *
   * (Un palier de 250 ms existait auparavant entre CHAQUE etape, parce que
   * deux `<Modal>` natives ne peuvent pas se superposer sur Android. Ce sont
   * maintenant des vues ordinaires : ce probleme-la a disparu.)
   */
  const [settled, setSettled] = useState(false);

  useEffect(() => {
    if (pending.length === 0) {
      setSettled(false);
      return;
    }
    if (settled) return;
    const timer = setTimeout(() => setSettled(true), REGISTRATION_WINDOW_MS);
    return () => clearTimeout(timer);
  }, [pending.length, settled]);

  const current = settled ? rawCurrent : null;

  /**
   * Étapes rencontrées pendant CE parcours, pour afficher « étape 2 sur 4 ».
   *
   * On ne peut pas compter `pending` directement : il rétrécit à chaque étape
   * franchie, et le total afficherait 4, puis 3, puis 2. On mémorise donc les
   * identifiants vus depuis le début du parcours, et on remet à zéro quand la
   * file se vide — un parcours qui s'ouvre plus tard repart proprement.
   *
   * L'ensemble peut GRANDIR en cours de route (une étape dont la condition
   * n'est connue qu'après un appel réseau) : le total s'ajuste alors, ce qui
   * vaut mieux qu'un total figé d'avance et faux.
   */
  const [flowIds, setFlowIds] = useState<StartupPopupId[]>([]);

  useEffect(() => {
    if (pending.length === 0) {
      setFlowIds((prev) => (prev.length === 0 ? prev : []));
      return;
    }
    setFlowIds((prev) => {
      const merged = PRIORITY.filter((id) => prev.includes(id) || pending.includes(id));
      return merged.length === prev.length && merged.every((id, i) => id === prev[i]) ? prev : merged;
    });
  }, [pending]);

  const stepCount = flowIds.length;
  const stepIndex = current ? flowIds.indexOf(current) + 1 : 0;

  /**
   * Le masque suit l'étape COURANTE, pas la file entière : pendant une étape
   * transparente, une étape opaque encore en attente derrière elle ne doit pas
   * rallumer le fond. Quand `current` est nul — fenêtre de recensement, ou
   * relais entre deux étapes — on masque : c'est justement l'interstice que ce
   * fond existe pour couvrir.
   */
  const masked =
    pending.length > 0 && !(current !== null && TRANSPARENT.includes(current));

  const value = useMemo(
    () => ({ request, release, current, stepIndex, stepCount, pendingCount: pending.length, masked }),
    [request, release, current, stepIndex, stepCount, pending.length, masked],
  );

  return (
    <StartupPopupContext.Provider value={value}>{children}</StartupPopupContext.Provider>
  );
}

/**
 * Demande le créneau d'affichage pour `id` tant que `wanted` est vrai.
 * Renvoie `true` uniquement quand c'est au tour de cette popup — c'est cette
 * valeur, et pas `wanted`, qu'il faut passer en `visible` à la `<Modal>`.
 */
export function useStartupPopupSlot(id: StartupPopupId, wanted: boolean): boolean {
  const { request, release, current } = useContext(StartupPopupContext);

  useEffect(() => {
    if (wanted) {
      request(id);
      return () => release(id);
    }
    release(id);
  }, [id, wanted, request, release]);

  return wanted && current === id;
}

/** Position de l'étape courante dans le parcours, pour l'indicateur d'avancement. */
export function useStartupFlowProgress(): { stepIndex: number; stepCount: number } {
  const { stepIndex, stepCount } = useContext(StartupPopupContext);
  return { stepIndex, stepCount };
}

/**
 * Vrai quand l'application doit être masquée derrière le parcours : il reste
 * une étape à passer, recensement initial et interstices compris, ET l'étape
 * courante est une page plein écran. Sans ce masque, le fil réapparaît un
 * instant à chaque « Continuer » ; avec lui sous une étape transparente, il n'y
 * a plus rien à voir du tout (voir `TRANSPARENT`).
 */
export function useStartupFlowMask(): boolean {
  const { masked } = useContext(StartupPopupContext);
  return masked;
}
