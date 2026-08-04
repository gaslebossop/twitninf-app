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
  Animated,
  BackHandler,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, fonts, radius, withAlpha, duration as D, easing as E } from '../../theme';
import feedback from '../../utils/feedback';

/**
 * La seule question bloquante de l'app.
 *
 * `Alert.alert` avec deux boutons servait à tout : supprimer un tweet,
 * bloquer un compte, confirmer un achat. Trois défauts :
 *  - c'est une fenêtre système, donc étrangère à la DA de l'app ;
 *  - les boutons y sont minuscules et leur ordre change selon la plateforme ;
 *  - rien n'y rappelle CE QU'ON PERD (le prix, le solde restant, le pseudo).
 *
 * Ici : une feuille qui monte du bas, à portée du pouce, avec le geste
 * dangereux en rouge et un contexte optionnel (« Il te restera 240 NF »).
 * S'utilise comme une question, pas comme un composant :
 *
 *     const ok = await confirm({ title: 'Supprimer ce tweet ?', destructive: true });
 *     if (!ok) return;
 *
 * Même limite que le toast : rendue au-dessus du navigateur, donc invisible
 * sous une `<Modal>` React Native ouverte.
 */

export interface ConfirmOptions {
  title: string;
  /** Conséquence concrète de l'action, en une phrase. */
  message?: string;
  /** Libellé du bouton d'action. Par défaut « Confirmer ». */
  confirmLabel?: string;
  /** Libellé du bouton de retrait. Par défaut « Annuler ». */
  cancelLabel?: string;
  /** Action irréversible : bouton rouge + vibration de refus à l'ouverture. */
  destructive?: boolean;
  /** Icône d'en-tête. Par défaut déduite de `destructive`. */
  icon?: keyof typeof Ionicons.glyphMap;
  /** Ligne de contexte affichée en encadré (coût, solde restant, cible). */
  detail?: string;
}

type Resolver = (value: boolean) => void;

const ConfirmContext = createContext<(options: ConfirmOptions) => Promise<boolean>>(
  async () => false,
);

const ENTER_MS = D.base;
const EXIT_MS = D.fast;
const BOTTOM_INSET = Platform.OS === 'ios' ? 34 : 16;

/**
 * Passerelle impérative, même raison d'être que celle du toast : beaucoup de
 * confirmations partent de gestionnaires définis hors du corps d'un composant.
 * Sans `ConfirmProvider` monté, la promesse se résout à `false` — une action
 * destructive ne part jamais « par défaut ».
 */
let hostConfirm: ((options: ConfirmOptions) => Promise<boolean>) | null = null;

