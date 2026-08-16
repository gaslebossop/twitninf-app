/**
 * Une scène animée de la mascotte, jouée dans une WebView qu'on ne doit
 * jamais reconnaître comme telle.
 *
 * ── Pourquoi une WebView ──
 * Les scènes sont des pages CSS/SVG écrites et réglées dans le dossier de
 * design (`splashscreen/scenes`). Les réécrire en Reanimated, c'est les tenir
 * en double et voir les deux versions diverger au premier ajustement. Ici la
 * page servie EST celle qui a été validée, au pixel.
 *
 * Le compositeur du moteur web anime `opacity`, `transform`, les masques et les
 * dégradés sur le GPU, sans repasser par le thread JS de React Native : une
 * boucle de neuf secondes n'y coûte rien, et rien ne peut la faire sauter — pas
 * même un rendu React au mauvais moment.
 *
 * ── Ce qui trahirait une page web, et qui est neutralisé ici ──
 * Le flash blanc avant le premier rendu, le rebond élastique en fin de geste,
 * la sélection de texte à l'appui long, la mise à l'échelle du texte système,
 * et la scène qui s'assemble à vue. Les quatre premiers par les props
 * ci-dessous ; le dernier par le fondu, qui n'a lieu qu'une fois le personnage
 * réellement posé dans la page.
 *
 * ── Ce composant ne garantit rien ──
 * Sans réseau, il ne peint que le fond. Il ne doit donc jamais porter une
 * information : c'est un décor, et tout ce qui se lit doit être écrit
 * par-dessus, en React Native.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Easing, Platform, StyleSheet, View, ViewStyle, StyleProp } from 'react-native';
import { WebView } from 'react-native-webview';

import {
  SCENES_AVAILABLE,
  SCENES_ORIGIN,
  SCENES_WEB_ORIGIN,
  sceneUrl,
  type SceneName,
} from '../config/scenes';
import { duration } from '../theme';

/**
 * Ce que la page nous dit d'elle-même.
 *
 * `onLoadEnd` ne suffit pas : il se déclenche quand le document est chargé,
 * alors que la scène va encore chercher le SVG du personnage (800 Ko) et le
 * poser dans le DOM. Se fier à lui laisserait voir un décor vide pendant une
 * demi-seconde, puis la mascotte apparaître d'un coup — exactement l'« état
 * intermédiaire visible » qu'on s'interdit.
 *
 * On attend donc que la PAGE se déclare prête, en posant `.prete` sur sa
 * scène. C'est elle qui sait : elle attend d'avoir le personnage dessiné, son
 * masque d'éclairage chargé (un second fichier de 500 Ko) et ses particules
 * semées. Guetter `.perso svg` depuis ici ne marchait pas — l'élément existe
 * dès l'insertion, donc on dévoilait le décor avant la mascotte.
 *
 * Le garde-fou existe parce que ce signal peut ne JAMAIS arriver : une CSP qui
 * bloque le script de la page, un fichier introuvable, et la sonde attend pour
 * rien pendant que la vue reste à `opacity: 0` — invisible, sans la moindre
 * erreur. Passé le délai on dévoile quand même.
 */
const READY_PROBE = `(function () {
  var depart = Date.now();
  var dire = function (etat) {
    if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(etat);
  };
  var attendre = function () {
    if (document.querySelector('.scene.prete')) return dire('prete');
    if (Date.now() - depart > 4500) return dire('partielle');
    requestAnimationFrame(attendre);
  };
  attendre();
})();
true;`;

/**
 * Delai au bout duquel on cesse d'attendre la scene, quoi qu'il arrive.
 *
 * La sonde vit DANS la page : si la page ne charge jamais — reseau coupe au
 * milieu, resolution DNS qui traine, serveur muet — elle ne s'execute pas et
 * personne ne previent. Sans ce plafond, un ecran qui attend le decor
 * attendrait indefiniment, et c'est bien pire que de le voir arriver en
 * retard.
 */
const LIMITE_MS = 5000;

