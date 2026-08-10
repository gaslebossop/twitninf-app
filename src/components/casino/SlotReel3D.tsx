import React, { useEffect, useRef } from 'react';
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { GLView, ExpoWebGLRenderingContext } from 'expo-gl';
import { Renderer, loadAsync } from 'expo-three';
import * as THREE from 'three';

/**
 * Un rouleau de machine à sous, en vrai tambour 3D.
 *
 * Ce que ça remplace : une colonne de `<Text>` qui glisse verticalement. Le
 * défaut de cette version-là n'est pas le manque de relief, c'est que les
 * symboles gardent la même taille du haut en bas de la fenêtre — l'œil lit un
 * texte qui coulisse, pas un objet qui tourne. Ici les symboles s'inclinent et
 * disparaissent par le haut, ce qui suffit à faire exister le tambour.
 *
 * Le tambour est un polygone à 16 faces, une par case de la bande
 * (`assets/casino/reel-strip.png`, générée par `scripts/build-reel-atlas.py`).
 * Pas de cylindre à texture enroulée : avec des faces explicites, « la case i
 * est devant » s'écrit exactement, sans constante de calage à régler à l'œil.
 *
 * Le résultat reste décidé par le serveur. Ce composant ne tire rien au sort :
 * il reçoit la case sur laquelle s'arrêter et va l'y chercher.
 */

const CELLS = 16;
const STEP = (Math.PI * 2) / CELLS;
/** Pas du tambour : la hauteur d'une case. Le rayon en découle. */
const PITCH = 1;
const RADIUS = PITCH / (2 * Math.sin(Math.PI / CELLS));
/**
 * Longueur du tambour. Un rouleau est LARGE : à 1 pour 1 on obtient un ruban.
 * 1.55 est le plus large qui tienne dans une fenêtre de 94 px sans rogner les
 * bords arrondis — or ce sont eux qui donnent le volume.
 */
const WIDTH = 1.55;
/** Segments par case — c'est ce qui rend l'arc lisse plutôt que facetté. */
const SEGMENTS = 6;
/** Nombre de cases cadrées en hauteur ; fixe la distance de caméra. */
const VISIBLE_CELLS = 2.7;
const FOV = 46;

/** Vitesses (rad/s) entre lesquelles le filé prend la place de l'image nette. */
const BLUR_FROM = 5;
const BLUR_TO = 26;

/** Ordre des symboles sur la bande — doit suivre `STRIP` du script Python. */
export const REEL_STRIP = [
  'cherry', 'lemon', 'cherry', 'bell',
  'star', 'cherry', 'lemon', 'diamond',
  'cherry', 'bell', 'lemon', 'star',
  'cherry', 'lemon', 'bell', 'seven',
] as const;

export type ReelSymbol = (typeof REEL_STRIP)[number];

/** Première case portant ce symbole, ou `null` si le serveur en envoie un inconnu. */
export function cellForSymbol(symbol: string): number | null {
  const index = REEL_STRIP.indexOf(symbol as ReelSymbol);
  return index < 0 ? null : index;
}

interface SlotReel3DProps {
  /** Case à afficher à l'arrêt (0-15). */
  targetCell: number;
  /** Changer cette valeur relance un tour ; la garder immobilise le rouleau. */
  spinKey: number;
  /** Durée du tour, en ms — c'est elle qui décale les trois rouleaux entre eux. */
  durationMs?: number;
  /** Vitesse de croisière visée, en tours par seconde. */
  turnsPerSecond?: number;
  onSettled?: () => void;
  style?: StyleProp<ViewStyle>;
}

/** Montée en vitesse, en ms. */
const ACCEL_MS = 190;
/** Freinage, en ms. */
const DECEL_MS = 780;
/** Amplitude du recalage final, en radians (un peu moins d'un tiers de case). */
const SETTLE_RAD = 0.055;
const SETTLE_MS = 260;

interface Spin {
  running: boolean;
  start: number;
  from: number;
  /** Angle total à parcourir, en valeur absolue. */
  total: number;
  accel: number;
  cruise: number;
  decel: number;
  /** Vitesse de croisière, rad/s. */
  omega: number;
}

