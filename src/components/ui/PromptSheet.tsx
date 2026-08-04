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
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, fonts, radius, withAlpha, duration as D, easing as E } from '../../theme';
import feedback from '../../utils/feedback';

/**
 * Question à réponse écrite (motif d'un bannissement, nom d'un dossier…).
 *
 * L'app utilisait `Alert.prompt` pour ça. Or `Alert.prompt` **n'existe que sur
 * iOS** : sur Android, l'appel ne fait rien. Concrètement, l'action « bannir »
 * de la modération de contenu était injouable sur Android — le bouton
 * répondait, aucune fenêtre n'apparaissait, et rien ne se passait.
 *
 * Cette feuille se comporte pareil sur les deux plateformes, remonte avec le
 * clavier, et refuse de valider tant que le champ est vide quand la réponse
 * est obligatoire (plutôt que de laisser confirmer puis d'afficher une erreur).
 */

export interface PromptOptions {
  title: string;
  message?: string;
  placeholder?: string;
  defaultValue?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Bloque la validation tant que le champ est vide. Vrai par défaut. */
  required?: boolean;
  multiline?: boolean;
  maxLength?: number;
  destructive?: boolean;
  icon?: keyof typeof Ionicons.glyphMap;
}

type Resolver = (value: string | null) => void;

const PromptContext = createContext<(options: PromptOptions) => Promise<string | null>>(
  async () => null,
);

let hostPrompt: ((options: PromptOptions) => Promise<string | null>) | null = null;

/** Renvoie le texte saisi, ou `null` si l'utilisateur a renoncé. */
export function promptAsync(options: PromptOptions): Promise<string | null> {
  return hostPrompt ? hostPrompt(options) : Promise.resolve(null);
}

const ENTER_MS = D.base;
const EXIT_MS = D.fast;
const BOTTOM_INSET = Platform.OS === 'ios' ? 34 : 16;

export function PromptProvider({ children }: { children: ReactNode }) {
  const [options, setOptions] = useState<PromptOptions | null>(null);
  const [value, setValue] = useState('');
  const resolverRef = useRef<Resolver | null>(null);
  const progress = useRef(new Animated.Value(0)).current;
  const closing = useRef(false);

  const prompt = useCallback((next: PromptOptions) => {
    return new Promise<string | null>((resolve) => {
      resolverRef.current?.(null);
      resolverRef.current = resolve;
      closing.current = false;
      setValue(next.defaultValue ?? '');
      setOptions(next);
    });
  }, []);

  const settle = useCallback(
    (answer: string | null) => {
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
        setValue('');
        resolve?.(answer);
      });
    },
    [progress],
  );

  useEffect(() => {
    if (!options) return;
    feedback.select();
    progress.setValue(0);
    Animated.timing(progress, {
      toValue: 1,
      duration: ENTER_MS,
      easing: E.out,
      useNativeDriver: true,
    }).start();

    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      settle(null);
      return true;
    });
    return () => sub.remove();
  }, [options, progress, settle]);

  useEffect(() => {
    hostPrompt = prompt;
    return () => {
      if (hostPrompt === prompt) hostPrompt = null;
    };
  }, [prompt]);

  const contextValue = useMemo(() => prompt, [prompt]);

  const required = options?.required !== false;
  const canSubmit = !required || value.trim().length > 0;
  const accent = options?.destructive ? colors.red : colors.accent;

  return (
    <PromptContext.Provider value={contextValue}>
      {children}
      {options && (
        <View style={styles.host}>
          <Animated.View style={[styles.scrim, { opacity: progress }]}>
            <Pressable style={StyleSheet.absoluteFill} onPress={() => settle(null)} />
          </Animated.View>

          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={styles.keyboardWrap}
            pointerEvents="box-none"
          >
            <Animated.View
              style={[
                styles.sheet,
                {
                  opacity: progress,
                  transform: [
                    {
                      translateY: progress.interpolate({
                        inputRange: [0, 1],
                        outputRange: [240, 0],
                      }),
                    },
                  ],
                },
              ]}
            >
              <View style={styles.grabber} />

              <View style={[styles.iconWrap, { backgroundColor: withAlpha(accent, 0.16) }]}>
                <Ionicons
                  name={options.icon ?? 'create-outline'}
                  size={22}
                  color={accent}
                />
              </View>

              <Text style={styles.title}>{options.title}</Text>
              {!!options.message && <Text style={styles.message}>{options.message}</Text>}

              <TextInput
                value={value}
                onChangeText={setValue}
                placeholder={options.placeholder}
                placeholderTextColor={colors.textMuted}
                style={[styles.input, options.multiline && styles.inputMultiline]}
                multiline={options.multiline}
                maxLength={options.maxLength}
                autoFocus
                selectionColor={accent}
                onSubmitEditing={() => canSubmit && settle(value.trim())}
                returnKeyType="done"
              />

              <Pressable
                disabled={!canSubmit}
                onPress={() => {
                  feedback.tap();
                  settle(value.trim());
                }}
                style={({ pressed }) => [
                  styles.confirmBtn,
                  { backgroundColor: accent },
                  !canSubmit && styles.confirmDisabled,
                  pressed && styles.pressed,
                ]}
              >
                <Text style={styles.confirmLabel}>{options.confirmLabel ?? 'Valider'}</Text>
              </Pressable>

              <Pressable
                onPress={() => settle(null)}
                style={({ pressed }) => [styles.cancelBtn, pressed && styles.pressed]}
              >
                <Text style={styles.cancelLabel}>{options.cancelLabel ?? 'Annuler'}</Text>
              </Pressable>
            </Animated.View>
          </KeyboardAvoidingView>
        </View>
      )}
    </PromptContext.Provider>
  );
}

export function usePrompt() {
  return useContext(PromptContext);
}

const styles = StyleSheet.create({
  host: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'flex-end',
    zIndex: 9996,
  },
  scrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.overlay,
  },
  keyboardWrap: {
    justifyContent: 'flex-end',
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
    marginBottom: 16,
  },
  iconWrap: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  title: {
    color: colors.textPrimary,
    fontFamily: fonts.display,
    fontSize: 18,
    lineHeight: 24,
    textAlign: 'center',
  },
  message: {
    color: colors.textSecondary,
    fontFamily: fonts.regular,
    fontSize: 13.5,
    lineHeight: 19,
    textAlign: 'center',
    marginTop: 6,
  },
  input: {
    alignSelf: 'stretch',
    marginTop: 16,
    minHeight: 50,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderStrong,
    color: colors.textPrimary,
    fontFamily: fonts.regular,
    fontSize: 15,
  },
  inputMultiline: {
    minHeight: 96,
    textAlignVertical: 'top',
  },
  confirmBtn: {
    alignSelf: 'stretch',
    height: 52,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 16,
  },
  confirmDisabled: {
    opacity: 0.4,
  },
  confirmLabel: {
    color: colors.white,
    fontFamily: fonts.bold,
    fontSize: 16,
  },
  cancelBtn: {
    alignSelf: 'stretch',
    height: 46,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
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

export default PromptProvider;
