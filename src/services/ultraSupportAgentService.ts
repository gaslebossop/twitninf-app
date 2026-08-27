import { apiService } from './api';

/**
 * Agent de support IA — avantage Ultra. Miroir de
 * `api/src/routes/ultraSupportAgentRoutes.js` /
 * `api/src/services/ultraSupportAgentService.js`.
 *
 * L'historique est géré ICI (côté client) : le serveur ne persiste pas la
 * conversation, chaque appel reçoit tout l'échange précédent. Simple pour une
 * première version ; à revoir si la continuité entre sessions devient un
 * vrai besoin (l'historique disparaît si on quitte l'écran).
 */

export type AgentRole = 'user' | 'assistant';

export interface AgentMessage {
  role: AgentRole;
  content: string;
}

export interface Outcome<T> {
  ok: boolean;
  data?: T;
  message?: string;
}

export async function sendAgentMessage(
  message: string,
  history: AgentMessage[],
): Promise<Outcome<{ reply: string; ticketFiled: string | null }>> {
  try {
    const res = await apiService.post('/api/support/ai-agent/message', {
      message,
      history: history.slice(-40),
    });
    if (!res?.success) return { ok: false, message: res?.message || 'Réponse impossible.' };
    return {
      ok: true,
      data: { reply: res.data?.reply || '', ticketFiled: res.data?.ticket_filed ?? null },
    };
  } catch (error: any) {
    return { ok: false, message: error?.response?.data?.message || 'Agent indisponible pour le moment.' };
  }
}
