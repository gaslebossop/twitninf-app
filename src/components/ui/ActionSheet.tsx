import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  ReactNode,
} from 'react';
import {
  BackHandler,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { GestureDetector } from 'react-native-gesture-handler';
import Animated from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { colors, fonts, radius, withAlpha } from '../../theme';
import useSheetGesture from '../../hooks/useSheetGesture';
import feedback from '../../utils/feedback';

/**
 * Menu d'actions — le « … » d'un tweet, le choix d'une source de photo, etc.
 *
 * Ce menu existait en deux versions incompatibles dans l'app :
 *  - iOS : `ActionSheetIOS`, correct ;
 *  - Android : `Alert.alert('Plus d'options', 'Choisir une action', [...])`,
 *    c'est-à-dire une boîte de dialogue centrée avec N boutons empilés, sans
 *    icône, sans hiérarchie, où « Signaler » et « Supprimer » ont exactement
 *    la même apparence que « Copier le lien ».
 *
 * Une seule implémentation ici, la même partout : une feuille qui monte du
 * bas, à portée du pouce, où chaque action porte son icône et où le geste
 * dangereux est rouge. Le retour Android referme au lieu de quitter l'écran.
 */

export interface ActionSheetItem {
  label: string;
  onPress: () => void;
  icon?: keyof typeof Ionicons.glyphMap;
  /** Action irréversible : libellé et icône en rouge. */
  destructive?: boolean;
  /** Ligne d'explication sous le libellé, pour ce qui n'est pas évident. */
  hint?: string;
  disabled?: boolean;
}

export interface ActionSheetOptions {
  title?: string;
  message?: string;
  items: ActionSheetItem[];
  cancelLabel?: string;
}

const ActionSheetContext = createContext<(options: ActionSheetOptions) => void>(() => {});

const BOTTOM_INSET = Platform.OS === 'ios' ? 34 : 16;
/** Course d'entrée, et distance de sortie une fois la fermeture lancée. */
const TRAVEL = 280;
/**
 * Au-delà de cette position PROJETÉE (voir `useSheetGesture`), le glissé
 * referme au lieu de reposer la feuille. Le seuil porte sur l'endroit où le
 * geste envoyait la feuille, pas sur la distance réellement parcourue : un
 * coup sec de 20 px ferme, une traînée molle de 80 px repose.
 */
const DISMISS_DISTANCE = 88;

let hostShow: ((options: ActionSheetOptions) => void) | null = null;

/** Ouvre le menu depuis n'importe où, y compris hors composant. */
export function showActionSheet(options: ActionSheetOptions) {
  hostShow?.(options);
}

export function ActionSheetProvider({ children }: { children: ReactNode }) {
  const [options, setOptions] = useState<ActionSheetOptions | null>(null);
  /**
   * Action choisie, jouée APRÈS la fermeture : si elle ouvre un écran ou une
   * autre feuille, les deux ne se chevauchent pas.
   */
  const pending = useRef<(() => void) | null>(null);

  const handleClosed = useCallback(() => {
    setOptions(null);
    const then = pending.current;
    pending.current = null;
    then?.();
  }, []);

  /**
   * Tout le glissé — suivi du doigt, butée élastique, décision au
   * relâchement — vit dans ce hook et tourne sur le thread UI.
   */
  const { gesture, sheetStyle, scrimStyle, open, close } = useSheetGesture({
    onClosed: handleClosed,
    travel: TRAVEL,
    dismissDistance: DISMISS_DISTANCE,
  });

  const show = useCallback((next: ActionSheetOptions) => {
    pending.current = null;
    setOptions(next);
  }, []);

  /** Ferme, puis joue l'action choisie. */
  const dismissWith = useCallback(
    (then?: () => void) => {
      pending.current = then ?? null;
      close();
    },
    [close],
  );

  useEffect(() => {
    if (!options) return;
    feedback.select();
    open();

    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      close();
      return true;
    });
    return () => sub.remove();
  }, [options, open, close]);

  useEffect(() => {
    hostShow = show;
    return () => {
      if (hostShow === show) hostShow = null;
    };
  }, [show]);

  const value = useMemo(() => show, [show]);

  return (
    <ActionSheetContext.Provider value={value}>
      {children}
      {options && (
        <View style={styles.host}>
          <Animated.View style={[styles.scrim, scrimStyle]}>
            <Pressable style={StyleSheet.absoluteFill} onPress={() => close()} />
          </Animated.View>

          {/* Entrée et doigt s'additionnent sur la même propriété : la feuille
              ne « saute » pas quand on la saisit en pleine ouverture. */}
          <GestureDetector gesture={gesture}>
            <Animated.View style={[styles.sheet, sheetStyle]}>
            <View style={styles.grabber} />

            {(!!options.title || !!options.message) && (
              <View style={styles.headerBlock}>
                {!!options.title && <Text style={styles.title}>{options.title}</Text>}
                {!!options.message && <Text style={styles.message}>{options.message}</Text>}
              </View>
            )}

            <ScrollView
              style={styles.list}
              contentContainerStyle={styles.listContent}
              bounces={false}
              showsVerticalScrollIndicator={false}
            >
              {options.items.map((item, index) => {
                const tint = item.destructive ? colors.red : colors.textPrimary;
                return (
                  <Pressable
                    key={`${item.label}-${index}`}
                    disabled={item.disabled}
                    onPress={() => {
                      feedback.tap();
                      dismissWith(item.onPress);
                    }}
                    style={({ pressed }) => [
                      styles.item,
                      pressed && styles.itemPressed,
                      item.disabled && styles.itemDisabled,
                    ]}
                  >
                    {item.icon && (
                      <View
                        style={[
                          styles.itemIcon,
                          {
                            backgroundColor: item.destructive
                              ? withAlpha(colors.red, 0.14)
                              : colors.surfaceElevated,
                          },
                        ]}
                      >
                        <Ionicons name={item.icon} size={18} color={tint} />
                      </View>
                    )}
                    <View style={styles.itemText}>
                      <Text style={[styles.itemLabel, { color: tint }]} numberOfLines={1}>
                        {item.label}
                      </Text>
                      {!!item.hint && (
                        <Text style={styles.itemHint} numberOfLines={2}>
                          {item.hint}
                        </Text>
                      )}
                    </View>
                  </Pressable>
                );
              })}
            </ScrollView>

            <Pressable
              onPress={() => close()}
              style={({ pressed }) => [styles.cancel, pressed && styles.itemPressed]}
            >
              <Text style={styles.cancelLabel}>{options.cancelLabel ?? 'Annuler'}</Text>
            </Pressable>
            </Animated.View>
          </GestureDetector>
        </View>
      )}
    </ActionSheetContext.Provider>
  );
}

