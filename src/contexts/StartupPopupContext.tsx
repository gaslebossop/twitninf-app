import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
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
  | 'consent' | 'follow_onboarding';

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
const PRIORITY: StartupPopupId[] = [
  'consent',
  // Juste derrière le socle légal : sans abonnement, le recommandeur n'a aucun
  // signal et sert un fil générique. Cette étape conditionne donc tout ce que
  // la personne verra ensuite, y compris pendant les popups suivantes.
  'follow_onboarding',
  'language', 'patch', 'birthday', 'navbar', 'profile',
];

interface StartupPopupContextValue {
  request: (id: StartupPopupId) => void;
  release: (id: StartupPopupId) => void;
  current: StartupPopupId | null;
}

const StartupPopupContext = createContext<StartupPopupContextValue>({
  request: () => {},
  release: () => {},
  current: null,
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
   * `current` retenu un instant a `null` lors d'une PASSATION entre deux
   * popups (ex. langue -> consentement, quand le consentement obtient son
   * creneau avant que la langue n'ait relache le sien).
   *
   * Chaque popup est un `<Modal>` natif independant, et elles ne se
   * demontent pas toutes de la meme facon : `ReadingLanguageModal` disparait
   * entierement de l'arbre (`if (!visible) return null`), `ConsentSheet` lui
   * reste monte et bascule juste sa prop `visible`. Sans ce palier, la meme
   * passe de rendu peut fermer la Dialog Android de l'une et en ouvrir une
   * autre au meme instant — deux fenetres natives qui se chevauchent, ce que
   * Android ne supporte pas proprement (au mieux l'ecran fige, au pire ca
   * plante). Le palier ne s'applique qu'aux VRAIES passations (une valeur
   * non nulle vers une autre) ; l'ouverture initiale et la fermeture finale
   * restent instantanees.
   */
  const [current, setCurrent] = useState<StartupPopupId | null>(null);
  const prevNonNullRef = useRef<StartupPopupId | null>(null);

  useEffect(() => {
    if (rawCurrent === prevNonNullRef.current) {
      setCurrent(rawCurrent);
      return;
    }
    if (prevNonNullRef.current !== null && rawCurrent !== null) {
      setCurrent(null);
      const timer = setTimeout(() => {
        prevNonNullRef.current = rawCurrent;
        setCurrent(rawCurrent);
      }, 250);
      return () => clearTimeout(timer);
    }
    prevNonNullRef.current = rawCurrent;
    setCurrent(rawCurrent);
  }, [rawCurrent]);

  const value = useMemo(() => ({ request, release, current }), [request, release, current]);

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
