import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { fonts, radius, withAlpha } from '../../theme';
import type { EventArt } from '../../theme/eventArt';
import type { QuestRewardKind, QuestView } from '../../types/events';

/**
 * L'onglet « Récompenses » — la vitrine.
 *
 * ── Pourquoi une vue séparée alors que chaque quête affiche déjà la sienne ──
 * Parce que ce ne sont pas les mêmes questions. Sur une quête, la récompense
 * répond à « est-ce que ça vaut le coup de faire ÇA ? ». Ici, l'ensemble
 * répond à « qu'est-ce qu'il y a à gagner en tout ? » — la question qu'on se
 * pose AVANT de commencer, et celle qui décide si on s'y met.
 *
 * D'où le parti pris : les récompenses non obtenues restent visibles et
 * lisibles, jamais floutées ni masquées. Une vitrine où l'on ne voit pas ce
 * qu'on peut gagner ne donne envie de rien. Seules les tables de tirage
 * gardent leur secret, et elles annoncent quand même leur contenu possible.
 */

interface Props {
  art: EventArt;
  quests: QuestView[];
}

const KIND_ICON: Record<QuestRewardKind, string> = {
  coins: 'cash',
  pro_days: 'star',
  cosmetic: 'color-palette',
  badge: 'ribbon',
  title: 'text',
  lootbox: 'gift',
  multiplier: 'flash',
  unlock: 'key',
};

const KIND_LABEL: Record<QuestRewardKind, string> = {
  coins: 'Monnaie',
  pro_days: 'Accès Pro',
  cosmetic: 'Cosmétique',
  badge: 'Badge',
  title: 'Titre',
  lootbox: 'Paquet surprise',
  multiplier: 'Bonus',
  unlock: 'Déblocage',
};

export default function EventRewards({ art, quests }: Props) {
  const { owned, locked, total } = useMemo(() => {
    const ownedList = quests.filter((q) => q.state.claimed);
    const lockedList = quests.filter((q) => !q.state.claimed);
    return { owned: ownedList, locked: lockedList, total: quests.length };
  }, [quests]);

  const renderRow = (quest: QuestView, isOwned: boolean) => {
    const tier = art.tier[quest.tier];
    const kind = quest.reward.kind;
    const tint = isOwned ? tier.color : art.colors.textMuted;

    return (
      <View
        key={quest.id}
        style={[
          S.row,
          { backgroundColor: art.colors.surface, borderColor: art.colors.border },
          isOwned && { borderColor: withAlpha(tier.color, 0.45) },
        ]}
      >
        {isOwned && (
          <LinearGradient
            colors={[withAlpha(tier.color, 0.12), 'transparent']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill}
            pointerEvents="none"
          />
        )}

        <View style={[S.icon, { backgroundColor: withAlpha(tint, 0.15) }]}>
          <Ionicons name={(KIND_ICON[kind] ?? 'gift') as any} size={17} color={tint} />
        </View>

        <View style={S.body}>
          <Text
            style={[S.label, { color: isOwned ? art.colors.text : art.colors.textDim }]}
            numberOfLines={2}
          >
            {quest.reward.label}
          </Text>
          <Text style={[S.meta, { color: art.colors.textMuted }]} numberOfLines={1}>
            {KIND_LABEL[kind] ?? 'Récompense'} · {quest.title}
          </Text>
          {/* Un paquet annonce ce qu'il PEUT contenir, jamais ce qu'il
              contiendra : c'est ce qui en fait un paquet. */}
          {!!quest.reward.teaser?.length && !isOwned && (
            <Text style={[S.teaser, { color: art.colors.textMuted }]} numberOfLines={2}>
              Peut contenir : {quest.reward.teaser.join(' · ')}
            </Text>
          )}
        </View>

        <Ionicons
          name={isOwned ? 'checkmark-circle' : 'lock-closed'}
          size={16}
          color={isOwned ? tier.color : art.colors.textMuted}
        />
      </View>
    );
  };

  return (
    <View style={S.root}>
      <View style={[S.summary, { backgroundColor: art.colors.surface, borderColor: art.colors.border }]}>
        <Text style={[S.summaryValue, { fontFamily: art.fonts.display, color: art.colors.festive }]}>
          {owned.length}/{total}
        </Text>
        <Text style={[S.summaryLabel, { color: art.colors.textDim }]}>
          récompenses débloquées. Après le 31 août, celles qui restent ne seront
          plus jamais distribuées.
        </Text>
      </View>

      {owned.length > 0 && (
        <>
          <Text style={[S.section, { color: art.colors.text }]}>À toi</Text>
          {owned.map((q) => renderRow(q, true))}
        </>
      )}

      {locked.length > 0 && (
        <>
          <Text style={[S.section, { color: art.colors.text }]}>À gagner</Text>
          {locked.map((q) => renderRow(q, false))}
        </>
      )}
    </View>
  );
}

const S = StyleSheet.create({
  root: { gap: 0 },

  summary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 15,
    marginBottom: 4,
  },
  summaryValue: { fontSize: 30, letterSpacing: 0.3 },
  summaryLabel: { flex: 1, fontFamily: fonts.regular, fontSize: 12, lineHeight: 17 },

  section: {
    fontFamily: fonts.display,
    fontSize: 14.5,
    letterSpacing: 0.2,
    marginTop: 18,
    marginBottom: 9,
  },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 12,
    marginBottom: 8,
    overflow: 'hidden',
  },
  icon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: { flex: 1 },
  label: { fontFamily: fonts.semibold, fontSize: 13.5, lineHeight: 18 },
  meta: { fontFamily: fonts.regular, fontSize: 11.5, marginTop: 2 },
  teaser: { fontFamily: fonts.regular, fontSize: 11, lineHeight: 15, marginTop: 4 },
});
