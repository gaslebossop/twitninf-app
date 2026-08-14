import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  Pressable,
  Dimensions,
  Platform,
  Keyboard,
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useNavigation, useRoute } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Video from 'react-native-video';
import { fonts , colors} from '../theme';
import { displayNameFonts } from '../theme/fonts';
import {
  VIDEO_FILTERS,
  TEXT_COLORS,
  TEXT_SIZES,
  TEXT_SIZE_MIN,
  TEXT_SIZE_MAX,
  FRAME_HEIGHT,
  SIDE_MARGIN,
  BOX_PADDING_RATIO,
  filterById,
  wrapOverlayText,
  type VideoOverlay,
  type TextAlign,
} from '../utils/videoFilters';

/**
 * Édition d'une prise, entre la caméra et l'écran de légende.
 *
 * L'aperçu n'est pas une simulation : `react-native-video` applique un vrai
 * CIFilter, le même effet que celui que l'API reproduira en ffmpeg. Les textes,
 * eux, sont dessinés en React Native au-dessus de la vidéo — c'est le serveur
 * qui les incrustera au transcodage, pour ne pas réencoder deux fois.
 *
 * ⚠️ La vidéo reste montée en permanence, y compris pendant la saisie d'un
 * texte. Une première version remplaçait tout l'arbre par l'éditeur : on
 * écrivait alors sur un fond noir, sans voir la scène qu'on est justement en
 * train de légender.
 */

const TIKTOK_RED = '#FE2C55';
const { width: SCREEN_WIDTH } = Dimensions.get('window');

/**
 * Police des incrustations : la MÊME famille que celle dont dispose ffmpeg sur
 * le serveur (`Montserrat-Bold`). L'aperçu utilisait Inter, si bien que les
 * coupures de lignes et la largeur des mots ne correspondaient pas au rendu —
 * un texte qui tenait sur une ligne à l'écran passait à deux dans la vidéo.
 */
const OVERLAY_FONT = displayNameFonts.geometric;

/** Taille mesurée d'un texte, pour le positionner comme le fera ffmpeg. */
interface Measured { width: number; height: number; }

/**
 * Tolérance d'aimantation, en fraction du cadre.
 *
 * Assez large pour qu'on tombe sur le centre sans viser, assez étroite pour
 * qu'un texte délibérément décalé de peu ne soit pas ramené de force.
 */
const SNAP_TOLERANCE = 0.045;

/** Repères affichés pendant un glissement. */
interface Guides { x: boolean; y: boolean; }

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
const clampSize = (value: number) => Math.min(TEXT_SIZE_MAX, Math.max(TEXT_SIZE_MIN, value));

/**
 * Un texte posé sur la vidéo, déplaçable et redimensionnable au doigt.
 *
 * Le placement reproduit la formule de ffmpeg — `x=(w-text_w)*fx` — ce qui
 * demande de connaître la largeur RÉELLE du texte. D'où la mesure par
 * `onLayout` : une version précédente combinait `left: x%` et un
 * `translateX` négatif proportionnel, or les deux s'annulaient exactement et
 * le texte ne bougeait jamais horizontalement.
 *
 * ⚠️ Tout ce que le geste consulte passe par des refs, et les gestes ne sont
 * créés qu'une fois. Les faire dépendre de `overlay.x`/`overlay.y` les
 * reconstruirait à chaque image du glissement : le nouvel exemplaire repartirait
 * d'une translation nulle, donc le texte reviendrait sur sa position de départ
 * à chaque frame et paraîtrait cloué au centre.
 *
 * ── Pourquoi `runOnJS(true)` sur ces gestes ───────────────────────────────
 * Ailleurs dans l'app, les gestes tournent en worklet sur le thread UI. Pas
 * ici, et c'est délibéré : la position de l'incrustation vit dans l'état React
 * (c'est elle qu'on rend à ffmpeg à l'export), donc chaque déplacement doit de
 * toute façon repasser par React. Un worklet ne ferait qu'ajouter un
 * aller-retour — et il lirait une COPIE figée des refs ci-dessus, ce qui
 * casserait tout silencieusement.
 *
 * Ce qu'on gagne malgré tout à quitter `PanResponder` : la reconnaissance
 * devient native. Le pincement est un vrai `Gesture.Pinch` (plus de comptage
 * de doigts ni de recalage du centroïde à la main), le tap est un vrai
 * `Gesture.Tap` (plus de drapeau `moved`), et `blocksExternalGesture` empêche
 * proprement le geste de retour de la pile d'attraper un glissement
 * horizontal — ce que les 2 px de seuil ne faisaient qu'atténuer.
 */
