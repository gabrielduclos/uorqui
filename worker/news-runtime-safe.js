import { withNewsEditorialQuality } from './news-editorial-quality.js';
import './news-image-final-safety.js';
import './news-image-recovery.js';
import './news-source-safety.js';
import { activeNewsRotationIndex, setNewsRotationTimestamp } from './news-query-rotation.js';
import './notification-policy.js';
import './message-notification-policy.js';
import runtime, { RealtimeHub } from './news-runtime.js';
import { runHealthNewsCycle } from './health-news-cycle.js';
import { publicBetaMonetizationResponse } from './public-beta-monetization.js';
import { handleCommunityNotificationPreferenceRequest } from './community-notification-preferences.js';
import { handleBootstrapRefresh } from './bootstrap-refresh.js';
import { handlePublicPostRequest } from './public-post.js';
import { handlePublicSharePage } from './public-share-page.js';
import { scheduleOfficialCommunityAdminSync } from './official-community-admin-sync.js';

export { RealtimeHub };

const HOURLY_NEWS_AGENTS = [
  'tecnologia-ia',
  'games',
  'motos',
  'carros',
  'financas',
  'carreira',
  'esportes',
  'filmes-series',
  'ciencia',
  'viagens',
  'saude'
];

export default {
  async fetch(request, env, ctx) {
    const sharePageResponse = await handlePublicSharePage(request, env);
    if (sharePageResponse) return sharePageResponse;

    const publicPostResponse = await handlePublicPostRequest(request, env);
    if (publicPostResponse) return publicPostResponse;

    const bootstrapRefreshResponse = await handleBootstrapRefresh(request, env);
    if (bootstrapRefreshResponse) return bootstrapRefreshResponse;

    const preferenceResponse = await handleCommunityNotificationPreferenceRequest(request, env);
    if (preferenceResponse) return preferenceResponse;

    const betaResponse = publicBetaMonetizationResponse(request);
    if (betaResponse) return betaResponse;

    const response = await runtime.fetch(request, withNewsEditorialQuality(env), ctx);
    scheduleOfficialCommunityAdminSync(request, response, env, ctx);
    return response;
  },

  async scheduled(controller, env, ctx) {
    const scheduledAt = Number(controller?.scheduledTime || Date.now());
    const editorialEnv = withNewsEditorialQuality(env);
    setNewsRotationTimestamp(scheduledAt);

    const activeIndex = activeNewsRotationIndex(scheduledAt);
    const activeAgent = HOURLY_NEWS_AGENTS[activeIndex] || 'unknown';

    console.info('Uorqui hourly news cycle started', {
      activeIndex,
      activeAgent,
      scheduledAt: new Date(scheduledAt).toISOString()
    });

    // Saúde ocupa um dos 11 slots da mesma rotação. Nos outros dez slots o
    // editor principal roda normalmente, mas news-query-rotation.js devolve RSS
    // vazio para os nove agentes inativos. Assim apenas um agente faz buscas,
    // enriquece matéria, chama IA e grava no Firestore por hora.
    if (activeAgent === 'saude') {
      try {
        const result = await runHealthNewsCycle(editorialEnv, scheduledAt);
        console.info('Uorqui hourly news cycle complete', { activeAgent, ...result });
      } catch (error) {
        console.error('Uorqui hourly health news cycle failed:', error?.message || error);
      }
      return;
    }

    try {
      const result = await runtime.scheduled(controller, editorialEnv, ctx);
      console.info('Uorqui hourly news cycle dispatched', { activeAgent });
      return result;
    } catch (error) {
      console.error('Uorqui hourly main news cycle failed:', activeAgent, error?.message || error);
      throw error;
    }
  }
};
