import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { apiService } from '../services';
import { ReadableLanguage } from '../types/api';
import { useAuth } from './AuthContext';

/** Langue d'origine des tweets — alignée sur `SOURCE_LANGUAGE` côté API. */
export const SOURCE_LANGUAGE = 'fr';

/**
 * Repli si l'API ne répond pas : l'écran de choix reste utilisable hors
 * connexion parfaite. Doit rester aligné sur `TARGET_LANGUAGES` dans
 * `api/src/services/tweetTranslationService.js`.
 */
export const FALLBACK_LANGUAGES: ReadableLanguage[] = [
  { code: 'fr', label: 'Français', original: true },
  { code: 'en', label: 'English', original: false },
  { code: 'es', label: 'Español', original: false },
  { code: 'pt', label: 'Português', original: false },
  { code: 'de', label: 'Deutsch', original: false },
  { code: 'it', label: 'Italiano', original: false },
  { code: 'nl', label: 'Nederlands', original: false },
  { code: 'ar', label: 'العربية', original: false },
  { code: 'hi', label: 'हिन्दी', original: false },
  { code: 'ja', label: '日本語', original: false },
  { code: 'zh', label: '中文', original: false },
];

interface CachedTranslation {
  language: string;
  label: string;
  content: string;
}

interface ReadingLanguageContextType {
  /** `null` = jamais choisie. */
  preferredLanguage: string | null;
  languages: ReadableLanguage[];
  /** Vrai quand il faut poser la question (compte connecté, choix absent). */
  needsChoice: boolean;
  saving: boolean;
  choose: (code: string) => Promise<boolean>;
  /**
   * Signale qu'un tweet est affiché. Les identifiants demandés dans la même
   * fenêtre de quelques dizaines de millisecondes partent en UN seul appel :
   * une page de fil ne doit pas déclencher dix requêtes.
   */
  requestTranslation: (tweetId: string) => void;
  /** Traduction connue pour ce tweet, ou `undefined` tant qu'elle n'est pas chargée. */
  translationFor: (tweetId: string) => CachedTranslation | undefined;
}

const ReadingLanguageContext = createContext<ReadingLanguageContextType | undefined>(undefined);

export const useReadingLanguage = () => {
  const context = useContext(ReadingLanguageContext);
  if (!context) {
    throw new Error('useReadingLanguage doit être utilisé dans un ReadingLanguageProvider');
  }
  return context;
};

/**
 * Traduction à afficher pour un tweet donné, choix manuel compris.
 *
 * Trois états, et ils ne se confondent pas : `undefined` = aucun choix manuel,
 * la langue du compte s'applique ; `null` = le lecteur a explicitement demandé
 * la version originale ; un objet = il a choisi une autre langue. Sans cette
 * distinction, revenir à l'original rebasculerait aussitôt sur la traduction
 * automatique et le bouton paraîtrait cassé.
 */
export function useTweetAutoTranslation(tweet: {
  id: string;
  content: string;
  translation_enabled?: boolean;
  /**
   * Traduction JOINTE par le serveur, dans la langue du compte. Présente sur
   * le détail d'un tweet, absente ailleurs. `null` signifie « traduisible,
   * mais rien en base » — c'est une réponse, pas une absence de réponse.
   */
  translation?: TweetTranslationLike | null;
}) {
  const { requestTranslation, translationFor, preferredLanguage } = useReadingLanguage();
  const [override, setOverride] = useState<TweetTranslationLike | null | undefined>(undefined);

  const translatable = !!tweet?.translation_enabled;
  // `undefined` = le serveur n'a rien dit ; `null` = il a dit « rien à
  // afficher ». Seul le premier cas justifie un appel.
  const embedded = tweet?.translation;
  const serverAnswered = embedded !== undefined;

  useEffect(() => {
    // Sans cette condition, le détail d'un tweet relançait une requête de
    // traduction alors que la réponse était déjà dans la charge utile : la
    // page s'affichait dans la langue d'origine puis basculait, d'où la
    // saccade à l'ouverture. Invisible pour un lecteur francophone, qui n'a
    // aucune traduction à charger.
    if (translatable && !serverAnswered) requestTranslation(tweet.id);
  }, [translatable, serverAnswered, tweet?.id, requestTranslation]);

  // Changer de langue de compte annule un choix ponctuel : sinon la carte
  // resterait bloquée dans l'ancienne langue après le changement.
  useEffect(() => {
    setOverride(undefined);
  }, [preferredLanguage]);

  const automatic = translatable
    ? (serverAnswered ? embedded : translationFor(tweet.id))
    : undefined;
  const active = override !== undefined ? override : (automatic ?? null);

  return {
    active,
    setActive: (value: TweetTranslationLike | null) => setOverride(value),
    displayedContent: active?.content || tweet?.content,
  };
}

