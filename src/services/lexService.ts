import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * 📝 Lex — les textes qui ne vivent pas dans le build.
 *
 * ── Le problème que ça règle ──────────────────────────────────────────────
 * Corriger une faute dans un écran d'annonces demande aujourd'hui : un
 * commit, un build, une revue de l'App Store, et l'attente que les gens
 * mettent à jour. Pour une virgule. Les textes servis par Lex arrivent par
 * le réseau : ils changent le jour même, sur les téléphones déjà installés.
 *
 * ── Ce que ce fichier n'est pas ───────────────────────────────────────────
 * Pas un remplacement des textes de l'app. Tout ce qui est *structurel* —
 * les libellés de la navigation, les boutons, les erreurs — reste dans le
 * code, où il est relu, typé et testé. Lex sert ce qui est éditorial :
 * l'écran Nouveautés, demain une page d'aide ou une annonce.
 *
 * ── Pourquoi un fetch et pas le SDK ───────────────────────────────────────
 * Le serveur sait rendre les pluriels et les tests A/B, et son client sait
 * les interpréter. Un écran d'annonces n'affiche que du texte constant :
 * un `fetch` y suffit, et c'est une dépendance de moins dans un build
 * natif. Le jour où un écran aura besoin de « {n, plural, … } », le vrai
 * client s'importe depuis `https://lex.twitninf.fr/sdk/index.js`.
 *
 * ── Hors ligne ────────────────────────────────────────────────────────────
 * La dernière réponse reçue est gardée. Un métro, un avion, un serveur
 * qu'on redémarre : l'écran montre ce qu'il avait, jamais une page vide.
 *
 * ── En direct ─────────────────────────────────────────────────────────────
 * Le serveur prévient quand le catalogue change : une correction faite dans
 * le panneau atteint l'écran ouvert en moins d'une seconde, sans que
 * personne ne tire pour rafraîchir. C'est la moitié de l'intérêt de Lex —
 * sans elle, un texte corrigé attend la prochaine ouverture de l'écran.
 */

/** Le serveur de textes. Public : il ne sert que du texte à lire. */
export const LEX_URL = 'https://lex.twitninf.fr';

/** Ce que le serveur renvoie. */
interface LexAnswer {
  /** Version du catalogue servi. */
  v: number;
  /** Langue réellement servie — pas forcément celle demandée. */
  l: string;
  /** Les textes par clé : une chaîne, ou un programme quand le texte varie. */
  t: Record<string, unknown>;
}

/** Ce qu'un écran reçoit. */
export interface LexTexts {
  /** Les textes constants, par clé. */
  text: Record<string, string>;
  /** La langue servie. */
  locale: string;
  /** La version du catalogue. */
  version: number;
  /** Vrai quand ça vient du cache, faute de réseau. */
  cached: boolean;
}

/** Où la dernière réponse d'un écran est gardée. */
const cacheKey = (hash: string) => `lex.cache.${hash}`;

/** L'identifiant de visiteur, pour les tests A/B. */
const VISITOR_KEY = 'lex.visitor';

/**
 * Un identifiant stable par installation.
 *
 * Il ne sert qu'à donner toujours la même version d'un test A/B à la même
 * personne. Lex ne le stocke jamais — il n'en prend que l'empreinte — et il
 * ne quitte pas ce téléphone autrement que dans cette requête.
 */
async function visitor(): Promise<string> {
  const stored = await AsyncStorage.getItem(VISITOR_KEY);
  if (stored) return stored;

  const fresh = `app-${Math.random().toString(36).slice(2, 12)}`;
  await AsyncStorage.setItem(VISITOR_KEY, fresh);
  return fresh;
}

/** La langue du téléphone, réduite à ce que Lex attend. */
function deviceLanguage(): string {
  // `Intl` est présent sur les deux plateformes depuis Hermes ; un appareil
  // sans lui reçoit du français, qui est la langue de l'app.
  try {
    return Intl.DateTimeFormat().resolvedOptions().locale || 'fr';
  } catch {
    return 'fr';
  }
}

/**
 * Demande les textes d'un écran.
 *
 * `hash` est l'identifiant que le panneau Lex donne à un écran. Il désigne
 * une liste de clés figée : le serveur n'exécute que ce qu'on lui a
 * déclaré, jamais une demande arbitraire venue du téléphone.
 *
 * Ne lève jamais. Sans réseau, renvoie la dernière réponse gardée ; sans
 * cache non plus, renvoie `null` et l'écran décide quoi montrer.
 */
