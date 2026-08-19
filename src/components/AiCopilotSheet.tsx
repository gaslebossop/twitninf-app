import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { colors, fonts } from '../theme';
import {
  copilotReview,
  copilotSuggest,
  fetchCopilotModes,
  type CopilotMode,
  type CopilotReview,
  type CopilotSuggestion,
} from '../services/creatorIntelligenceService';

/**
 * Co-pilote IA de rédaction — feuille ouverte depuis le composeur (avantage Pro).
 *
 * Il PROPOSE, il ne remplace jamais tout seul : chaque suggestion demande un
 * appui explicite sur « Utiliser », et le texte remplacé peut être récupéré par
 * « Annuler » tant que la feuille est ouverte. Écraser un brouillon en cours
 * d'écriture sans retour en arrière serait la pire façon d'introduire de l'IA
 * dans un éditeur de texte.
 *
 * La génération passe par Codex côté serveur : compter une dizaine de secondes,
 * d'où l'état de chargement explicite plutôt qu'un simple spinner discret.
 */

interface Props {
  visible: boolean;
  content: string;
  onClose: () => void;
  /** Remplace le contenu du composeur par la suggestion retenue. */
  onApply: (text: string) => void;
}

type CopilotView = 'suggest' | 'review';

export default function AiCopilotSheet({ visible, content, onClose, onApply }: Props) {
  const [modes, setModes] = useState<CopilotMode[]>([]);
  const [available, setAvailable] = useState<boolean | null>(null);
  const [activeMode, setActiveMode] = useState<string | null>(null);

  const [suggestions, setSuggestions] = useState<CopilotSuggestion[]>([]);
  const [review, setReview] = useState<CopilotReview | null>(null);
  const [mode, setMode] = useState<CopilotView>('suggest');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Contenu d'avant l'application d'une suggestion — permet le retour arrière. */
  const [undoText, setUndoText] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    // Réinitialisation à chaque ouverture : une suggestion faite sur un texte
    // qui a changé depuis n'a plus aucun sens.
    setSuggestions([]);
    setReview(null);
    setError(null);
    setActiveMode(null);
    setUndoText(null);
    setMode('suggest');

    if (available === null) {
      fetchCopilotModes().then((result) => {
        if (result.ok && result.data) {
          setAvailable(result.data.available);
          setModes(result.data.modes);
        } else {
          setAvailable(false);
        }
      });
    }
  }, [visible, available]);

  const runSuggest = useCallback(async (modeKey: string) => {
    setLoading(true);
    setError(null);
    setActiveMode(modeKey);
    setSuggestions([]);
    setMode('suggest');

    const result = await copilotSuggest(content, modeKey);
    if (result.ok && result.data) setSuggestions(result.data.suggestions);
    else setError(result.message || 'Rien à proposer.');

    setLoading(false);
  }, [content]);

  const runReview = useCallback(async () => {
    setLoading(true);
    setError(null);
    setActiveMode(null);
    setReview(null);
    setMode('review');

    const result = await copilotReview(content);
    if (result.ok && result.data) setReview(result.data.review);
    else setError(result.message || 'Relecture impossible.');

    setLoading(false);
  }, [content]);

  const apply = useCallback((text: string) => {
    setUndoText(content);
    onApply(text);
  }, [content, onApply]);

  const undo = useCallback(() => {
    if (undoText === null) return;
    onApply(undoText);
    setUndoText(null);
  }, [undoText, onApply]);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={styles.backdrop}>
        <TouchableOpacity style={styles.backdropTouch} onPress={onClose} activeOpacity={1} />

        <View style={styles.sheet}>
          <View style={styles.grabber} />

          <View style={styles.header}>
            <View style={styles.headerTitleRow}>
              <Ionicons name="bulb" size={17} color={colors.accent} />
              <Text style={styles.headerTitle}>Co-pilote</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeButton} activeOpacity={0.8}>
              <Ionicons name="close" size={19} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          {available === false ? (
            <View style={styles.centered}>
              <Ionicons name="cloud-offline-outline" size={22} color={colors.warning} />
              <Text style={styles.centeredText}>
                Le co-pilote n'est pas disponible sur ce serveur pour le moment.
              </Text>
            </View>
          ) : !content.trim() ? (
            <View style={styles.centered}>
              <Text style={styles.centeredText}>
                Écris quelques mots, le co-pilote travaille à partir de ton texte.
              </Text>
            </View>
          ) : (
            <>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.modeRow}
              >
                {modes.map((m) => (
                  <TouchableOpacity
                    key={m.key}
                    style={[styles.modeChip, activeMode === m.key && styles.modeChipActive]}
                    onPress={() => runSuggest(m.key)}
                    disabled={loading}
                    activeOpacity={0.8}
                  >
                    <Text
                      style={[
                        styles.modeChipText,
                        activeMode === m.key && styles.modeChipTextActive,
                      ]}
                    >
                      {m.label}
                    </Text>
                  </TouchableOpacity>
                ))}
                <TouchableOpacity
                  style={[styles.modeChip, mode === 'review' && styles.modeChipActive]}
                  onPress={runReview}
                  disabled={loading}
                  activeOpacity={0.8}
                >
                  <Text
                    style={[styles.modeChipText, mode === 'review' && styles.modeChipTextActive]}
                  >
                    Relire
                  </Text>
                </TouchableOpacity>
              </ScrollView>

              <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent}>
                {loading && (
                  <View style={styles.centered}>
                    <ActivityIndicator size="small" color={colors.accent} />
                    <Text style={styles.centeredText}>
                      Le co-pilote réfléchit — une dizaine de secondes.
                    </Text>
                  </View>
                )}

                {!!error && !loading && (
                  <View style={styles.centered} accessibilityRole="alert">
                    <Text style={styles.errorText}>{error}</Text>
                  </View>
                )}

                {!loading && mode === 'suggest' && suggestions.map((s, i) => (
                  <View key={`${i}-${s.text.slice(0, 12)}`} style={styles.suggestion}>
                    <Text style={styles.suggestionText}>{s.text}</Text>
                    {!!s.why && <Text style={styles.suggestionWhy}>{s.why}</Text>}
                    <View style={styles.suggestionActions}>
                      <Text style={styles.suggestionChars}>{s.text.length} car.</Text>
                      <TouchableOpacity
                        style={styles.applyButton}
                        onPress={() => apply(s.text)}
                        activeOpacity={0.85}
                      >
                        <Text style={styles.applyButtonText}>Utiliser</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ))}

                {!loading && mode === 'review' && review && (
                  <View>
                    <View style={styles.scoreRow}>
                      <ScoreBox label="Clarté" value={review.clarity} />
                      <ScoreBox label="Accroche" value={review.hook} />
                      {!!review.tone && (
                        <View style={styles.scoreBox}>
                          <Text style={styles.toneValue} numberOfLines={1}>{review.tone}</Text>
                          <Text style={styles.scoreLabel}>Ton</Text>
                        </View>
                      )}
                    </View>

                    {!!review.strengths.length && (
                      <ReviewList
                        title="Ce qui fonctionne"
                        icon="checkmark-circle"
                        color={colors.success}
                        items={review.strengths}
                      />
                    )}
                    {!!review.improvements.length && (
                      <ReviewList
                        title="À revoir"
                        icon="alert-circle"
                        color={colors.warning}
                        items={review.improvements}
                      />
                    )}
                    {!!review.hashtags.length && (
                      <View style={styles.hashtagSection}>
                        <Text style={styles.reviewTitle}>Hashtags suggérés</Text>
                        <View style={styles.hashtagRow}>
                          {review.hashtags.map((h) => (
                            <View key={h} style={styles.hashtag}>
                              <Text style={styles.hashtagText}>{h}</Text>
                            </View>
                          ))}
                        </View>
                      </View>
                    )}
                  </View>
                )}

                {!loading && !error && mode === 'suggest' && suggestions.length === 0 && (
                  <View style={styles.centered}>
                    <Text style={styles.centeredText}>
                      Choisis ce que tu veux : reformuler, raccourcir, changer de ton,
                      ou faire relire ton brouillon.
                    </Text>
                  </View>
                )}
              </ScrollView>

              {undoText !== null && (
                <TouchableOpacity style={styles.undoBar} onPress={undo} activeOpacity={0.85}>
                  <Ionicons name="arrow-undo" size={15} color={colors.textPrimary} />
                  <Text style={styles.undoText}>Revenir à mon texte d'origine</Text>
                </TouchableOpacity>
              )}

              <Text style={styles.disclaimer}>
                Les suggestions sont des propositions : relis-les avant de publier.
                Rien n'est envoyé automatiquement.
              </Text>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