/** Forme minimale partagée par le cache et par le sélecteur manuel. */
export interface TweetTranslationLike {
  language: string;
  label: string;
  content: string;
}

const BATCH_DELAY_MS = 60;
const BATCH_MAX_IDS = 100;

export function ReadingLanguageProvider({ children }: { children: React.ReactNode }) {
  const { user, isAuthenticated, refreshCurrentUser } = useAuth() as any;

  const [preferredLanguage, setPreferredLanguage] = useState<string | null>(
    user?.preferred_language ?? null,
  );
  const [languages, setLanguages] = useState<ReadableLanguage[]>(FALLBACK_LANGUAGES);
  const [saving, setSaving] = useState(false);
  const [cache, setCache] = useState<Record<string, CachedTranslation>>({});

  const pending = useRef<Set<string>>(new Set());
  const requested = useRef<Set<string>>(new Set());
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // La langue vient du profil : elle suit un changement de compte sans
  // qu'aucun écran n'ait à la repasser.
  useEffect(() => {
    setPreferredLanguage(user?.preferred_language ?? null);
  }, [user?.id, user?.preferred_language]);

  // Le cache est indexé par tweet, pas par (tweet, langue) : changer de langue
  // le vide entièrement, sinon les cartes garderaient l'ancienne traduction.
  useEffect(() => {
    setCache({});
    pending.current.clear();
    requested.current.clear();
  }, [preferredLanguage]);

  useEffect(() => {
    if (!isAuthenticated) return;
    let cancelled = false;
    (async () => {
      const response = await apiService.getReadingLanguage();
      if (cancelled || !response?.success || !response.data) return;
      if (response.data.languages?.length) setLanguages(response.data.languages);
      setPreferredLanguage(response.data.preferred_language ?? null);
    })();
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, user?.id]);

  const flush = useCallback(async () => {
    timer.current = null;
    const ids = [...pending.current].slice(0, BATCH_MAX_IDS);
    pending.current.clear();
    if (ids.length === 0 || !preferredLanguage || preferredLanguage === SOURCE_LANGUAGE) return;

    const response = await apiService.getTweetTranslationsBatch(ids, preferredLanguage);
    if (!response?.success || !response.data?.translations) return;
    // Le serveur omet les tweets sans traduction dans cette langue : ils
    // resteront simplement en version originale.
    setCache((current) => ({ ...current, ...response.data!.translations }));
  }, [preferredLanguage]);

  const requestTranslation = useCallback(
    (tweetId: string) => {
      if (!tweetId) return;
      if (!preferredLanguage || preferredLanguage === SOURCE_LANGUAGE) return;
      if (requested.current.has(tweetId)) return;

      requested.current.add(tweetId);
      pending.current.add(tweetId);
      if (timer.current) return;
      timer.current = setTimeout(flush, BATCH_DELAY_MS);
    },
    [flush, preferredLanguage],
  );

  const translationFor = useCallback((tweetId: string) => cache[tweetId], [cache]);

  const choose = useCallback(
    async (code: string) => {
      setSaving(true);
      try {
        const response = await apiService.setReadingLanguage(code);
        if (!response?.success) return false;
        setPreferredLanguage(code);
        // Le profil en mémoire porte `preferred_language` : sans ce
        // rafraîchissement, un redémarrage reposerait la question.
        refreshCurrentUser?.();
        return true;
      } finally {
        setSaving(false);
      }
    },
    [refreshCurrentUser],
  );

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const value = useMemo(
    () => ({
      preferredLanguage,
      languages,
      needsChoice: isAuthenticated && preferredLanguage === null,
      saving,
      choose,
      requestTranslation,
      translationFor,
    }),
    [preferredLanguage, languages, isAuthenticated, saving, choose, requestTranslation, translationFor],
  );

  return (
    <ReadingLanguageContext.Provider value={value}>{children}</ReadingLanguageContext.Provider>
  );
}
