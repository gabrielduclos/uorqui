import './news-image-final-safety.js';
import './news-image-recovery.js';
import './news-source-safety.js';
import './news-query-rotation.js';
import './notification-policy.js';
import runtime, { RealtimeHub } from './news-runtime.js';
import { runHealthNewsCycle } from './health-news-cycle.js';
import { publicBetaMonetizationResponse } from './public-beta-monetization.js';
import { handleCommunityNotificationPreferenceRequest } from './community-notification-preferences.js';
import { handlePublicPostRequest } from './public-post.js';
import { handlePublicSharePage } from './public-share-page.js';
import { scheduleOfficialCommunityAdminSync } from './official-community-admin-sync.js';

export { RealtimeHub };

export default {
  async fetch(request, env, ctx) {
    const sharePageResponse = await handlePublicSharePage(request, env);
    if (sharePageResponse) return sharePageResponse;

    const publicPostResponse = await handlePublicPostRequest(request, env);
    if (publicPostResponse) return publicPostResponse;

    const preferenceResponse = await handleCommunityNotificationPreferenceRequest(request, env);
    if (preferenceResponse) return preferenceResponse;

    const betaResponse = publicBetaMonetizationResponse(request);
    if (betaResponse) return betaResponse;

    const response = await runtime.fetch(request, env, ctx);
    // O runtime acabou de validar o Firebase ID token. Só depois de uma
    // resposta autenticada bem-sucedida sincronizamos o papel do superadmin
    // nas comunidades oficiais, sem depender do cron editorial.
    scheduleOfficialCommunityAdminSync(request, response, env, ctx);
    return response;
  },

  async scheduled(controller, env, ctx) {
    const scheduledAt = Number(controller?.scheduledTime || Date.now());
    const minute = new Date(scheduledAt).getUTCMinutes();

    // Saúde tem um ciclo próprio no :00. Antes ela rodava por último dentro de
    // uma manutenção pesada (seed + superadmins + reconciliação), consumindo o
    // orçamento de subrequests antes da busca. Agora a Lia usa o orçamento da
    // invocação exclusivamente para buscar, validar e publicar Saúde. A própria
    // rotina faz uma reconciliação editorial leve a cada 6 horas.
    if (minute === 0) {
      console.info('Uorqui health news cycle started', { minute });
      try {
        const result = await runHealthNewsCycle(env, scheduledAt);
        console.info('Uorqui health news cycle complete', { minute, ...result });
      } catch (error) {
        console.error('Uorqui health news cycle failed:', error?.message || error);
      }
      return;
    }

    // :15, :30 e :45 ficam exclusivamente para os lotes do editor principal.
    // Cada execução preserva seu orçamento para Google/Bing, leitura da matéria,
    // IA, Firestore e notificações.
    console.info('Uorqui main news cycle started', { minute });
    return runtime.scheduled(controller, env, ctx);
  }
};
