/**
 * Les scènes animées de la mascotte Ninf, servies par le VPS.
 *
 * Ce sont des pages HTML autonomes (CSS + SVG, aucun moteur de jeu), montées
 * par l'API sur `/anim` — voir le bloc `express.static` de `api/src/server.js`.
 * L'app ne les embarque pas : elles pèsent 1,4 Mo à elles toutes, elles évoluent
 * au rythme du design et pas à celui des builds, et l'app n'est sur aucun store
 * — un visuel corrigé mettrait des semaines à atteindre les appareils s'il
 * fallait republier pour ça.
 *
 * Contrepartie assumée : sans réseau, il n'y a pas d'animation. Tout ce qui
 * l'affiche doit donc rester lisible sans elle (voir `SceneCanvas`).
 */
import { API_CONFIG } from './api';
import { resolveServerUrl } from './serverUrl';

export type SceneName =
  | '01-chambre'
  | '02-pluie'
  | '03-atelier'
  | '04-couvertures'
  | '05-feu-de-camp';

/**
 * Racine des scènes.
 *
 * `EXPO_PUBLIC_SCENES_URL` n'existe que pour pointer une machine de dev pendant
 * qu'on retouche une scène ; en production, elles vivent avec l'API et suivent
 * donc automatiquement `EXPO_PUBLIC_API_URL`.
 *
 * Passe par le même assainisseur que `API_URL`/`STREAM_SERVER` (HTTPS
 * obligatoire hors localhost, aucun identifiant intégré à l'URL) — voir
 * AUDIT-S2.md : c'était la seule des six variables `EXPO_PUBLIC_*` à
 * contourner cette vérification. Silencieux quand la variable est absente,
 * contrairement à `resolveServerUrl` seul : ce n'est pas un mode dégradé, la
 * grande majorité des builds ne la renseigne jamais.
 */
const rawOverride = process.env.EXPO_PUBLIC_SCENES_URL?.trim();
const resolvedOverride = rawOverride
  ? resolveServerUrl(rawOverride, 'EXPO_PUBLIC_SCENES_URL', '', () => {})
  : null;
const override = resolvedOverride?.configured ? resolvedOverride.url : undefined;

export const SCENES_ORIGIN = override || `${API_CONFIG.BASE_URL}/anim`;

/**
 * `?plein` fait passer la page du format maquette (une scène 4/5 centrée sur
 * un fond de démonstration) au plein cadre — voir `html.plein` dans
 * `scenes/scene.css`. Sans lui, la scène s'afficherait en vignette au milieu
 * de la vue.
 */
/**
 * Empreinte des pages, à incrémenter dès qu'une scène est retouchée.
 *
 * L'API sert les pages en `no-cache`, donc en régime normal ce numéro ne sert
 * à rien. Il existe pour les appareils qui ont chargé une scène AVANT ce
 * réglage : leur entrée de cache portait un `max-age` d'un mois, et rien ne les
 * fera redemander la page avant. Changer l'URL est le seul moyen de les
 * rattraper — un en-tête corrigé n'atteint jamais celui qui ne redemande rien.
 */
export const SCENES_VERSION = '2';

export const sceneUrl = (name: SceneName) =>
  `${SCENES_ORIGIN}/scenes/${name}.html?plein=1&v=${SCENES_VERSION}`;

/**
 * L'origine au sens du web : schéma + hôte, SANS chemin.
 *
 * `originWhitelist` de `react-native-webview` attend des origines, pas des
 * préfixes d'URL — et sa règle est brutale : tout ce qui ne correspond pas est
 * confié au système, donc ouvert dans le navigateur du téléphone. Y passer
 * `https://…/anim` faisait échouer la correspondance sur la page elle-même :
 * au lieu de s'afficher dans l'écran, la scène s'ouvrait dans Chrome.
 *
 * Découpé à la main plutôt qu'avec `new URL()` : l'implémentation de `URL`
 * fournie par React Native est partielle et n'expose pas `protocol`/`host` de
 * façon fiable selon les versions.
 */
export const SCENES_WEB_ORIGIN = /^(https?:\/\/[^/]+)/i.exec(SCENES_ORIGIN)?.[1] ?? SCENES_ORIGIN;

/** Vrai seulement si l'adresse de l'API a été renseignée (voir `.env.example`). */
export const SCENES_AVAILABLE = API_CONFIG.IS_CONFIGURED || !!override;
