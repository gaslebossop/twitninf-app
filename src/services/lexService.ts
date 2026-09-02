import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { connectLive, createClient, groupEntries } from '../vendor/lex/index.js';
import type { LexClient, LexQuery } from '../vendor/lex/index.js';

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
 * ── Ce que ce fichier fait, et surtout ce qu'il ne fait pas ───────────────
 * Rien de ce qui est propre à Lex n'est écrit ici. Le cache, la
 * revalidation par ETag, la reconnexion du socket, le rendu des pluriels et
 * des tests A/B : tout cela vit dans `@lexlang/client`, testé dans son
 * propre dépôt. Ce fichier ne fait que le brancher sur React Native — le
 * stockage, la langue, la plateforme, l'identifiant — et adapter le
 * vocabulaire aux écrans.
 *
 * Une version antérieure réécrivait ici, à la main, ce que la bibliothèque
 * fait déjà. Elle en faisait moins et se serait décalée à la première
 * évolution du protocole. Le client embarqué se resynchronise avec
 * `node scripts/sync-lex-sdk.mjs` ; voir `src/vendor/lex/PROVENANCE.md`.
 *
 * ── Hors ligne ────────────────────────────────────────────────────────────
 * La dernière réponse reçue est gardée. Un métro, un avion, un serveur
 * qu'on redémarre : l'écran montre ce qu'il avait, jamais une page vide, et
 * `cached` lui permet de le dire au lieu de faire passer du vieux texte
 * pour du neuf.
 *
 * ── En direct ─────────────────────────────────────────────────────────────
 * Le serveur prévient quand le catalogue change : une correction faite dans
 * le panneau atteint l'écran ouvert en moins d'une seconde, sans que
 * personne ne tire pour rafraîchir. C'est la moitié de l'intérêt de Lex —
 * sans elle, un texte corrigé attend la prochaine ouverture de l'écran.
 */

/** Le serveur de textes. Public : il ne sert que du texte à lire. */
export const LEX_URL = 'https://lex.twitninf.fr';

/** L'identifiant de visiteur, pour les tests A/B. */
const VISITOR_KEY = 'lex.visitor';

/** Ce qu'un écran reçoit. */
export interface LexTexts {
  /** Les textes rendus, par clé. */
  text: Record<string, string>;
  /** La langue servie. */
  locale: string;
  /** La version du catalogue. */
  version: number;
  /** Vrai quand le serveur n'a pas répondu et que c'est le cache qui parle. */
  cached: boolean;
}

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
 * Le client, construit une seule fois.
 *
 * Il est asynchrone parce que l'identifiant de visiteur vit dans
 * `AsyncStorage`, et qu'un client sans identifiant ne donnerait pas deux
 * fois la même variante à la même personne. La promesse est mémorisée, pas
 * seulement le client : deux écrans qui démarrent ensemble n'en créent
 * qu'un, et ne lisent le stockage qu'une fois.
 */
let pending: Promise<LexClient> | null = null;

function client(): Promise<LexClient> {
  if (!pending) {
    pending = (async () =>
      createClient({
        url: LEX_URL,
        locale: deviceLanguage(),
        unit: await visitor(),
        platform: Platform.OS,
        // `AsyncStorage` est déjà l'interface que la bibliothèque demande :
        // lire une clé, en écrire une. Rien à adapter.
        storage: {
          get: (key) => AsyncStorage.getItem(key),
          set: (key, value) => AsyncStorage.setItem(key, value),
        },
      }))();
  }
  return pending;
}

/**
 * Demande les textes d'un écran.
 *
 * `hash` est l'identifiant que le panneau Lex donne à un écran. Il désigne
 * une liste de clés figée : le serveur n'exécute que ce qu'on lui a
 * déclaré, jamais une demande arbitraire venue du téléphone.
 *
 * Ne lève jamais. La bibliothèque sert d'elle-même ce qu'elle a gardé quand
 * le réseau manque ; elle ne lève que si elle n'a rien du tout, et l'écran
 * reçoit alors `null` et décide quoi montrer.
 */
export async function fetchTexts(hash: string): Promise<LexTexts | null> {
  // Un écran ne connaît que son empreinte : la liste des clés vit côté
  // serveur, et `keys` ne sert qu'au code généré par `lex codegen`.
  const query: LexQuery = { name: hash, hash, keys: [] };

  try {
    const result = await (await client()).query(query);
    return {
      text: result.text,
      locale: result.locale,
      version: result.version,
      cached: !result.fresh,
    };
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
 * Renvoie de quoi la fermer.
 */
export function watchTexts(onVersion: (version: number) => void): () => void {
  const live = connectLive({
    url: LEX_URL,
    onUpdate: (update) => onVersion(update.v),
  });

  return () => live.close();
}

/**
 * Regroupe les clés d'un joker en entrées ordonnées.
 *
 * Réexporté tel quel : la fonction est celle de la bibliothèque, avec ses
 * tests. Elle est ici pour qu'un écran n'ait qu'un import à faire.
 */
export { groupEntries };

/** Le client lui-même, pour un écran qui aurait besoin de plus que ceci. */
export { LEX_URL as url };

export default { fetchTexts, watchTexts, groupEntries, LEX_URL };
