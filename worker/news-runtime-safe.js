import './news-image-recovery.js';
import './news-source-safety.js';
import './news-query-rotation.js';
import runtime, { RealtimeHub } from './news-runtime.js';
import { prepareNewsTestMode } from './news-test-mode.js';

export { RealtimeHub };

export default {
  async fetch(request, env, ctx) {
    return runtime.fetch(request, env, ctx);
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