function ScoreBox({ label, value }: { label: string; value: number | null }) {
  if (value === null) return null;
  return (
    <View style={styles.scoreBox}>
      <Text style={styles.scoreValue}>{value}</Text>
      <Text style={styles.scoreLabel}>{label}</Text>
    </View>
  );
}

function ReviewList({
  title,
  icon,
  color,
  items,
}: {
  title: string;
  icon: string;
  color: string;
  items: string[];
}) {
  return (
    <View style={styles.reviewSection}>
      <Text style={styles.reviewTitle}>{title}</Text>
      {items.map((item, i) => (
        <View key={`${i}-${item.slice(0, 10)}`} style={styles.reviewItem}>
          <Ionicons name={icon as any} size={14} color={color} />
          <Text style={styles.reviewItemText}>{item}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: colors.overlay },
  backdropTouch: { flex: 1 },
  sheet: {
    maxHeight: '82%',
    backgroundColor: colors.bgElevated,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: 20,
  },
  grabber: {
    width: 38,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.borderStrong,
    alignSelf: 'center',
    marginTop: 9,
  },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingTop: 14,
    paddingBottom: 10,
  },
  headerTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  headerTitle: { color: colors.textPrimary, fontSize: 16, fontFamily: fonts.heading },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },

  modeRow: { paddingHorizontal: 18, gap: 7, paddingBottom: 12 },
  modeChip: {
    paddingHorizontal: 13,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: colors.surface,
  },
  modeChipActive: { backgroundColor: colors.accentMuted },
  modeChipText: { color: colors.textSecondary, fontSize: 12.5, fontFamily: fonts.regular },
  modeChipTextActive: { color: colors.accent, fontFamily: fonts.bold },

  body: { maxHeight: 400 },
  bodyContent: { paddingHorizontal: 18, paddingBottom: 8 },

  suggestion: {
    padding: 13,
    borderRadius: 13,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    marginBottom: 10,
  },
  suggestionText: {
    color: colors.textPrimary,
    fontSize: 14,
    lineHeight: 20,
    fontFamily: fonts.regular,
  },
  suggestionWhy: {
    color: colors.textMuted,
    fontSize: 11.5,
    lineHeight: 16,
    marginTop: 7,
    fontFamily: fonts.regular,
  },
  suggestionActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 11,
  },
  suggestionChars: { color: colors.textMuted, fontSize: 11, fontFamily: fonts.regular },
  applyButton: {
    paddingHorizontal: 15,
    paddingVertical: 7,
    borderRadius: 9,
    backgroundColor: colors.accent,
  },
  applyButtonText: { color: colors.onAccent, fontSize: 12.5, fontFamily: fonts.bold },

  scoreRow: { flexDirection: 'row', gap: 9, marginBottom: 6 },
  scoreBox: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 13,
    borderRadius: 12,
    backgroundColor: colors.surface,
  },
  scoreValue: { color: colors.textPrimary, fontSize: 22, fontFamily: fonts.heading },
  toneValue: { color: colors.accent, fontSize: 14, fontFamily: fonts.bold },
  scoreLabel: { color: colors.textMuted, fontSize: 11, marginTop: 3, fontFamily: fonts.regular },

  reviewSection: { marginTop: 14 },
  reviewTitle: { color: colors.textPrimary, fontSize: 13.5, marginBottom: 8, fontFamily: fonts.bold },
  reviewItem: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginBottom: 7 },
  reviewItemText: {
    flex: 1,
    color: colors.textSecondary,
    fontSize: 12.5,
    lineHeight: 18,
    fontFamily: fonts.regular,
  },

  hashtagSection: { marginTop: 14 },
  hashtagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  hashtag: {
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: colors.accentSoft,
  },
  hashtagText: { color: colors.accent, fontSize: 12, fontFamily: fonts.regular },

  undoBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginHorizontal: 18,
    marginTop: 6,
    height: 40,
    borderRadius: 11,
    backgroundColor: colors.surfaceElevated,
  },
  undoText: { color: colors.textPrimary, fontSize: 12.5, fontFamily: fonts.regular },

  disclaimer: {
    color: colors.textMuted,
    fontSize: 10.5,
    lineHeight: 15,
    textAlign: 'center',
    paddingHorizontal: 24,
    marginTop: 12,
    fontFamily: fonts.regular,
  },

  centered: { alignItems: 'center', paddingVertical: 30, paddingHorizontal: 16 },
  centeredText: {
    color: colors.textSecondary,
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
    marginTop: 10,
    fontFamily: fonts.regular,
  },
  errorText: { color: colors.warning, fontSize: 13, textAlign: 'center', fontFamily: fonts.regular },
});
