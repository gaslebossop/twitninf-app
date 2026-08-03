import { useEffect, useRef } from 'react';
import { AppState, type AppStateStatus } from 'react-native';

/**
 * `setInterval` qui ne tourne que lorsque l'application est au premier plan.
 *
 * L'app entretenait plusieurs minuteurs (lives 20 s, compteurs non lus 15 s,
 * événements, traceur de comportement…) qui continuaient de battre — et
 * d'appeler l'API — app en arrière-plan. Cela réveillait le thread JS, vidait
 * la batterie et alimentait pour rien les compteurs de cadence anti-fraude.
 *
 * Le callback est aussi rejoué au retour au premier plan, pour que l'affichage
 * ne reste pas figé sur des données périmées.
 */
export function useForegroundInterval(
  callback: () => void,
  intervalMs: number,
  { runImmediately = true }: { runImmediately?: boolean } = {}
): void {
  const savedCallback = useRef(callback);
  savedCallback.current = callback;

  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;

    const start = () => {
      if (timer) return;
      timer = setInterval(() => savedCallback.current(), intervalMs);
    };

    const stop = () => {
      if (!timer) return;
      clearInterval(timer);
      timer = null;
    };

    const onChange = (state: AppStateStatus) => {
      if (state === 'active') {
        savedCallback.current();
        start();
      } else {
        stop();
      }
    };

    if (runImmediately) savedCallback.current();
    if (AppState.currentState === 'active') start();

    const sub = AppState.addEventListener('change', onChange);

    return () => {
      stop();
      sub.remove();
    };
  }, [intervalMs, runImmediately]);
}

export default useForegroundInterval;
