import { Platform } from 'react-native';
import { apiService } from './index';
import tokenStore from './tokenStore';
import { buildClientHeaders } from './clientIdentity';

/**
 * Publication d'un tweet vidéo.
 *
 * Le parcours vit ici et plus dans un écran : le composeur de tweet et l'écran
 * de légende vidéo publient tous les deux par ce chemin, et la logique
 * (envoi multipart avec progression, puis attente du transcodage) n'a aucune
 * raison d'exister en double.
 *
 * Deux phases côté serveur :
 *  - `201` : la vidéo était assez légère, le tweet est déjà publié ;
 *  - `202` : le tweet est créé mais le transcodage 720p tourne encore. On
 *    interroge alors le tweet jusqu'à ce que sa modération passe à
 *    `approved`, en relayant `metadata.video_processing_percent`.
 */

export type VideoUploadPhase = 'uploading' | 'processing';

export interface PublishVideoTweetOptions {
  videoUri: string;
  content: string;
  isPrivate?: boolean;
  isSensitive?: boolean;
  translationEnabled?: boolean;
  /** Réponse à un tweet, si le composeur était ouvert en réponse. */
  parentTweetId?: string;
  /**
   * Habillage produit par l'éditeur. La vidéo part BRUTE : c'est l'API qui
   * incruste et étalonne pendant son transcodage, pour ne pas empiler deux
   * compressions. Voir `videoEditService.js` côté serveur.
   */
  overlaysJson?: string;
  filterId?: string;
  muted?: boolean;
  /** `percent` vaut 0-100 et repart de 0 entre les deux phases. */
  onProgress?: (phase: VideoUploadPhase, percent: number) => void;
}

export interface PublishVideoTweetResult {
  success: boolean;
  tweetId?: string;
  /** Message prêt à afficher en cas d'échec. */
  message?: string;
}

/** Durée maximale d'attente du transcodage : 60 sondages de 2 s. */
const POLL_INTERVAL_MS = 2000;
const POLL_MAX_ATTEMPTS = 60;

function fileNameFor(videoUri: string): { name: string; type: string } {
  const ext = (videoUri.split('.').pop() || 'mp4').toLowerCase();
  return {
    name: `video-${Date.now()}.${ext}`,
    type: `video/${ext === 'mov' ? 'quicktime' : ext}`,
  };
}

function buildFormData(options: PublishVideoTweetOptions): FormData {
  const {
    videoUri, content, isPrivate, isSensitive, translationEnabled, parentTweetId,
    overlaysJson, filterId, muted,
  } = options;
  const formData = new FormData();

  // N'envoyer que ce qui a été choisi : l'API ne déclenche la passe
  // d'habillage que si l'un de ces champs est présent.
  if (overlaysJson && overlaysJson !== '[]') formData.append('overlays', overlaysJson);
  if (filterId && filterId !== 'none') formData.append('filter', filterId);
  if (muted) formData.append('muted', 'true');

  formData.append('content', content.trim());
  formData.append('is_private', isPrivate ? 'true' : 'false');
  if (isSensitive) formData.append('is_sensitive', 'true');
  if (translationEnabled) formData.append('translation_enabled', 'true');
  if (parentTweetId) formData.append('parent_tweet_id', parentTweetId);

  const { name, type } = fileNameFor(videoUri);
  formData.append('video', {
    // iOS refuse le préfixe `file://` dans un multipart.
    uri: Platform.OS === 'ios' ? videoUri.replace('file://', '') : videoUri,
    name,
    type,
  } as any);

  return formData;
}

