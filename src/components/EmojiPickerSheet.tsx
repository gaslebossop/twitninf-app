import React, { useMemo, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { colors, fonts } from '../theme';

interface EmojiPickerSheetProps {
  visible: boolean;
  onClose: () => void;
  onSelect: (emoji: string) => void;
}

/**
 * Sélecteur d'emoji complet, façon Instagram : ouvert depuis le « + » de la
 * barre de réactions.
 *
 * La liste est embarquée plutôt que tirée d'une dépendance : les paquets de
 * sélecteurs d'emoji pèsent plusieurs mégaoctets pour un usage ponctuel, et
 * embarquent leurs propres images alors que le système sait déjà dessiner les
 * emojis. Ce qui suit couvre les catégories usuelles.
 */
const CATEGORIES: { key: string; label: string; icon: keyof typeof Ionicons.glyphMap; emojis: string[] }[] = [
  {
    key: 'smileys',
    label: 'Smileys',
    icon: 'happy-outline',
    emojis: [
      '😀', '😃', '😄', '😁', '😆', '😅', '🤣', '😂', '🙂', '🙃', '😉', '😊',
      '😇', '🥰', '😍', '🤩', '😘', '😗', '😚', '😙', '🥲', '😋', '😛', '😜',
      '🤪', '😝', '🤑', '🤗', '🤭', '🤫', '🤔', '🤐', '🤨', '😐', '😑', '😶',
      '😏', '😒', '🙄', '😬', '🤥', '😌', '😔', '😪', '🤤', '😴', '😷', '🤒',
      '🤕', '🤢', '🤮', '🤧', '🥵', '🥶', '🥴', '😵', '🤯', '🤠', '🥳', '😎',
      '🤓', '🧐', '😕', '😟', '🙁', '😮', '😯', '😲', '😳', '🥺', '😦', '😧',
      '😨', '😰', '😥', '😢', '😭', '😱', '😖', '😣', '😞', '😓', '😩', '😫',
      '🥱', '😤', '😡', '😠', '🤬', '😈', '👿', '💀', '💩', '🤡', '👻', '👽',
    ],
  },
  {
    key: 'gestures',
    label: 'Gestes',
    icon: 'hand-left-outline',
    emojis: [
      '👍', '👎', '👌', '🤌', '🤏', '✌️', '🤞', '🤟', '🤘', '🤙', '👈', '👉',
      '👆', '👇', '☝️', '👋', '🤚', '🖐️', '✋', '🖖', '👏', '🙌', '🤲', '🤝',
      '🙏', '✍️', '💪', '🦾', '🦵', '🦶', '👂', '👃', '🧠', '👀', '👁️', '👅',
      '👄', '🫶', '🤳', '💅',
    ],
  },
  {
    key: 'hearts',
    label: 'Cœurs',
    icon: 'heart-outline',
    emojis: [
      '❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '🤎', '💔', '❣️', '💕',
      '💞', '💓', '💗', '💖', '💘', '💝', '💟', '♥️', '💋', '🔥', '✨', '⭐',
      '🌟', '💫', '💥', '💯', '🎉', '🎊',
    ],
  },
  {
    key: 'animals',
    label: 'Animaux',
    icon: 'paw-outline',
    emojis: [
      '🐶', '🐱', '🐭', '🐹', '🐰', '🦊', '🐻', '🐼', '🐨', '🐯', '🦁', '🐮',
      '🐷', '🐸', '🐵', '🙈', '🙉', '🙊', '🐔', '🐧', '🐦', '🐤', '🦆', '🦅',
      '🦉', '🦇', '🐺', '🐗', '🐴', '🦄', '🐝', '🐛', '🦋', '🐌', '🐞', '🐢',
      '🐍', '🐙', '🦑', '🦀', '🐬', '🐳', '🐟', '🦈', '🐊', '🐘', '🦒', '🦓',
    ],
  },
  {
    key: 'food',
    label: 'Nourriture',
    icon: 'fast-food-outline',
    emojis: [
      '🍏', '🍎', '🍐', '🍊', '🍋', '🍌', '🍉', '🍇', '🍓', '🫐', '🍈', '🍒',
      '🍑', '🥭', '🍍', '🥥', '🥝', '🍅', '🥑', '🍆', '🥔', '🥕', '🌽', '🌶️',
      '🥒', '🥬', '🥦', '🧄', '🧅', '🍄', '🥜', '🍞', '🥐', '🥖', '🧀', '🍗',
      '🍖', '🌭', '🍔', '🍟', '🍕', '🌮', '🌯', '🥗', '🍝', '🍜', '🍣', '🍦',
      '🍩', '🍪', '🎂', '🍰', '🧁', '🍫', '🍬', '🍿', '☕', '🍺', '🍷', '🥂',
    ],
  },
  {
    key: 'activities',
    label: 'Activités',
    icon: 'football-outline',
    emojis: [
      '⚽', '🏀', '🏈', '⚾', '🎾', '🏐', '🏉', '🎱', '🏓', '🏸', '🥅', '🏒',
      '🏑', '🥍', '🏏', '⛳', '🏹', '🎣', '🥊', '🥋', '🎽', '🛹', '🛼', '🎿',
      '⛷️', '🏂', '🏋️', '🤸', '🤼', '🤽', '🚴', '🏆', '🥇', '🥈', '🥉', '🎯',
      '🎮', '🕹️', '🎲', '🎸', '🎹', '🥁', '🎺', '🎻', '🎤', '🎧', '🎬', '🎨',
    ],
  },
  {
    key: 'travel',
    label: 'Voyage',
    icon: 'airplane-outline',
    emojis: [
      '🚗', '🚕', '🚙', '🚌', '🚑', '🚒', '🚓', '🏎️', '🛵', '🏍️', '🚲', '🛴',
      '✈️', '🚀', '🛸', '🚁', '⛵', '🚤', '🛳️', '🚂', '🚆', '🗺️', '🗿', '🗽',
      '🗼', '🏰', '🏝️', '🏖️', '🏔️', '⛰️', '🌋', '🏕️', '🌅', '🌄', '🌆', '🌇',
      '🌃', '🌌', '🌈', '☀️', '🌤️', '⛅', '🌧️', '⛈️', '❄️', '☃️', '🌊', '🔥',
    ],
  },
  {
    key: 'objects',
    label: 'Objets',
    icon: 'bulb-outline',
    emojis: [
      '⌚', '📱', '💻', '⌨️', '🖥️', '🖨️', '🕹️', '💾', '💿', '📷', '📸', '📹',
      '🎥', '📞', '☎️', '📺', '📻', '🧭', '⏰', '⏳', '📡', '🔋', '🔌', '💡',
      '🔦', '🕯️', '🧯', '🛒', '💰', '💸', '💳', '💎', '⚖️', '🔧', '🔨', '🛠️',
      '🔑', '🔒', '🔓', '🚪', '🛏️', '🚿', '🧸', '🎁', '🎈', '🎀', '📦', '📬',
      '📝', '📚', '📖', '🔖', '📎', '✂️', '📅', '📈', '📉', '📊', '🔍', '🔔',
    ],
  },
  {
    key: 'symbols',
    label: 'Symboles',
    icon: 'shapes-outline',
    emojis: [
      '✅', '❌', '❓', '❗', '⚠️', '🚫', '💤', '🆗', '🆕', '🔝', '🔞', '♻️',
      '⚡', '🌀', '🎵', '🎶', '➕', '➖', '✖️', '➗', '🟰', '💲', '🔴', '🟠',
      '🟡', '🟢', '🔵', '🟣', '⚫', '⚪', '🟥', '🟧', '🟨', '🟩', '🟦', '🟪',
      '⬛', '⬜', '🔶', '🔷', '🔸', '🔹', '🔺', '🔻', '💠', '🔘', '🏁', '🚩',
    ],
  },
];

export default function EmojiPickerSheet({ visible, onClose, onSelect }: EmojiPickerSheetProps) {
  const [categoryKey, setCategoryKey] = useState(CATEGORIES[0].key);
  const [query, setQuery] = useState('');

  const emojis = useMemo(() => {
    // La recherche porte sur le nom de catégorie : les emojis n'ont pas de
    // libellé embarqué ici, et inventer des mots-clés donnerait une recherche
    // qui ment plus qu'elle n'aide.
    const q = query.trim().toLowerCase();
    if (q) {
      const matching = CATEGORIES.filter((c) => c.label.toLowerCase().includes(q));
      return matching.flatMap((c) => c.emojis);
    }
    return CATEGORIES.find((c) => c.key === categoryKey)?.emojis || [];
  }, [categoryKey, query]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={styles.backdrop}>
          <TouchableWithoutFeedback onPress={() => {}}>
            <View style={styles.sheet}>
              <View style={styles.grabber} />

              <View style={styles.searchRow}>
                <Ionicons name="search" size={16} color={colors.textMuted} />
                <TextInput
                  value={query}
                  onChangeText={setQuery}
                  placeholder="Rechercher une catégorie"
                  placeholderTextColor={colors.textMuted}
                  style={styles.searchInput}
                  autoCorrect={false}
                />
                {query ? (
                  <Pressable onPress={() => setQuery('')} hitSlop={10}>
                    <Ionicons name="close-circle" size={17} color={colors.textMuted} />
                  </Pressable>
                ) : null}
              </View>

              {!query ? (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.tabs}
                >
                  {CATEGORIES.map((category) => {
                    const active = category.key === categoryKey;
                    return (
                      <Pressable
                        key={category.key}
                        onPress={() => setCategoryKey(category.key)}
                        style={[styles.tab, active && styles.tabActive]}
                        accessibilityLabel={category.label}
                      >
                        <Ionicons
                          name={category.icon}
                          size={19}
                          color={active ? colors.accent : colors.textMuted}
                        />
                      </Pressable>
                    );
                  })}
                </ScrollView>
              ) : null}

              <ScrollView
                contentContainerStyle={styles.grid}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
              >
                {emojis.length === 0 ? (
                  <Text style={styles.empty}>Aucune catégorie ne correspond.</Text>
                ) : (
                  emojis.map((emoji, index) => (
                    <Pressable
                      key={`${emoji}-${index}`}
                      onPress={() => onSelect(emoji)}
                      style={({ pressed }) => [styles.cell, pressed && styles.cellPressed]}
                    >
                      <Text style={styles.cellEmoji}>{emoji}</Text>
                    </Pressable>
                  ))
                )}
              </ScrollView>
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: colors.overlay },
  sheet: {
    height: '62%',
    paddingTop: 8,
    // La navbar système recouvre le bas des écrans : marge fixe, aucun
    // SafeAreaProvider n'est monté dans cette app.
    paddingBottom: 28,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    backgroundColor: colors.surfaceAlt,
  },
  grabber: {
    alignSelf: 'center',
    width: 38,
    height: 4,
    borderRadius: 2,
    marginBottom: 12,
    backgroundColor: colors.borderStrong,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 16,
    paddingHorizontal: 12,
    height: 40,
    borderRadius: 12,
    backgroundColor: colors.surface,
  },
  searchInput: {
    flex: 1,
    color: colors.textPrimary,
    fontSize: 14,
    fontFamily: fonts.regular,
    padding: 0,
  },
  tabs: { paddingHorizontal: 12, gap: 6, paddingVertical: 10 },
  tab: {
    width: 40,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
  },
  tabActive: { backgroundColor: colors.accentSoft },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 12,
    paddingBottom: 16,
  },
  cell: {
    width: '12.5%',
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cellPressed: { opacity: 0.45 },
  cellEmoji: { fontSize: 27, lineHeight: 33 },
  empty: {
    color: colors.textMuted,
    fontSize: 13,
    fontFamily: fonts.regular,
    padding: 20,
  },
});