export function confirmAsync(options: ConfirmOptions): Promise<boolean> {
  return hostConfirm ? hostConfirm(options) : Promise.resolve(false);
}

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [options, setOptions] = useState<ConfirmOptions | null>(null);
  const resolverRef = useRef<Resolver | null>(null);
  const progress = useRef(new Animated.Value(0)).current;
  const closing = useRef(false);

  const confirm = useCallback((next: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      // Une question déjà ouverte est répondue « non » avant d'être remplacée :
      // aucun appelant ne doit rester bloqué sur une promesse orpheline.
      resolverRef.current?.(false);
      resolverRef.current = resolve;
      closing.current = false;
      setOptions(next);
    });
  }, []);

  const settle = useCallback(
    (answer: boolean) => {
      if (closing.current) return;
      closing.current = true;
      Animated.timing(progress, {
        toValue: 0,
        duration: EXIT_MS,
        easing: E.in,
        useNativeDriver: true,
      }).start(() => {
        const resolve = resolverRef.current;
        resolverRef.current = null;
        setOptions(null);
        resolve?.(answer);
      });
    },
    [progress],
  );

  useEffect(() => {
    if (!options) return;

    if (options.destructive) feedback.refuse();
    else feedback.select();

    progress.setValue(0);
    Animated.timing(progress, {
      toValue: 1,
      duration: ENTER_MS,
      easing: E.out,
      useNativeDriver: true,
    }).start();

    // Le retour Android doit annuler, pas quitter l'écran de dessous.
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      settle(false);
      return true;
    });
    return () => sub.remove();
  }, [options, progress, settle]);

  useEffect(() => {
    hostConfirm = confirm;
    return () => {
      if (hostConfirm === confirm) hostConfirm = null;
    };
  }, [confirm]);

  const value = useMemo(() => confirm, [confirm]);

  const destructive = !!options?.destructive;
  const accent = destructive ? colors.red : colors.accent;

  return (
    <ConfirmContext.Provider value={value}>
      {children}
      {options && (
        <View style={styles.host}>
          <Animated.View style={[styles.scrim, { opacity: progress }]}>
            <Pressable style={StyleSheet.absoluteFill} onPress={() => settle(false)} />
          </Animated.View>

          <Animated.View
            style={[
              styles.sheet,
              {
                opacity: progress,
                transform: [
                  {
                    translateY: progress.interpolate({
                      inputRange: [0, 1],
                      outputRange: [220, 0],
                    }),
                  },
                ],
              },
            ]}
          >
            <View style={styles.grabber} />

            <View style={[styles.iconWrap, { backgroundColor: withAlpha(accent, 0.16) }]}>
              <Ionicons
                name={options.icon ?? (destructive ? 'trash-outline' : 'help-circle-outline')}
                size={24}
                color={accent}
              />
            </View>

            <Text style={styles.title}>{options.title}</Text>
            {!!options.message && <Text style={styles.message}>{options.message}</Text>}

            {!!options.detail && (
              <View style={styles.detailBox}>
                <Text style={styles.detailText}>{options.detail}</Text>
              </View>
            )}

            <Pressable
              onPress={() => {
                feedback.tap();
                settle(true);
              }}
              style={({ pressed }) => [
                styles.confirmBtn,
                { backgroundColor: accent },
                pressed && styles.pressed,
              ]}
            >
              <Text style={styles.confirmLabel}>{options.confirmLabel ?? 'Confirmer'}</Text>
            </Pressable>

            <Pressable
              onPress={() => settle(false)}
              style={({ pressed }) => [styles.cancelBtn, pressed && styles.pressed]}
            >
              <Text style={styles.cancelLabel}>{options.cancelLabel ?? 'Annuler'}</Text>
            </Pressable>
          </Animated.View>
        </View>
      )}
    </ConfirmContext.Provider>
  );
}

/** Pose une question bloquante. Renvoie `true` si l'utilisateur confirme. */
export function useConfirm() {
  return useContext(ConfirmContext);
}

const styles = StyleSheet.create({
  host: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'flex-end',
    zIndex: 9998,
  },
  scrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.overlay,
  },
  sheet: {
    backgroundColor: colors.surfaceAlt,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: BOTTOM_INSET + 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    alignItems: 'center',
  },
  grabber: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.borderStrong,
    marginBottom: 18,
  },
  iconWrap: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  title: {
    color: colors.textPrimary,
    fontFamily: fonts.display,
    fontSize: 19,
    lineHeight: 25,
    textAlign: 'center',
  },
  message: {
    color: colors.textSecondary,
    fontFamily: fonts.regular,
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
    marginTop: 8,
  },
  detailBox: {
    alignSelf: 'stretch',
    marginTop: 14,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  detailText: {
    color: colors.textPrimary,
    fontFamily: fonts.medium,
    fontSize: 13.5,
    lineHeight: 19,
    textAlign: 'center',
  },
  confirmBtn: {
    alignSelf: 'stretch',
    height: 52,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 20,
  },
  confirmLabel: {
    color: colors.white,
    fontFamily: fonts.bold,
    fontSize: 16,
  },
  cancelBtn: {
    alignSelf: 'stretch',
    height: 48,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 6,
  },
  cancelLabel: {
    color: colors.textSecondary,
    fontFamily: fonts.semibold,
    fontSize: 15,
  },
  pressed: {
    opacity: 0.82,
  },
});

export default ConfirmProvider;
