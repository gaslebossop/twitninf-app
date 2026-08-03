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
export type StartupPopupId = 'language' | 'patch' | 'birthday' | 'navbar';

/**
 * Du plus bloquant au plus accessoire. La langue de lecture conditionne tout
 * le contenu du fil, elle passe donc en premier ; le choix des onglets est le
 * seul réellement reportable, il passe en dernier.
 */
const PRIORITY: StartupPopupId[] = ['language', 'patch', 'birthday', 'navbar'];

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

  const current = useMemo(
    () => PRIORITY.find((id) => pending.includes(id)) ?? null,
    [pending],
  );

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