/**
 * Position angulaire parcourue au temps `e` (ms).
 *
 * Trois temps, et c'est le temps du milieu qui compte : un tambour qui atteint
 * sa vitesse maximale à la première image et décélère ensuite fait ses tours
 * trop vite pour être vu — il ne reste qu'un éclair puis un long glissement.
 * En tenant une vitesse constante pendant l'essentiel de la durée, on VOIT le
 * rouleau tourner, ce qui est tout l'intérêt de l'avoir mis en volume.
 */
function travelled(spin: Spin, e: number): number {
  const { omega, accel, cruise, decel } = spin;
  if (e <= 0) return 0;
  if (e < accel) return (omega * e * e) / (2 * accel * 1000);
  const aDist = (omega * accel) / 2000;
  if (e < accel + cruise) return aDist + (omega * (e - accel)) / 1000;
  const cDist = aDist + (omega * cruise) / 1000;
  if (e < accel + cruise + decel) {
    const u = (e - accel - cruise) / decel;
    // Cubique sortante : sa vitesse initiale vaut exactement 3×(distance/durée),
    // d'où le tiers ci-dessous — c'est ce qui raccorde le freinage à la vitesse
    // de croisière sans à-coup.
    return cDist + ((omega * decel) / 3000) * (1 - Math.pow(1 - u, 3));
  }
  return spin.total;
}

/**
 * Géométrie d'une case : un SECTEUR DE CYLINDRE, pas un plan.
 *
 * Seize plans forment une boîte à seize pans — les arêtes se voient et l'objet
 * se lit comme anguleux, pas comme un tambour. Chaque case est donc courbée sur
 * l'arc qui lui revient.
 *
 * Les 16 cases partagent UNE texture et UN matériau : la fenêtre de la case est
 * gravée dans les UV. Donner à chaque face un `texture.clone()` avec son propre
 * `offset` fonctionne sur un navigateur mais laisse des faces sans image dès que
 * le clone n'est pas réenvoyé au GPU — un tambour blanc, sans erreur.
 */