function DraggableOverlay({
  overlay,
  frame,
  measured,
  onMeasure,
  onMove,
  onResize,
  onPress,
  onGuides,
}: {
  overlay: VideoOverlay;
  frame: { width: number; height: number };
  measured?: Measured;
  onMeasure: (id: string, size: Measured) => void;
  onMove: (id: string, x: number, y: number) => void;
  onResize: (id: string, size: number) => void;
  onPress: (overlay: VideoOverlay) => void;
  onGuides: (guides: Guides) => void;
}) {
  const id = overlay.id;
  const freeWidth = Math.max(1, frame.width - (measured?.width ?? 0));
  const freeHeight = Math.max(1, frame.height - (measured?.height ?? 0));

  // Photo de l'état courant, relue par le geste. Un geste ne peut commencer
  // qu'après une image affichée : l'effet est donc toujours à jour à temps.
  // `overlay` change d'identité à chaque déplacement — le lire par cette ref
  // est ce qui permet de garder le responder hors de ses dépendances.
  const live = useRef({ overlay, freeWidth, freeHeight });
  useEffect(() => {
    live.current = { overlay, freeWidth, freeHeight };
  }, [overlay, freeWidth, freeHeight]);

  /** Position et taille au moment où le geste a commencé. */
  const from = useRef({ x: 0, y: 0, size: 0 });

  const composed = useMemo(() => {
    const pan = Gesture.Pan()
      .runOnJS(true)
      // Le pincement, lui, se charge du redimensionnement : deux doigts ne
      // doivent pas AUSSI déplacer le texte, sinon il fuit sous les doigts.
      .maxPointers(1)
      .minDistance(2)
      .onStart(() => {
        from.current = {
          x: live.current.overlay.x,
          y: live.current.overlay.y,
          size: live.current.overlay.size,
        };
      })
      .onUpdate((event) => {
        let nextX = clamp01(from.current.x + event.translationX / live.current.freeWidth);
        let nextY = clamp01(from.current.y + event.translationY / live.current.freeHeight);

        // Aimantation au centre, comme sur TikTok : on colle à 0.5 et on
        // montre le repère correspondant. Sans aimantation, viser le centre
        // exact au doigt est impossible — on finit toujours à un ou deux
        // pixels près, ce qui se voit sur un texte centré.
        const onX = Math.abs(nextX - 0.5) < SNAP_TOLERANCE;
        const onY = Math.abs(nextY - 0.5) < SNAP_TOLERANCE;
        if (onX) nextX = 0.5;
        if (onY) nextY = 0.5;

        onGuides({ x: onX, y: onY });
        onMove(id, nextX, nextY);
      })
      .onFinalize(() => onGuides({ x: false, y: false }));

    // `Gesture.Pinch` donne `scale` directement, relatif au début du geste :
    // plus besoin de mesurer l'écart entre les doigts ni de recaler le
    // centroïde quand un doigt se pose ou se lève.
    const pinch = Gesture.Pinch()
      .runOnJS(true)
      .onStart(() => {
        from.current = { ...from.current, size: live.current.overlay.size };
      })
      .onUpdate((event) => {
        onResize(id, clampSize(from.current.size * event.scale));
      });

    // Un tap rouvre l'éditeur. C'est un recognizer à part entière : il
    // remplace le drapeau `moved` et son seuil de 3 px écrits à la main.
    const tap = Gesture.Tap()
      .runOnJS(true)
      .maxDistance(6)
      .onEnd((_event, success) => {
        if (success) onPress(live.current.overlay);
      });

    return Gesture.Exclusive(Gesture.Simultaneous(pan, pinch), tap);
    // Uniquement des valeurs stables : c'est la condition pour que les gestes
    // survivent au glissement — voir la note du composant.
  }, [id, onMove, onResize, onPress, onGuides]);

  const fontSize = overlay.size * frame.height;
  const lines = wrapOverlayText(overlay.text, overlay.size * FRAME_HEIGHT);
  const padding = fontSize * BOX_PADDING_RATIO;

  return (
    <GestureDetector gesture={composed}>
    <View
      onLayout={(event) => {
        const { width, height } = event.nativeEvent.layout;
        if (measured?.width !== width || measured?.height !== height) {
          onMeasure(overlay.id, { width, height });
        }
      }}
      style={[
        styles.overlayBox,
        {
          left: freeWidth * overlay.x,
          top: freeHeight * overlay.y,
          maxWidth: frame.width * (1 - 2 * SIDE_MARGIN),
        },
      ]}
    >
      <View
        style={
          overlay.background
            ? [styles.overlayFill, { backgroundColor: overlay.background, padding }]
            : undefined
        }
      >
        {lines.map((line, index) => (
          <Text
            key={index}
            style={[
              styles.overlayText,
              // Contour et ombre uniquement SANS pavé : c'est le pavé qui
              // assure alors le contraste, et ffmpeg fait le même choix.
              !overlay.background && styles.overlayTextRelief,
              {
                fontSize,
                color: overlay.color,
                lineHeight: fontSize * 1.18,
                textAlign: overlay.align,
              },
            ]}
          >
            {line}
          </Text>
        ))}
      </View>
    </View>
    </GestureDetector>
  );
}