export function useActionSheet() {
  return useContext(ActionSheetContext);
}

const styles = StyleSheet.create({
  host: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'flex-end',
    zIndex: 9997,
  },
  scrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.overlay,
  },
  sheet: {
    backgroundColor: colors.surfaceAlt,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: BOTTOM_INSET + 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    maxHeight: '82%',
  },
  grabber: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.borderStrong,
    alignSelf: 'center',
    marginBottom: 12,
  },
  headerBlock: {
    paddingHorizontal: 10,
    paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    marginBottom: 6,
  },
  title: {
    color: colors.textPrimary,
    fontFamily: fonts.heading,
    fontSize: 16,
  },
  message: {
    color: colors.textSecondary,
    fontFamily: fonts.regular,
    fontSize: 13,
    lineHeight: 18,
    marginTop: 3,
  },
  list: {
    flexGrow: 0,
  },
  listContent: {
    paddingBottom: 4,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 54,
    paddingHorizontal: 8,
    borderRadius: radius.md,
  },
  itemPressed: {
    backgroundColor: colors.surfaceHover,
  },
  itemDisabled: {
    opacity: 0.4,
  },
  itemIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  itemText: {
    flex: 1,
    paddingVertical: 8,
  },
  itemLabel: {
    fontFamily: fonts.semibold,
    fontSize: 15.5,
  },
  itemHint: {
    color: colors.textMuted,
    fontFamily: fonts.regular,
    fontSize: 12.5,
    lineHeight: 17,
    marginTop: 2,
  },
  cancel: {
    height: 50,
    marginTop: 8,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  cancelLabel: {
    color: colors.textSecondary,
    fontFamily: fonts.bold,
    fontSize: 15,
  },
});

export default ActionSheetProvider;