function cellGeometry(cell: number): THREE.BufferGeometry {
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  // `flipY` est actif : la case 0, en HAUT de l'image, est en haut des UV.
  const vBottom = 1 - (cell + 1) / CELLS;
  const vTop = 1 - cell / CELLS;
  const halfW = WIDTH / 2;

  for (let k = 0; k <= SEGMENTS; k += 1) {
    const t = k / SEGMENTS;
    const angle = -STEP / 2 + t * STEP;
    const y = RADIUS * Math.sin(angle);
    const z = RADIUS * Math.cos(angle);
    const v = vBottom + t * (vTop - vBottom);
    positions.push(-halfW, y, z); uvs.push(0, v);
    positions.push(halfW, y, z); uvs.push(1, v);
  }
  for (let k = 0; k < SEGMENTS; k += 1) {
    const a0 = k * 2, a1 = k * 2 + 1, b0 = (k + 1) * 2, b1 = (k + 1) * 2 + 1;
    // Sens horaire vu de l'extérieur : dans l'autre sens les normales pointent
    // vers l'axe et tout le tambour disparaît, éliminé par le culling.
    indices.push(a0, b1, b0, a0, a1, b1);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

export default function SlotReel3D({
  targetCell,
  spinKey,
  durationMs = 1600,
  turnsPerSecond = 3.4,
  onSettled,
  style,
}: SlotReel3DProps) {
  const drumRef = useRef<THREE.Group | null>(null);
  // L'animation vit dans une ref, pas dans un state : la boucle de rendu tourne
  // à 60 fps et ne doit provoquer aucun rendu React.
  const spinRef = useRef<Spin>({
    running: false, start: 0, from: 0, total: 0, accel: 0, cruise: 0, decel: 0, omega: 0,
  });
  const settledRef = useRef(onSettled);
  settledRef.current = onSettled;

  // Angle à donner au tambour pour amener la case `i` face à la caméra.
  const angleFor = (cell: number) => -cell * STEP;

  useEffect(() => {
    const drum = drumRef.current;
    if (!drum) return;
    // Le premier montage place la case sans animation : un rouleau qui se
    // lance tout seul à l'ouverture de l'écran ferait diversion.
    if (spinKey === 0) {
      drum.rotation.x = angleFor(targetCell);
      return;
    }
    const from = drum.rotation.x;
    // La cible est ramenée SOUS l'angle courant, puis on ajoute les tours
    // complets : sans ce recalage, un rouleau déjà proche de sa cible ne
    // parcourait presque rien et paraissait sauter au lieu de tourner.
    const target = angleFor(targetCell);
    let delta = (from - target) % (Math.PI * 2);
    if (delta < 0) delta += Math.PI * 2;
    const accel = ACCEL_MS;
    const decel = DECEL_MS;
    const cruise = Math.max(220, durationMs - accel - decel);
    const weighted = accel / 2000 + cruise / 1000 + decel / 3000;

    // Les trois rouleaux doivent tourner à la MÊME vitesse et se distinguer par
    // leur instant d'arrêt — c'est ainsi que tourne une vraie machine. On part
    // donc de la vitesse voulue, on en déduit le nombre de tours entiers qui
    // tient dans la durée, puis on réajuste la vitesse pour tomber pile sur la
    // case. Fixer les tours à la place donnait un premier rouleau à près de six
    // tours par seconde et un dernier à trois.
    const wanted = turnsPerSecond * Math.PI * 2 * weighted;
    const laps = Math.max(2, Math.round((wanted - delta) / (Math.PI * 2)));
    const total = delta + laps * Math.PI * 2;
    const omega = total / weighted;

    spinRef.current = {
      running: true, start: Date.now(), from, total, accel, cruise, decel, omega,
    };
  }, [spinKey, targetCell, durationMs, turnsPerSecond]);

  const onContextCreate = async (gl: ExpoWebGLRenderingContext) => {
    // Les typages d'expo-gl n'exposent pas ces deux champs, présents à
    // l'exécution : ce sont les dimensions réelles du tampon, en pixels
    // physiques, seule base correcte pour le ratio de la caméra.
    const { drawingBufferWidth: width, drawingBufferHeight: height } =
      gl as unknown as { drawingBufferWidth: number; drawingBufferHeight: number };

    const renderer = new Renderer({ gl });
    renderer.setSize(width, height);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    // Sans compression des hautes lumières, la case du haut part en blanc pur
    // et perd son symbole.
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    // Fond transparent : le rouleau doit se poser sur le décor du casino,
    // pas sur un rectangle noir collé par-dessus.
    renderer.setClearColor(0x000000, 0);

    const scene = new THREE.Scene();
    // Distance calée pour cadrer exactement VISIBLE_CELLS cases de haut, et
    // focale large : à 28° le rendu est quasi orthographique, donc plat.
    const distance = (VISIBLE_CELLS * PITCH / 2) / Math.tan((FOV * Math.PI) / 360) + RADIUS;
    const camera = new THREE.PerspectiveCamera(FOV, width / height, 0.1, 100);
    camera.position.set(0, 0, distance);
    camera.lookAt(0, 0, 0);

    // Ambiante basse et clé forte : c'est l'écart entre les deux qui dessine la
    // courbure. Une ambiante haute aplatit le tambour en autocollant.
    scene.add(new THREE.AmbientLight(0xffffff, 0.5));
    const key = new THREE.DirectionalLight(0xfff1d8, 2.0);
    key.position.set(-1.2, 3.5, 2.2);
    scene.add(key);
    const rim = new THREE.DirectionalLight(0x9ec7ff, 0.3);
    rim.position.set(1.5, -2.5, 1.2);
    scene.add(rim);

    const [sharpMap, blurMap] = await Promise.all([
      loadAsync(require('../../../assets/casino/reel-strip.png')),
      loadAsync(require('../../../assets/casino/reel-strip-blur.png')),
    ]);
    const maxAnisotropy = renderer.capabilities.getMaxAnisotropy();
    for (const map of [sharpMap, blurMap]) {
      map.colorSpace = THREE.SRGBColorSpace;
      map.anisotropy = Math.min(8, maxAnisotropy);
      // Explicite, et pas « par défaut » : c'est l'orientation supposée par
      // `bakeCellUVs`, et les chargeurs d'images natifs ne la garantissent pas.
      map.flipY = true;
      map.needsUpdate = true;
    }

    const sharpMaterial = new THREE.MeshStandardMaterial({
      map: sharpMap, roughness: 0.55, metalness: 0.02,
    });
    // La couche filée est posée par-dessus la nette et son opacité suit la
    // vitesse. `depthWrite` désactivé : sans ça elle masquerait les faces
    // voisines au lieu de se fondre avec.
    const blurMaterial = new THREE.MeshStandardMaterial({
      map: blurMap, roughness: 0.55, metalness: 0.02,
      transparent: true, opacity: 0, depthWrite: false,
    });

    const drum = new THREE.Group();

    // Corps plein à l'intérieur des 16 faces.
    //
    // Sans lui le tambour est une couronne creuse de plans à face unique : dès
    // qu'une face part de profil elle cesse d'être dessinée, et on voit à
    // travers le rouleau jusqu'au décor. C'est ce qui empêche de lire un objet
    // entier qui tourne. Le cylindre est légèrement plus étroit que le rayon
    // des faces (rayon inscrit) pour rester caché derrière elles.
    const coreRadius = RADIUS * Math.cos(Math.PI / CELLS) * 0.995;
    const core = new THREE.Mesh(
      new THREE.CylinderGeometry(coreRadius, coreRadius, WIDTH, CELLS * 2),
      new THREE.MeshStandardMaterial({ color: 0x241d15, roughness: 0.9, metalness: 0.1 }),
    );
    // L'axe d'un cylindre three est Y ; celui du tambour est X.
    core.rotation.z = Math.PI / 2;
    drum.add(core);

    for (let i = 0; i < CELLS; i += 1) {
      const geometry = cellGeometry(i);
      const sharp = new THREE.Mesh(geometry, sharpMaterial);
      const blurred = new THREE.Mesh(geometry, blurMaterial);
      // Légèrement dilatée plutôt que décalée : sur une surface courbe, un
      // décalage en z creuserait la couche filée dans le tambour sur les bords.
      blurred.scale.setScalar(1.002);

      // Chaque case est portée par un pivot : le pivot l'oriente sur son arc,
      // la géométrie est déjà courbée autour de l'axe.
      const pivot = new THREE.Group();
      pivot.rotation.x = i * STEP;
      pivot.add(sharp);
      pivot.add(blurred);
      drum.add(pivot);
    }

    drum.rotation.x = angleFor(targetCell);
    drumRef.current = drum;
    scene.add(drum);

    let lastAngle = drum.rotation.x;
    let lastTime = Date.now();

    const render = () => {
      requestAnimationFrame(render);

      const now = Date.now();
      const spin = spinRef.current;
      if (spin.running) {
        const elapsed = now - spin.start;
        const full = spin.accel + spin.cruise + spin.decel;
        drum.rotation.x = spin.from - travelled(spin, elapsed);

        if (elapsed >= full) {
          // Recalage : le tambour dépasse d'un cheveu puis revient sur son
          // cran, en s'amortissant. C'est court et discret — mais un arrêt
          // parfaitement net donne un objet sans masse.
          const settleElapsed = elapsed - full;
          if (settleElapsed < SETTLE_MS) {
            const u = settleElapsed / SETTLE_MS;
            drum.rotation.x -= SETTLE_RAD * Math.sin(u * Math.PI * 2) * (1 - u);
          } else {
            spin.running = false;
            drum.rotation.x = spin.from - spin.total;
            settledRef.current?.();
          }
        }
      }

      // Le filé est piloté par la vitesse réellement observée, pas par une
      // courbe théorique : il reste juste même si l'appareil saute des images.
      const dt = Math.max(1, now - lastTime) / 1000;
      const speed = Math.abs(drum.rotation.x - lastAngle) / dt;
      lastAngle = drum.rotation.x;
      lastTime = now;
      blurMaterial.opacity = Math.min(1, Math.max(0, (speed - BLUR_FROM) / (BLUR_TO - BLUR_FROM)));

      renderer.render(scene, camera);
      gl.endFrameEXP();
    };
    render();
  };

  return (
    <View style={[styles.container, style]}>
      <GLView style={StyleSheet.absoluteFill} onContextCreate={onContextCreate} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    overflow: 'hidden',
  },
});
