import { fonts } from '../theme';
import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import PromoteTweetModal from './PromoteTweetModal';
import { toast } from './ui/Toast';

interface Tweet {
  id: string;
  content: string;
  view_count: number;
  like_count: number;
  retweet_count: number;
  user_id: string;
}

interface PromoteButtonProps {
  tweet: Tweet;
  onPromotionSuccess?: () => void;
}

export default function PromoteButton({ tweet, onPromotionSuccess }: PromoteButtonProps) {
  const [showPromoteModal, setShowPromoteModal] = useState(false);

  const handlePromote = () => {
    setShowPromoteModal(true);
  };

  const handlePromotionSuccess = () => {
    setShowPromoteModal(false);
    onPromotionSuccess?.();
    toast.success('Votre tweet est maintenant promu ! Il apparaîtra dans le feed des utilisateurs ciblés.');
  };

  return (
    <>
      <TouchableOpacity
        style={styles.promoteButton}
        onPress={handlePromote}
        activeOpacity={0.7}
      >
        <Ionicons name="megaphone-outline" size={16} color="#4F7CFF" />
        <Text style={styles.promoteButtonText}>Promouvoir</Text>
      </TouchableOpacity>

      <PromoteTweetModal
        visible={showPromoteModal}
        tweet={tweet}
        onClose={() => setShowPromoteModal(false)}
        onSuccess={handlePromotionSuccess}
      />
    </>
  );
}

const styles = StyleSheet.create({
  promoteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f0f8ff',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#4F7CFF',
    marginTop: 8,
  },
  promoteButtonText: {
    fontSize: 14,
    fontWeight: '600', fontFamily: fonts.semibold,
    color: '#4F7CFF',
    marginLeft: 4,
  },
});
