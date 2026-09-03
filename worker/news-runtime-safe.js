import './news-image-recovery.js';
import './news-source-safety.js';
import './news-query-rotation.js';
import './notification-policy.js';
import runtime, { RealtimeHub } from './news-runtime.js';
import { prepareNewsTestMode } from './news-test-mode.js';
import { publicBetaMonetizationResponse } from './public-beta-monetization.js';
import { handleCommunityNotificationPreferenceRequest } from './community-notification-preferences.js';
import { handlePublicPostRequest } from './public-post.js';
import { scheduleOfficialCommunityAdminSync } from './official-community-admin-sync.js';

export { RealtimeHub };

export default {
  async fetch(request, env, ctx) {
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

    // O ciclo do minuto :00 fica reservado para manutenção editorial de teste:
    // reconciliação dos posts apagados, seed/sincronização das comunidades
    // oficiais e tentativa da comunidade Saúde. Isso evita que dezenas de
    // operações Firestore concorram com as buscas dos demais agentes.
    if (minute === 0) {
      console.info('Uorqui news maintenance cycle started', { minute });
      await prepareNewsTestMode(env, scheduledAt);
      console.info('Uorqui news maintenance cycle complete', { minute });
      return;
    }

    // :15, :30 e :45 ficam exclusivamente para o editor principal. Assim cada
    // execução tem o orçamento de subrequisições inteiro disponível para
    // Google/Bing, leitura da matéria, IA, Firestore e notificações.
    console.info('Uorqui main news cycle started', { minute });
    return runtime.scheduled(controller, env, ctx);
  }
};
