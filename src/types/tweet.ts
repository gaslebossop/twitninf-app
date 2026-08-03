export interface User {
  id: string;
  username: string;
  displayName: string;
  avatar?: string;
  verified?: boolean;
  stats?: {
    followers: number;
    following: number;
    tweets: number;
  };
}

export interface Tweet {
  id: string;
  user: User;
  content: string;
  timestamp: string;
  likes: number;
  retweets: number;
  replies: number;
  isLiked: boolean;
  isRetweeted: boolean;
  media?: string[];
  hashtags?: string[];
  mentions?: string[];
}

export interface TweetAction {
  type: 'like' | 'retweet' | 'reply' | 'share';
  tweetId: string;
  userId: string;
  timestamp: Date;
}

export interface TweetStats {
  tweetId: string;
  likes: number;
  retweets: number;
  replies: number;
  views: number;
}