const ALIGN_CYCLE: TextAlign[] = ['center', 'left', 'right'];
const ALIGN_ICON: Record<TextAlign, keyof typeof Ionicons.glyphMap> = {
  left: 'text-outline',
  center: 'reorder-three-outline',
  right: 'text-outline',
};

/** Pastille de taille la plus proche, pour l'affichage de l'état actif. */
function nearestSizeIndex(size: number) {
  let best = 0;
  TEXT_SIZES.forEach((value, index) => {
    if (Math.abs(value - size) < Math.abs(TEXT_SIZES[best] - size)) best = index;
  });
  return best;
}

export default function VideoEditorScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute();
  const insets = useSafeAreaInsets();
  const { videoUri, returnTo } = (route.params || {}) as { videoUri: string; returnTo?: string };

  const [overlays, setOverlays] = useState<VideoOverlay[]>([]);
  const [sizes, setSizes] = useState<Record<string, Measured>>({});
  const [filterId, setFilterId] = useState('none');
  const [muted, setMuted] = useState(false);
  const [panel, setPanel] = useState<'none' | 'filters'>('none');
  const [editing, setEditing] = useState<VideoOverlay | null>(null);
  const [guides, setGuides] = useState<Guides>({ x: false, y: false });
  const [frame, setFrame] = useState({ width: SCREEN_WIDTH, height: SCREEN_WIDTH * (16 / 9) });
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [toolbarHeight, setToolbarHeight] = useState(0);

  /**
   * Hauteur du clavier, suivie à la main.
   *
   * `KeyboardAvoidingView` ne convient pas ici : la barre d'outils est en
   * position absolue, et Yoga place un enfant absolu par rapport au bord de la
   * BOÎTE, sans tenir compte du `paddingBottom` que le composant ajoute. La
   * barre restait donc sous le clavier — taille et couleurs inatteignables.
   *
   * `willShow` sur iOS pour monter AVEC le clavier plutôt qu'après lui.
   */
  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const show = Keyboard.addListener(showEvent, (event) => {
      setKeyboardHeight(event.endCoordinates.height);
    });
    const hide = Keyboard.addListener(hideEvent, () => setKeyboardHeight(0));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  const activeFilter = filterById(filterId);

  const measure = useCallback((id: string, size: Measured) => {
    setSizes((prev) => ({ ...prev, [id]: size }));
  }, []);

  const moveOverlay = useCallback((id: string, x: number, y: number) => {
    setOverlays((prev) => prev.map((item) => (item.id === id ? { ...item, x, y } : item)));
  }, []);

  const resizeOverlay = useCallback((id: string, size: number) => {
    setOverlays((prev) => prev.map((item) => (item.id === id ? { ...item, size } : item)));
  }, []);

  const openEditor = useCallback((overlay: VideoOverlay) => {
    setEditing({ ...overlay });
  }, []);

  const addText = useCallback(() => {
    setEditing({
      id: `ovl_${Date.now()}`,
      text: '',
      x: 0.5,
      y: 0.35,
      size: TEXT_SIZES[1],
      color: '#FFFFFF',
      background: null,
      align: 'center',
    });
  }, []);

  /**
   * Valide l'éditeur : un texte vide supprime l'incrustation.
   *
   * Remplacement SUR PLACE : rajouter le texte en fin de liste changeait son
   * plan à chaque retouche, deux textes qui se chevauchent permutaient donc
   * sans raison visible.
   */
  const commitEditing = useCallback(() => {
    if (!editing) return;
    const trimmed = editing.text.trim();
    setOverlays((prev) => {
      const at = prev.findIndex((item) => item.id === editing.id);
      if (!trimmed) return prev.filter((item) => item.id !== editing.id);
      const next = { ...editing, text: trimmed };
      if (at < 0) return [...prev, next];
      const copy = [...prev];
      copy[at] = next;
      return copy;
    });
    setEditing(null);
  }, [editing]);

  const deleteEditing = useCallback(() => {
    if (!editing) return;
    setOverlays((prev) => prev.filter((item) => item.id !== editing.id));
    setEditing(null);
  }, [editing]);

  /**
   * Le pavé de fond suit les trois états de TikTok : aucun, translucide, plein.
   * Un simple interrupteur perdrait l'état intermédiaire, le plus utilisé.
   *
   * La couleur du texte n'est corrigée que si elle devient ILLISIBLE sur le
   * nouveau pavé. La version précédente la remettait systématiquement à blanc
   * ou noir : choisir une couleur puis toucher au fond l'effaçait sans
   * prévenir.
   */
  const cycleBackground = useCallback(() => {
    setEditing((current) => {
      if (!current) return current;
      if (!current.background) {
        return { ...current, background: '#00000088' };
      }
      if (current.background === '#00000088') {
        const color = current.color === '#FFFFFF' ? '#000000' : current.color;
        return { ...current, background: '#FFFFFF', color };
      }
      const color = current.color === '#000000' ? '#FFFFFF' : current.color;
      return { ...current, background: null, color };
    });
  }, []);

  const cycleAlign = useCallback(() => {
    setEditing((current) => {
      if (!current) return current;
      const next = ALIGN_CYCLE[(ALIGN_CYCLE.indexOf(current.align) + 1) % ALIGN_CYCLE.length];
      return { ...current, align: next };
    });
  }, []);

  const goNext = useCallback(() => {
    const payload = { videoUri, overlays, filterId, muted };
    if (returnTo) {
      navigation.navigate({ name: returnTo, params: { editedVideo: payload }, merge: true });
      return;
    }
    navigation.navigate('VideoCaption', payload);
  }, [videoUri, overlays, filterId, muted, returnTo, navigation]);

  const editorFontSize = editing ? editing.size * frame.height : 0;
  // Le clavier couvre déjà l'encoche du bas quand il est ouvert.
  const editorBottomInset = keyboardHeight > 0 ? keyboardHeight : insets.bottom + 10;
  const activeSizeIndex = editing ? nearestSizeIndex(editing.size) : -1;

  return (
    <View style={styles.container}>
      {/* La vidéo reste montée en toutes circonstances — voir l'en-tête. */}
      <View
        style={StyleSheet.absoluteFillObject}
        onLayout={(event) => setFrame({
          width: event.nativeEvent.layout.width,
          height: event.nativeEvent.layout.height,
        })}
      >
        <Video
          source={{ uri: videoUri }}
          style={StyleSheet.absoluteFillObject}
          resizeMode="cover"
          repeat
          muted={muted}
          paused={!!editing}
          // Aperçu RÉEL : le même effet que celui reproduit en ffmpeg au rendu.
          filter={activeFilter.preview}
          filterEnabled={!!activeFilter.preview}
        />
      </View>

      {/* Textes déjà posés — celui en cours d'édition est masqué, il est
          représenté par le champ de saisie. */}
      {overlays
        .filter((overlay) => overlay.id !== editing?.id)
        .map((overlay) => (
          <DraggableOverlay
            key={overlay.id}
            overlay={overlay}
            frame={frame}
            measured={sizes[overlay.id]}
            onMeasure={measure}
            onMove={moveOverlay}
            onResize={resizeOverlay}
            onPress={openEditor}
            onGuides={setGuides}
          />
        ))}

      {/* Repères de centrage — visibles uniquement pendant le glissement. */}
      {guides.x && <View pointerEvents="none" style={styles.guideVertical} />}
      {guides.y && <View pointerEvents="none" style={styles.guideHorizontal} />}

      {/* ── Mode saisie ────────────────────────────────────────── */}
      {editing ? (
        <View style={StyleSheet.absoluteFillObject}>
          {/* Voile LÉGER : la scène doit rester visible pendant qu'on la
              légende. Toucher à côté valide, comme sur TikTok. */}
          <Pressable style={styles.editorScrim} onPress={commitEditing} />

          <View style={[styles.editorTop, { paddingTop: insets.top + 10 }]}>
            <View style={styles.editorTools}>
              <TouchableOpacity onPress={cycleAlign} style={styles.editorToolBtn}>
                <Ionicons
                  name={ALIGN_ICON[editing.align]}
                  size={20}
                  color="#fff"
                  style={editing.align === 'right' ? { transform: [{ scaleX: -1 }] } : undefined}
                />
              </TouchableOpacity>
              <TouchableOpacity onPress={cycleBackground} style={styles.editorToolBtn}>
                <Ionicons name={editing.background ? 'square' : 'square-outline'} size={20} color="#fff" />
              </TouchableOpacity>
              <TouchableOpacity onPress={deleteEditing} style={styles.editorToolBtn}>
                <Ionicons name="trash-outline" size={20} color="#fff" />
              </TouchableOpacity>
            </View>
            <TouchableOpacity onPress={commitEditing} hitSlop={10}>
              <Text style={styles.editorDone}>Terminé</Text>
            </TouchableOpacity>
          </View>

          {/* Centré dans ce qui RESTE visible : sinon un texte en XL passait
              derrière le clavier dès qu'il faisait deux lignes. */}
          <View
            style={[styles.editorCenter, { bottom: editorBottomInset + toolbarHeight }]}
            pointerEvents="box-none"
          >
            <View
              style={
                editing.background
                  ? [
                      styles.overlayFill,
                      { backgroundColor: editing.background, padding: editorFontSize * BOX_PADDING_RATIO },
                    ]
                  : undefined
              }
            >
              <TextInput
                style={[
                  styles.editorInput,
                  !editing.background && styles.overlayTextRelief,
                  {
                    fontSize: editorFontSize,
                    color: editing.color,
                    lineHeight: editorFontSize * 1.18,
                    textAlign: editing.align,
                  },
                ]}
                value={editing.text}
                onChangeText={(text) => setEditing((current) => (current ? { ...current, text } : current))}
                placeholder="Saisis ton texte"
                placeholderTextColor={colors.textSecondary}
                autoFocus
                multiline
                maxLength={120}
              />
            </View>
          </View>

          <View
            style={[styles.editorBottom, { bottom: editorBottomInset }]}
            onLayout={(event) => setToolbarHeight(event.nativeEvent.layout.height)}
          >
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.sizeRow}>
              {TEXT_SIZES.map((size, index) => (
                <TouchableOpacity
                  key={size}
                  onPress={() => setEditing((current) => (current ? { ...current, size } : current))}
                  style={[styles.sizeChip, activeSizeIndex === index && styles.sizeChipActive]}
                >
                  <Text style={styles.sizeChipText}>{['S', 'M', 'L', 'XL'][index]}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.colorRow}>
              {TEXT_COLORS.map((color) => (
                <TouchableOpacity
                  key={color}
                  onPress={() => setEditing((current) => (current ? { ...current, color } : current))}
                  style={[
                    styles.colorDot,
                    { backgroundColor: color },
                    editing.color === color && styles.colorDotActive,
                  ]}
                />
              ))}
            </ScrollView>
          </View>
        </View>
      ) : (
        <>
          <View style={[styles.topRow, { top: insets.top + 12 }]}>
            <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={12}>
              <Ionicons name="chevron-back" size={30} color="#fff" />
            </TouchableOpacity>
          </View>

          <View style={[styles.toolColumn, { top: insets.top + 70 }]}>
            <TouchableOpacity style={styles.tool} onPress={addText}>
              <Text style={styles.toolGlyph}>Aa</Text>
              <Text style={styles.toolLabel}>Texte</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.tool}
              onPress={() => setPanel((current) => (current === 'filters' ? 'none' : 'filters'))}
            >
              <Ionicons name="color-filter-outline" size={26} color={filterId !== 'none' ? TIKTOK_RED : '#fff'} />
              <Text style={[styles.toolLabel, filterId !== 'none' && { color: TIKTOK_RED }]}>Filtres</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.tool} onPress={() => setMuted((current) => !current)}>
              <Ionicons name={muted ? 'volume-mute' : 'volume-high'} size={26} color={muted ? TIKTOK_RED : '#fff'} />
              <Text style={[styles.toolLabel, muted && { color: TIKTOK_RED }]}>{muted ? 'Muet' : 'Son'}</Text>
            </TouchableOpacity>
          </View>

          {panel === 'filters' && (
            <View style={[styles.filterSheet, { paddingBottom: insets.bottom + 16 }]}>
              <Text style={styles.sheetTitle}>Filtres</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
                {VIDEO_FILTERS.map((entry) => (
                  <TouchableOpacity key={entry.id} onPress={() => setFilterId(entry.id)} style={styles.filterItem}>
                    <View style={[styles.filterThumb, filterId === entry.id && styles.filterThumbActive]}>
                      <Ionicons
                        name={entry.preview ? 'color-filter' : 'image-outline'}
                        size={22}
                        color={filterId === entry.id ? TIKTOK_RED : colors.textPrimary}
                      />
                    </View>
                    <Text style={[styles.filterLabel, filterId === entry.id && { color: TIKTOK_RED }]}>
                      {entry.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          )}

          {panel === 'none' && (
            <View style={[styles.bottomRow, { paddingBottom: insets.bottom + 16 }]}>
              <View style={styles.hintWrap}>
                {overlays.length === 0 ? (
                  <Text style={styles.hint}>Touche « Aa » pour ajouter du texte</Text>
                ) : (
                  <Text style={styles.hint}>Glisse un texte, pince pour la taille</Text>
                )}
              </View>
              <TouchableOpacity style={styles.nextBtn} onPress={goNext} activeOpacity={0.85}>
                <Text style={styles.nextLabel}>Suivant</Text>
                <Ionicons name="arrow-forward" size={18} color="#fff" />
              </TouchableOpacity>
            </View>
          )}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },

  topRow: { position: 'absolute', left: 16, zIndex: 5 },

  toolColumn: { position: 'absolute', right: 12, alignItems: 'center', gap: 20, zIndex: 5 },
  tool: { alignItems: 'center', gap: 4, width: 62 },
  toolGlyph: {
    color: '#fff', fontSize: 24, fontFamily: fonts.bold, lineHeight: 28,
    textShadowColor: 'rgba(0,0,0,0.6)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 2,
  },
  toolLabel: {
    color: '#fff', fontSize: 11, fontFamily: fonts.bold, textAlign: 'center',
    textShadowColor: 'rgba(0,0,0,0.6)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 2,
  },

  // Traits fins et translucides : ils guident sans masquer la scène.
  guideVertical: {
    position: 'absolute', top: 0, bottom: 0, left: '50%', width: 1,
    backgroundColor: colors.textPrimary, zIndex: 6,
  },
  guideHorizontal: {
    position: 'absolute', left: 0, right: 0, top: '50%', height: 1,
    backgroundColor: colors.textPrimary, zIndex: 6,
  },

  overlayBox: { position: 'absolute', zIndex: 4 },
  // Angles à peine adoucis : `drawtext` dessine un pavé à angles droits et ne
  // sait pas arrondir. Un rayon franc côté app aurait donc menti sur le rendu.
  overlayFill: { borderRadius: 4 },
  overlayText: { fontFamily: OVERLAY_FONT },
  overlayTextRelief: {
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 1, height: 2 },
    textShadowRadius: 3,
  },

  // Voile léger : la vidéo reste lisible derrière la saisie.
  editorScrim: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.35)' },
  editorTop: {
    position: 'absolute', top: 0, left: 16, right: 16, zIndex: 3,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  editorTools: { flexDirection: 'row', gap: 10 },
  editorToolBtn: {
    width: 38, height: 38, borderRadius: 19,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  editorDone: { color: '#fff', fontSize: 17, fontFamily: fonts.bold },
  editorCenter: {
    position: 'absolute', top: 0, left: 0, right: 0,
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24,
  },
  editorInput: { fontFamily: OVERLAY_FONT, minWidth: 140, maxWidth: '100%' },

  editorBottom: { position: 'absolute', left: 0, right: 0, zIndex: 3, gap: 14, paddingVertical: 10 },
  sizeRow: { paddingHorizontal: 16, gap: 10, alignItems: 'center' },
  sizeChip: {
    width: 38, height: 38, borderRadius: 19,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.overlayStrong,
  },
  sizeChipActive: { backgroundColor: TIKTOK_RED },
  sizeChipText: { color: '#fff', fontSize: 13, fontFamily: fonts.bold },

  colorRow: { paddingHorizontal: 16, gap: 12, alignItems: 'center' },
  colorDot: { width: 30, height: 30, borderRadius: 15, borderWidth: 2, borderColor: colors.textSecondary },
  colorDotActive: { borderColor: '#fff', borderWidth: 3, transform: [{ scale: 1.12 }] },

  filterSheet: {
    position: 'absolute', left: 0, right: 0, bottom: 0, zIndex: 6,
    paddingTop: 14, gap: 12,
    backgroundColor: 'rgba(0,0,0,0.85)',
    borderTopLeftRadius: 16, borderTopRightRadius: 16,
  },
  sheetTitle: { color: '#fff', fontSize: 15, fontFamily: fonts.bold, paddingHorizontal: 16 },
  filterRow: { paddingHorizontal: 16, gap: 16 },
  filterItem: { alignItems: 'center', gap: 6, width: 62 },
  filterThumb: {
    width: 52, height: 52, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.overlayMedium,
    borderWidth: 2, borderColor: 'transparent',
  },
  filterThumbActive: { borderColor: TIKTOK_RED },
  filterLabel: { color: colors.textPrimary, fontSize: 11, fontFamily: fonts.bold },

  bottomRow: {
    position: 'absolute', left: 16, right: 16, bottom: 0, zIndex: 5,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  hintWrap: { flex: 1 },
  hint: { color: colors.textSecondary, fontSize: 12 },
  nextBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 22, paddingVertical: 12, borderRadius: 8,
    backgroundColor: TIKTOK_RED,
  },
  nextLabel: { color: '#fff', fontSize: 15, fontFamily: fonts.bold },
});