interface SceneCanvasProps {
  scene: SceneName;
  /**
   * Fausse la lecture quand la scène n'est pas à l'écran : la WebView est
   * démontée, pas seulement masquée. Une page qui anime en continu derrière un
   * écran fermé consomme de la batterie pour rien.
   */
  active?: boolean;
  style?: StyleProp<ViewStyle>;
  /** Prévient quand le décor est là — sert à retarder ce qui se pose dessus. */
  onReady?: () => void;
  /**
   * Prévient quand il n'y a PLUS RIEN à attendre : décor posé, ou décor
   * définitivement absent (erreur, hors ligne, délai dépassé).
   *
   * C'est celui-ci qu'il faut écouter pour dévoiler un écran, jamais
   * `onReady` : une page qui n'arrive pas n'appelle jamais `onReady`, et
   * l'écran resterait en chargement pour toujours.
   */
  onSettled?: () => void;
}

export default function SceneCanvas({
  scene,
  active = true,
  style,
  onReady,
  onSettled,
}: SceneCanvasProps) {
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const fade = useRef(new Animated.Value(0)).current;

  /* Gardés en référence : ces fonctions sont souvent recréées à chaque rendu
     du parent, et les mettre en dépendance relancerait le compte à rebours. */
  const rappels = useRef({ onReady, onSettled });
  rappels.current = { onReady, onSettled };

  /* Une fois posé, on ne revient pas dessus : prévenir deux fois ferait
     rejouer l'entrée de l'écran qui nous écoute. */
  const regle = useRef(false);
  const poser = useCallback(() => {
    if (regle.current) return;
    regle.current = true;
    rappels.current.onSettled?.();
  }, []);

  /* Rien à attendre du tout : pas d'adresse de serveur, ou la page a échoué.
     Le dire tout de suite, sinon l'écran attend un décor qui ne viendra pas. */
  useEffect(() => {
    if (!active) return;
    if (!SCENES_AVAILABLE || failed) poser();
  }, [active, failed, poser]);

  useEffect(() => {
    if (!active) return;
    const t = setTimeout(poser, LIMITE_MS);
    return () => clearTimeout(t);
  }, [active, poser]);

  useEffect(() => {
    if (!ready) return;
    Animated.timing(fade, {
      toValue: 1,
      duration: duration.slow,
      // Décélération franche, jamais de ressort : c'est la courbe de l'app.
      easing: Easing.bezier(0.16, 1, 0.3, 1),
      useNativeDriver: true,
    }).start();
    rappels.current.onReady?.();
    poser();
  }, [ready, fade, poser]);

  useEffect(() => {
    if (!active) {
      setReady(false);
      setFailed(false);
      regle.current = false;
      fade.setValue(0);
    }
  }, [active, fade]);

  const handleMessage = useCallback(() => setReady(true), []);

  /**
   * Rien ne navigue depuis cette page.
   *
   * Elle ne contient aucun lien, mais une page qui aurait été altérée en cours
   * de route ne doit pas pouvoir emmener l'utilisateur ailleurs — encore moins
   * dans une vue plein écran sans barre d'adresse.
   *
   * C'est ICI que se fait le filtrage par chemin, et pas dans `originWhitelist`
   * qui ne comprend que des origines : refuser renvoie `false` et la requête
   * meurt. `originWhitelist`, lui, CONFIE au système ce qu'il ne reconnaît pas
   * — et le système ouvre le navigateur du téléphone.
   */
  const blockNavigation = useCallback(
    (request: { url: string }) => request.url.startsWith(SCENES_ORIGIN),
    [],
  );

  return (
    <View style={[styles.root, style]} pointerEvents="none">
      {active && SCENES_AVAILABLE && !failed ? (
        <Animated.View style={[StyleSheet.absoluteFill, { opacity: fade }]}>
          <WebView
            source={{ uri: sceneUrl(scene) }}
            // Transparente des DEUX cotes, sinon elle pose un rectangle sur
            // l'ecran : la page rend son fond transparent en mode `?plein`
            // (voir `html.plein` dans scene.css), et la vue native doit suivre.
            // Sur iOS `backgroundColor` ne suffit pas, il faut aussi `opaque:
            // false` — les deux existent sur la vue native mais sont absents
            // des types de la 13.15.0, d'ou le style pour l'un et la
            // conversion pour l'autre.
            style={styles.web}
            {...({ opaque: false } as object)}
            injectedJavaScript={READY_PROBE}
            onMessage={handleMessage}
            onError={() => setFailed(true)}
            onHttpError={() => setFailed(true)}
            onShouldStartLoadWithRequest={blockNavigation}
            // ── Effacer la « page web » ──
            scrollEnabled={false}
            bounces={false}
            overScrollMode="never"
            showsVerticalScrollIndicator={false}
            showsHorizontalScrollIndicator={false}
            allowsLinkPreview={false}
            // Aucun indicateur : la page se dévoile par le fondu ci-dessus.
            startInLoadingState={false}
            setSupportMultipleWindows={false}
            javaScriptCanOpenWindowsAutomatically={false}
            // Un mois de cache côté serveur ; encore faut-il l'utiliser.
            cacheEnabled
            // Les animations doivent être compositées par le GPU, sinon la
            // boucle saccade sur Android.
            androidLayerType="hardware"
            // Une illustration ne suit pas la taille de texte du système : la
            // scène se retrouverait à une échelle qui n'est plus celle de la vue.
            textZoom={100}
            automaticallyAdjustContentInsets={false}
            contentInsetAdjustmentBehavior="never"
            // L'ORIGINE, jamais l'URL avec son chemin : ce qui ne correspond
            // pas ici part dans le navigateur du téléphone (voir
            // `SCENES_WEB_ORIGIN`). Le filtrage fin est fait plus haut, par
            // `onShouldStartLoadWithRequest`, qui lui sait refuser.
            originWhitelist={[SCENES_WEB_ORIGIN]}
            mixedContentMode="never"
            {...(Platform.OS === 'ios' ? { allowsBackForwardNavigationGestures: false } : null)}
          />
        </Animated.View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFillObject,
    // Aucun fond : ce que l'ecran a derriere doit passer au travers. C'est ce
    // qui evite la « vignette posee sur la page » et fait que la scene
    // appartient a l'ecran au lieu de flotter dessus.
    backgroundColor: 'transparent',
    overflow: 'hidden',
  },
  web: {
    flex: 1,
    backgroundColor: 'transparent',
  },
});

/**
 * L'attente du décor, du côté de l'écran qui l'affiche.
 *
 * `pret` reste faux tant qu'il y a quelque chose à attendre. À brancher sur
 * `onSettled` — et surtout pas sur `onReady`, voir le commentaire de la prop.
 */
export function useSceneReveal(active: boolean = true) {
  const [pret, setPret] = useState(false);
  const onSettled = useCallback(() => setPret(true), []);

  useEffect(() => {
    if (!active) setPret(false);
  }, [active]);

  return { pret, onSettled };
}

/**
 * Fait entrer d'un bloc ce qui attendait la scène.
 *
 * Sans ça, l'écran s'affiche d'abord et le décor apparaît par-dessus une
 * demi-seconde plus tard : on ne lit pas une page qui se charge, on lit un
 * élément qui « spawn ». Les deux arrivent donc ensemble, en un seul fondu.
 */
export function SceneReveal({
  visible,
  style,
  children,
}: {
  visible: boolean;
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
}) {
  const fade = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!visible) {
      fade.setValue(0);
      return;
    }
    Animated.timing(fade, {
      toValue: 1,
      duration: duration.base,
      easing: Easing.bezier(0.16, 1, 0.3, 1),
      useNativeDriver: true,
    }).start();
  }, [visible, fade]);

  return (
    <Animated.View
      style={[style, { opacity: fade }]}
      // Une vue a `opacity: 0` recoit quand meme les touches sous React
      // Native : sans ca, on peut appuyer sur un bouton invisible pendant le
      // chargement, et l'ecran repond a un geste que personne n'a vu faire.
      pointerEvents={visible ? 'auto' : 'none'}
    >
      {children}
    </Animated.View>
  );
}