export async function fetchTexts(hash: string): Promise<LexTexts | null> {
  try {
    const unit = await visitor();
    const response = await fetch(
      `${LEX_URL}/q/${hash}?u=${encodeURIComponent(unit)}&p=${Platform.OS}`,
      { headers: { 'accept-language': deviceLanguage() } },
    );
    if (!response.ok) throw new Error(String(response.status));

    const answer = (await response.json()) as LexAnswer;
    const text: Record<string, string> = {};

    for (const [key, value] of Object.entries(answer.t ?? {})) {
      // Un texte qui varie arrive sous forme de programme. Cet écran n'en
      // utilise pas ; l'ignorer vaut mieux qu'afficher « [object Object] ».
      if (typeof value === 'string') text[key] = value;
    }

    const result: LexTexts = { text, locale: answer.l, version: answer.v, cached: false };
    await AsyncStorage.setItem(cacheKey(hash), JSON.stringify(result));
    return result;
  } catch {
    return readCache(hash);
  }
}

/** La dernière réponse gardée pour cet écran. */
async function readCache(hash: string): Promise<LexTexts | null> {
  try {
    const stored = await AsyncStorage.getItem(cacheKey(hash));
    if (!stored) return null;
    return { ...(JSON.parse(stored) as LexTexts), cached: true };
  } catch {
    return null;
  }
}

/**
 * Prévient quand le catalogue change.
 *
 * Le serveur envoie la version courante dès la connexion, puis une à chaque
 * mise en ligne. `onVersion` reçoit les deux sans distinction : l'appelant
 * compare avec ce qu'il affiche et redemande si ça diffère.
 *
 * Traiter la poignée de main comme le reste n'est pas une simplification —
 * c'est ce qui rattrape le cas où le téléphone dormait pendant une mise en
 * ligne. Ignorer le premier message ferait manquer exactement ça.
 *
 * La connexion se rétablit seule, en espaçant les tentatives. Un téléphone
 * qui s'endort ou un tunnel coupent le socket : c'est la vie normale d'une
 * connexion mobile, pas une erreur à remonter.
 *
 * Renvoie de quoi la fermer.
 */
export function watchTexts(onVersion: (version: number) => void): () => void {
  let socket: WebSocket | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let closed = false;
  let delay = 1_000;

  const open = () => {
    if (closed) return;

    try {
      socket = new WebSocket(`${LEX_URL.replace(/^http/, 'ws')}/live`);
    } catch {
      // Même un constructeur qui échoue mérite une nouvelle tentative :
      // c'est en général l'absence de réseau au moment précis du montage.
      schedule();
      return;
    }

    socket.onopen = () => {
      // Seule une connexion réellement ouverte remet le compteur à zéro.
      // Sinon un serveur qui accepte puis raccroche serait harcelé une fois
      // par seconde, indéfiniment.
      delay = 1_000;
    };

    socket.onmessage = (event) => {
      try {
        const update = JSON.parse(String(event.data)) as { v?: number };
        if (typeof update.v === 'number') onVersion(update.v);
      } catch {
        // Un message illisible ne justifie pas de fermer la connexion.
      }
    };

    socket.onclose = () => schedule();
    socket.onerror = () => socket?.close();
  };

  const schedule = () => {
    if (closed || timer) return;
    timer = setTimeout(() => {
      timer = null;
      open();
    }, delay);
    delay = Math.min(delay * 2, 60_000);
  };

  open();

  return () => {
    closed = true;
    if (timer) clearTimeout(timer);
    timer = null;
    socket?.close();
    socket = null;
  };
}

/**
 * Regroupe les clés d'un joker en entrées ordonnées.
 *
 * L'écran demande `nouveautes.entree.*` : le serveur renvoie tout ce qui
 * existe sous ce préfixe, sans que l'app sache combien il y en a. Ajouter
 * une annonce dans le panneau la fait apparaître ici — sans build, sans
 * store, sans mise à jour.
 *
 * Les clés se lisent `<préfixe>.<numéro>.<champ>`. Le numéro croît avec le
 * temps : une nouvelle entrée prend le suivant, et se retrouve en tête. Il
 * laisse aussi glisser une entrée entre deux autres sans les renommer.
 */
export function groupEntries(
  text: Record<string, string>,
  prefix: string,
  fields: readonly string[],
): Array<Record<string, string>> {
  const groups = new Map<string, Record<string, string>>();

  for (const [key, value] of Object.entries(text)) {
    if (!key.startsWith(`${prefix}.`)) continue;

    const rest = key.slice(prefix.length + 1);
    const cut = rest.lastIndexOf('.');
    if (cut < 1) continue;

    const id = rest.slice(0, cut);
    const field = rest.slice(cut + 1);
    if (!fields.includes(field)) continue;

    if (!groups.has(id)) groups.set(id, {});
    groups.get(id)![field] = value;
  }

  return [...groups.entries()]
    .sort(([left], [right]) => right.localeCompare(left, undefined, { numeric: true }))
    .map(([, entry]) => entry);
}

export default { fetchTexts, watchTexts, groupEntries, LEX_URL };
