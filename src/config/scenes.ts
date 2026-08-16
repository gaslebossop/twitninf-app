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
 */
const override = process.env.EXPO_PUBLIC_SCENES_URL?.trim().replace(/\/+$/, '');

export const SCENES_ORIGIN = override || `${API_CONFIG.BASE_URL}/anim`;

/**
 * `?plein` fait passer la page du format maquette (une scène 4/5 centrée sur
 * un fond de démonstration) au plein cadre — voir `html.plein` dans
 * `scenes/scene.css`. Sans lui, la scène s'afficherait en vignette au milieu
 * de la vue.
 */
export const sceneUrl = (name: SceneName) => `${SCENES_ORIGIN}/scenes/${name}.html?plein=1`;

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
