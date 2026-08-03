// Types de navigation pour l'application TwitNin

export type RootStackParamList = {
  Carousel: undefined;
  Login: undefined;
  Register: undefined;
  MainApp: undefined;
  CreateTweet: {
    parentTweetId?: string;
    replyTo?: string;
  };
};

export type BottomTabParamList = {
  Accueil: undefined;
  Recherche: undefined;
  Notifications: undefined;
  Messages: undefined;
  Profil: undefined;
};

// Types pour les paramètres de navigation
export interface CreateTweetParams {
  parentTweetId?: string;
  replyTo?: string;
}

export interface ProfileParams {
  userId?: string;
  username?: string;
}

export interface TweetDetailParams {
  tweetId: string;
}

export interface UserProfileParams {
  userId: string;
  username: string;
}
