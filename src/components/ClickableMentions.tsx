import { colors, fonts } from '../theme';
import React from 'react';
import { Text, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { behaviorTracker } from '../services/behaviorTracker';

interface ClickableMentionsProps {
  text: string;
  mentions?: string[];
  style?: any;
  numberOfLines?: number;
  tweetId?: string;
  contextData?: any;
}

export default function ClickableMentions({ text, mentions = [], style, numberOfLines, tweetId, contextData }: ClickableMentionsProps) {
  const navigation = useNavigation();

  const handleMentionPress = (username: string) => {
    console.log(`🔍 Clic sur mention: @${username}`);
    
    // 📊 Tracking du clic sur mention
    behaviorTracker.trackAction('mention_click', username, 'user', {
      ...contextData,
      tweet_id: tweetId,
      mention_username: username,
      source: 'tweet_content'
    });
    
    const params = { username };
    const parent = (navigation as any).getParent?.();
    if (parent?.navigate) {
      parent.navigate('UserProfile', params);
    } else {
      (navigation as any).navigate('UserProfile', params);
    }
  };

  const handleHashtagPress = (hashtag: string) => {
    console.log(`🔍 Clic sur hashtag: #${hashtag}`);
    
    // 📊 Tracking du clic sur hashtag
    behaviorTracker.trackAction('hashtag_click', hashtag, 'hashtag', {
      ...contextData,
      tweet_id: tweetId,
      hashtag: hashtag,
      source: 'tweet_content'
    });
    
    const searchParams = {
      query: `#${hashtag}`,
      searchType: 'hashtags' as const,
    };
    const navParent = (navigation as any).getParent?.();
    if (navParent?.navigate) {
      navParent.navigate('MainTabs', {
        screen: 'Recherche',
        params: searchParams,
      });
    } else {
      (navigation as any).navigate('Recherche', searchParams);
    }
  };

  /**
   * Découpage du texte, calculé une seule fois par contenu.
   *
   * Ce composant est monté sur CHAQUE ligne du fil. Le découpage tournait à
   * chaque rendu : deux balayages d'expression régulière sur tout le corps du
   * tweet, plus la construction de deux tableaux — y compris pour un simple
   * like, et y compris pour l'immense majorité des tweets qui ne contiennent
   * ni mention ni hashtag. C'est du travail sur le thread JS, donc du travail
   * qui se voit pendant le défilement.
   */
  const parts = React.useMemo(() => {
    // Sortie immédiate : un `indexOf` coûte une fraction d'un balayage de
    // regex, et il tranche pour la plupart des tweets.
    if (!text || (text.indexOf('@') < 0 && text.indexOf('#') < 0)) return null;

    const parts: any[] = [];
    let lastIndex = 0;

    // Combiner tous les matches (mentions et hashtags)
    const allMatches: any[] = [];
    let match;

    // Trouver toutes les mentions dans le texte
    const mentionRegex = /@(\w+)/g;
    while ((match = mentionRegex.exec(text)) !== null) {
      allMatches.push({
        type: 'mention',
        match: match[0],
        username: match[1],
        index: match.index,
        length: match[0].length
      });
    }

    // Trouver tous les hashtags dans le texte
    const hashtagRegex = /#(\w+)/g;
    while ((match = hashtagRegex.exec(text)) !== null) {
      allMatches.push({
        type: 'hashtag',
        match: match[0],
        hashtag: match[1],
        index: match.index,
        length: match[0].length
      });
    }

    // Trier par position dans le texte
    allMatches.sort((a, b) => a.index - b.index);

    // Traiter chaque match
    allMatches.forEach((item) => {
      // Ajouter le texte avant l'élément cliquable
      if (item.index > lastIndex) {
        parts.push({
          type: 'text',
          content: text.slice(lastIndex, item.index),
          key: `text-${lastIndex}`
        });
      }

      // Ajouter l'élément cliquable (mention ou hashtag)
      if (item.type === 'mention') {
        parts.push({
          type: 'mention',
          content: item.match, // @username
          username: item.username, // username
          key: `mention-${item.index}`
        });
      } else if (item.type === 'hashtag') {
        parts.push({
          type: 'hashtag',
          content: item.match, // #hashtag
          hashtag: item.hashtag, // hashtag
          key: `hashtag-${item.index}`
        });
      }

      lastIndex = item.index + item.length;
    });

    // Ajouter le texte restant après le dernier élément
    if (lastIndex < text.length) {
      parts.push({
        type: 'text',
        content: text.slice(lastIndex),
        key: `text-${lastIndex}`
      });
    }

    return parts.length ? parts : null;
  }, [text]);

  // Rien de cliquable : un seul `Text`, aucun sous-arbre à construire.
  if (!parts) {
    return <Text style={[styles.text, style]} numberOfLines={numberOfLines}>{text}</Text>;
  }

  // Rendre chaque partie en utilisant des Text imbriqués pour maintenir la continuité
  return (
      <Text style={[styles.text, style]} numberOfLines={numberOfLines}>
        {parts.map((part) => {
          if (part.type === 'mention') {
            return (
              <Text 
                key={part.key} 
                style={styles.mention}
                onPress={() => handleMentionPress(part.username)}
                suppressHighlighting={false}
              >
                {part.content}
              </Text>
            );
          } else if (part.type === 'hashtag') {
            return (
              <Text 
                key={part.key} 
                style={styles.hashtag}
                onPress={() => handleHashtagPress(part.hashtag)}
                suppressHighlighting={false}
              >
                {part.content}
              </Text>
            );
          } else {
            return (
              <Text key={part.key} style={styles.text}>
                {part.content}
              </Text>
            );
          }
        })}
      </Text>
  );
}

const styles = StyleSheet.create({
  text: {
    // Était '#ffffff' en dur : tout tweet contenant un @ ou un # passe par ce
    // composant, donc son texte entier devenait invisible en thème clair.
    color: colors.textPrimary,
    fontSize: 16,
    lineHeight: 22,
  },
  mention: {
    // Était '#4F7CFF' — l'indigo de l'ancienne DA « Encre », abandonnée.
    color: colors.cyan,
    fontWeight: '600', fontFamily: fonts.semibold,
  },
  hashtag: {
    color: colors.cyan,
    fontWeight: '600', fontFamily: fonts.semibold,
  },
});