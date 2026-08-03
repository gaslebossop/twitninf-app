import { io } from 'socket.io-client';
import tokenStore from './tokenStore';

/**
 * Serveur de stream (ingestion RTMPS, lecture HLS, chat du live).
 *
 * Une seule adresse est codée ici : l'URL d'ingestion, elle, est renvoyée par
 * le serveur en même temps que la clé. Changer d'hôte ou de port ne demande
 * donc plus de republier l'app — ce qui compte d'autant plus pour un IPA non
 * signé, qu'on ne réinstalle pas tous les jours.
 *
 * L'adresse elle-même vient de `EXPO_PUBLIC_STREAM_SERVER` et non plus d'un
 * domaine en dur — voir la note équivalente dans `config/api.ts`, même
 * raison : le dépôt est destiné à devenir public.
 */
if (!process.env.EXPO_PUBLIC_STREAM_SERVER) {
  throw new Error(
    "EXPO_PUBLIC_STREAM_SERVER manquant. Créer un fichier .env à la racine " +
    'du projet avec EXPO_PUBLIC_STREAM_SERVER=... (voir .env.example).',
  );
}
const streamServerUrl = process.env.EXPO_PUBLIC_STREAM_SERVER;
let parsedStreamServerUrl: URL;
try {
  parsedStreamServerUrl = new URL(streamServerUrl);
} catch {
  throw new Error('EXPO_PUBLIC_STREAM_SERVER doit être une URL absolue valide.');
}

const isLocalDevelopment = ['localhost', '127.0.0.1', '::1'].includes(
  parsedStreamServerUrl.hostname,
);
if (parsedStreamServerUrl.protocol !== 'https:' && !isLocalDevelopment) {
  throw new Error('EXPO_PUBLIC_STREAM_SERVER doit utiliser HTTPS hors développement local.');
}
if (parsedStreamServerUrl.username || parsedStreamServerUrl.password) {
  throw new Error('EXPO_PUBLIC_STREAM_SERVER ne doit pas contenir d’identifiants.');
}

const STREAM_SERVER = streamServerUrl.replace(/\/+$/, '');

/**
 * Le socket porte le jeton d'accès : le serveur en tire l'identité de
 * l'auteur des messages du chat, au lieu de croire ce que le client déclare.
 * `auth` est une fonction, donc réévaluée à chaque (re)connexion — un jeton
 * rafraîchi entre-temps est repris sans recréer le socket.
 */
export const socket = io(STREAM_SERVER, {
  autoConnect: false,
  transports: ['websocket'],
  auth: (cb) => {
    tokenStore
      .getAccessToken()
      .then((token) => cb({ token: token || '' }))
      .catch(() => cb({ token: '' }));
  },
});

/** À appeler à l'ouverture d'un écran de live. */
export function connectLiveSocket() {
  if (!socket.connected) socket.connect();
}

export function disconnectLiveSocket() {
  if (socket.connected) socket.disconnect();
}

export interface LiveRoom {
  liveId: string;
  hostId: string;
  type: string;
  viewerCount: number;
  createdAt: string;
  metadata: {
    playbackUrl: string;
    hostName?: string;
    hostAvatar?: string;
    verified?: boolean;
    verificationStyle?: any;
    [key: string]: any;
  };
}

/** Ce qu'il faut pour publier — délivré une fois, et périssable. */
export interface StreamCredentials {
  liveId: string;
  streamKey: string;
  /** Ex. `rtmps://<domaine-du-serveur-de-stream>:1936/live` */
  ingestUrl: string;
  expiresAt: string;
}

export class LiveServiceError extends Error {
  readonly status?: number;

  constructor(message: string, status?: number) {
    super(message);
    this.name = 'LiveServiceError';
    this.status = status;
  }
}

class LiveService {
  private streamServerUrl = STREAM_SERVER;

  /** Lives actifs. Route publique : pas de jeton nécessaire. */
  async getLives(): Promise<LiveRoom[]> {
    try {
      const res = await fetch(`${this.streamServerUrl}/api/lives`);
      if (!res.ok) return [];
      const data = await res.json();
      return data?.data?.lives || [];
    } catch (e) {
      console.error('[LiveService] getLives error:', e);
      return [];
    }
  }

  /**
   * Ouvre une session de diffusion.
   *
   * La clé est tirée par le serveur à partir du jeton : l'app ne la choisit
   * plus et ne peut donc plus diffuser sous l'identité d'un autre compte.
   * Elle expire si la diffusion ne démarre pas, et ne sert qu'une fois.
   */
  async requestStreamCredentials(): Promise<StreamCredentials> {
    const token = await tokenStore.getAccessToken();
    if (!token) {
      throw new LiveServiceError('Session expirée. Reconnecte-toi pour passer en direct.', 401);
    }

    let res: Response;
    try {
      res = await fetch(`${this.streamServerUrl}/api/keys`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: '{}',
      });
    } catch {
      throw new LiveServiceError('Serveur de diffusion injoignable. Vérifie ta connexion.');
    }

    const payload = await res.json().catch(() => null);

    if (!res.ok || !payload?.success) {
      const message =
        res.status === 401
          ? 'Session expirée. Reconnecte-toi pour passer en direct.'
          : res.status === 403
            ? "Ton compte n'est pas autorisé à diffuser."
            : res.status === 429
              ? 'Trop de tentatives. Réessaie dans quelques minutes.'
              : payload?.error || "Impossible d'ouvrir un live pour le moment.";
      throw new LiveServiceError(message, res.status);
    }

    return payload.data as StreamCredentials;
  }

  /**
   * Ferme son propre live côté serveur. L'arrêt du flux RTMP le fait déjà :
   * ceci ne sert que quand la diffusion n'a jamais démarré.
   */
  async endLive(liveId: string): Promise<void> {
    const token = await tokenStore.getAccessToken();
    if (!token || !liveId) return;
    try {
      await fetch(`${this.streamServerUrl}/api/lives/${encodeURIComponent(liveId)}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch {
      // Sans réseau, le serveur fermera le live à la coupure du flux RTMP.
    }
  }
}

export const liveService = new LiveService();