/** Attend la fin du transcodage. Résout dès que le tweet est exploitable. */
async function waitForProcessing(
  tweetId: string,
  baseUrl: string,
  token: string | null,
  clientHeaders: Record<string, string>,
  onProgress?: PublishVideoTweetOptions['onProgress'],
): Promise<PublishVideoTweetResult> {
  for (let attempt = 0; attempt < POLL_MAX_ATTEMPTS; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));

    try {
      // Mêmes en-têtes d'identité que l'envoi : ces sondages se répètent
      // toutes les 2 s, et un client non reconnu se ferait limiter en débit
      // par l'anti-fraude en plein transcodage.
      const response = await fetch(`${baseUrl}/api/tweets/${tweetId}`, {
        headers: token ? { ...clientHeaders, Authorization: `Bearer ${token}` } : clientHeaders,
      });
      const payload = await response.json();
      const tweet = payload?.success ? payload.data : null;
      if (!tweet) continue;

      if (tweet.moderation_status === 'approved') {
        onProgress?.('processing', 100);
        return { success: true, tweetId };
      }
      if (tweet.moderation_status === 'rejected' || tweet.moderation_status === 'error') {
        return { success: false, tweetId, message: 'Le traitement de la vidéo a échoué.' };
      }

      const percent = Number(tweet.metadata?.video_processing_percent) || 0;
      if (percent > 0) onProgress?.('processing', percent);
    } catch {
      // Une sonde ratée (réseau qui hoquette) ne doit pas abandonner la
      // publication : le tweet est déjà créé côté serveur.
    }
  }

  // Le transcodage continue côté serveur ; on rend la main sans le présenter
  // comme un échec, sinon l'utilisateur republierait la même vidéo.
  return {
    success: true,
    tweetId,
    message: 'Le traitement prend plus de temps que prévu. La vidéo apparaîtra bientôt sur ton profil.',
  };
}

export async function publishVideoTweet(
  options: PublishVideoTweetOptions,
): Promise<PublishVideoTweetResult> {
  const { onProgress } = options;
  const token = await tokenStore.getAccessToken();
  const baseUrl = apiService.getConnectionStatus().baseURL;
  const formData = buildFormData(options);
  const clientHeaders = await buildClientHeaders();

  onProgress?.('uploading', 0);

  // `fetch` n'expose aucune progression d'envoi : pour une vidéo, c'est la
  // seule partie longue et visible, d'où XHR.
  const upload = await new Promise<{ status: number; body: any }>((resolve, reject) => {
    const xhr = new XMLHttpRequest();

    xhr.upload.onprogress = (event) => {
      if (!event.lengthComputable) return;
      onProgress?.('uploading', Math.round((event.loaded * 100) / event.total));
    };

    xhr.onload = () => {
      try {
        resolve({ status: xhr.status, body: JSON.parse(xhr.responseText) });
      } catch {
        reject(new Error('Réponse illisible du serveur.'));
      }
    };
    xhr.onerror = () => reject(new Error('Connexion au serveur impossible.'));

    const uploadId = `up_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    xhr.open('POST', `${baseUrl}/api/tweets/video?uploadId=${uploadId}`);
    if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);

    /**
     * Identité du client — indispensable ICI en particulier.
     *
     * Le middleware anti-fraude de l'API rejette en 413 (« Payload trop
     * volumineux ») toute requête de plus de 5 Mo qui ne vient pas d'un
     * client first-party authentifié, et une vidéo dépasse ce seuil par
     * construction. Cette requête ne posait que `Authorization` et `Accept` :
     * elle ratait donc systématiquement le contrôle, et AUCUN upload vidéo ne
     * pouvait aboutir. `buildClientHeaders` est la source unique de ces
     * en-têtes — les réécrire à la main est précisément ce qui a causé
     * l'oubli.
     */
    Object.entries(clientHeaders).forEach(([key, value]) => {
      // Content-Type exclu : c'est FormData qui pose la boundary.
      if (key.toLowerCase() !== 'content-type') xhr.setRequestHeader(key, value);
    });

    xhr.send(formData as any);
  }).catch((err: Error) => ({ status: 0, body: { message: err.message } }));

  const { status, body } = upload;

  if (status < 200 || status >= 300 || !body?.success) {
    return { success: false, message: body?.message || 'Impossible de publier la vidéo.' };
  }

  if (status === 202 && body?.data?.id) {
    onProgress?.('processing', 0);
    return waitForProcessing(String(body.data.id), baseUrl, token, clientHeaders, onProgress);
  }

  return { success: true, tweetId: body?.data?.id ? String(body.data.id) : undefined };
}
