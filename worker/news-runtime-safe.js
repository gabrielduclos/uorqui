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
    await prepareNewsTestMode(env, controller?.scheduledTime || Date.now());
    return runtime.scheduled(controller, env, ctx);
  }
};
