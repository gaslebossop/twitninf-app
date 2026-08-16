/**
 * Lecture d'un message vocal — le moteur partagé entre le fil, la page détail
 * et la relecture dans le composeur.
 *
 * Les trois lecteurs de vocaux de l'app avaient chacun leur copie de cette
 * logique, et chaque copie avait ses trous : celui des tweets ne remettait pas
 * la session audio en mode LECTURE (sur iOS, un vocal joué juste après un
 * enregistrement sort dans l'écouteur, presque inaudible), n'affichait aucune
 * progression, et avalait ses erreurs en silence — un fichier injoignable
 * laissait un bouton mort, sans message ni moyen de réessayer.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { Audio, AVPlaybackStatus } from 'expo-av';
import { toast } from '../components/ui/Toast';

/**
 * Largement de quoi amorcer un flux en 4G faible. Au-delà, on considère le
 * chargement mort : mieux vaut rendre la main que laisser un lecteur figé.
 */
const LOAD_TIMEOUT_MS = 12000;

/**
 * L'enregistrement (`allowsRecordingIOS: true`) laisse la session audio iOS
 * routée vers l'écouteur interne tant qu'elle n'est pas explicitement repassée
 * en lecture — même précaution que `ConversationThreadScreen` et
 * `LiveViewerScreen`.
 */
export async function ensurePlaybackAudioMode(): Promise<void> {
  try {
    await Audio.setAudioModeAsync({
      allowsRecordingIOS: false,
      playsInSilentModeIOS: true,
      staysActiveInBackground: false,
      shouldDuckAndroid: true,
      playThroughEarpieceAndroid: false,
    });
  } catch {
    // Non bloquant : au pire la lecture démarre avec le mode audio courant.
  }
}

export interface VoicePlayback {
  isPlaying: boolean;
  isLoading: boolean;
  positionMs: number;
  durationMs: number;
  /** 0..1 — de quoi colorer une waveform ou une barre de progression. */
  progress: number;
  /** Lance, met en pause, reprend. */
  toggle: () => void;
  /** Saut à une position relative (0..1) — sans démarrer si rien n'est chargé. */
  seekToRatio: (ratio: number) => void;
  /** Arrêt et déchargement, par exemple avant de retirer la pièce jointe. */
  unload: () => Promise<void>;
}

/**
 * @param uri            fichier local ou distant, `null` quand il n'y a rien à lire
 * @param fallbackMs     durée connue d'avance (celle stockée avec le tweet),
 *                       affichée tant que le fichier n'a pas donné la sienne
 */
export function useVoicePlayback(uri: string | null, fallbackMs: number = 0): VoicePlayback {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [positionMs, setPositionMs] = useState(0);
  const [durationMs, setDurationMs] = useState(fallbackMs);

  const soundRef = useRef<Audio.Sound | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Le son survit au démontage si on ne coupe pas les `setState` en vol. */
  const mountedRef = useRef(true);

  const clearLoadTimeout = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  const unload = useCallback(async () => {
    clearLoadTimeout();
    const sound = soundRef.current;
    soundRef.current = null;
    if (mountedRef.current) {
      setIsPlaying(false);
      setIsLoading(false);
      setPositionMs(0);
    }
    if (sound) {
      try {
        await sound.unloadAsync();
      } catch {
        // Déjà déchargé : rien à faire.
      }
    }
  }, [clearLoadTimeout]);

  const failAndReset = useCallback(async () => {
    await unload();
    toast.error('Lecture impossible', { description: 'Vérifie ta connexion et réessaie.' });
  }, [unload]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  /**
   * Un vocal quitté (ligne sortie du fil) ou remplacé (autre pièce jointe) ne
   * doit ni continuer à jouer, ni rester chargé en mémoire.
   */
  useEffect(() => {
    return () => {
      clearLoadTimeout();
      soundRef.current?.unloadAsync().catch(() => {});
      soundRef.current = null;
    };
  }, [uri, clearLoadTimeout]);

  useEffect(() => {
    setPositionMs(0);
    setIsPlaying(false);
    setDurationMs(fallbackMs);
  }, [uri, fallbackMs]);

  const onStatusUpdate = useCallback(
    (status: AVPlaybackStatus) => {
      if (!mountedRef.current) return;
      if (!status.isLoaded) {
        if ((status as any).error) failAndReset();
        return;
      }
      clearLoadTimeout();
      setIsLoading(false);
      setIsPlaying(status.isPlaying);
      setPositionMs(status.positionMillis || 0);
      if (status.durationMillis) setDurationMs(status.durationMillis);
      if (status.didJustFinish) {
        setIsPlaying(false);
        setPositionMs(0);
        soundRef.current?.setPositionAsync(0).catch(() => {});
      }
    },
    [clearLoadTimeout, failAndReset],
  );

  const toggle = useCallback(async () => {
    if (!uri || isLoading) return;
    try {
      await ensurePlaybackAudioMode();

      if (!soundRef.current) {
        setIsLoading(true);
        timeoutRef.current = setTimeout(() => {
          failAndReset();
        }, LOAD_TIMEOUT_MS);
        const { sound } = await Audio.Sound.createAsync({ uri }, { shouldPlay: true, volume: 1 }, onStatusUpdate);
        soundRef.current = sound;
        // Le composant a pu être démonté pendant le chargement : le son
        // continuerait alors à jouer sans plus personne pour l'arrêter.
        if (!mountedRef.current) {
          sound.unloadAsync().catch(() => {});
          soundRef.current = null;
        }
        return;
      }

      const status = await soundRef.current.getStatusAsync();
      if (status.isLoaded && status.isPlaying) {
        await soundRef.current.pauseAsync();
        setIsPlaying(false);
      } else {
        await soundRef.current.playAsync();
        setIsPlaying(true);
      }
    } catch {
      failAndReset();
    }
  }, [uri, isLoading, onStatusUpdate, failAndReset]);

  const seekToRatio = useCallback(
    async (ratio: number) => {
      const sound = soundRef.current;
      const clamped = Math.max(0, Math.min(1, ratio));
      if (!sound || durationMs <= 0) {
        // Rien de chargé : l'appui sur la waveform vaut « lance la lecture ».
        toggle();
        return;
      }
      const target = Math.round(clamped * durationMs);
      setPositionMs(target);
      try {
        await sound.setPositionAsync(target);
      } catch {
        // Position hors bornes (durée pas encore connue) : on laisse la
        // lecture où elle est plutôt que de la casser.
      }
    },
    [durationMs, toggle],
  );

  const progress = durationMs > 0 ? Math.min(1, positionMs / durationMs) : 0;

  return {
    isPlaying,
    isLoading,
    positionMs,
    durationMs,
    progress,
    toggle: toggle as () => void,
    seekToRatio: seekToRatio as (ratio: number) => void,
    unload,
  };
}

export default useVoicePlayback;
