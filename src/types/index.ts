export interface Tweet {
  id: string;
  userId: string;
  content: string;
  createdAt: Date;
  likes: number;
  retweets: number;
}

export interface User {
  id: string;
  username: string;
  email: string;
  profile: string;
}
