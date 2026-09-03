import './news-image-recovery.js';
import './news-source-safety.js';
import './news-query-rotation.js';
import './notification-policy.js';
import runtime, { RealtimeHub } from './news-runtime.js';
import { prepareNewsTestMode } from './news-test-mode.js';
import { publicBetaMonetizationResponse } from './public-beta-monetization.js';
import { handleCommunityNotificationPreferenceRequest } from './community-notification-preferences.js';
import { handlePublicPostRequest } from './public-post.js';
import { handlePublicSharePage } from './public-share-page.js';
import { scheduleOfficialCommunityAdminSync } from './official-community-admin-sync.js';

export { RealtimeHub };

function healthRotationTimestamp(scheduledAt) {
  // news-test-mode escolhe uma das quatro buscas de Saúde usando slots de
  // 15 minutos. Como Saúde roda somente no ciclo :00, usar o timestamp real
  // faria o índice avançar 4 posições por hora e cair sempre na mesma busca.
  // Convertemos o ordinal da hora em um ordinal de slot para avançar exatamente
  // uma consulta por hora: 0, 1, 2, 3 e então reinicia.
  const hourOrdinal = Math.floor(Number(scheduledAt || Date.now()) / (60 * 60 * 1000));
  return hourOrdinal * 15 * 60 * 1000;
}

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

    // O ciclo do minuto :00 fica reservado para manutenção editorial de teste:
    // reconciliação dos posts apagados, seed/sincronização das comunidades
    // oficiais e tentativa da comunidade Saúde. Isso evita que dezenas de
    // operações Firestore concorram com as buscas dos demais agentes.
    if (minute === 0) {
      const healthScheduledAt = healthRotationTimestamp(scheduledAt);
      console.info('Uorqui news maintenance cycle started', {
        minute,
        healthQuerySlot: Math.floor(healthScheduledAt / (15 * 60 * 1000)) % 4
      });
      await prepareNewsTestMode(env, healthScheduledAt);
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
