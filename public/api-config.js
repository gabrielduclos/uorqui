// URL pública do Cloudflare Worker que serve a API do Uorqui.
// Em produção, troque pelo domínio do Worker, por exemplo:
//   https://api.uorqui.com.br/api
// ou pelo workers.dev gerado no primeiro deploy.
window.UORQUI_API_BASE = (location.hostname === '127.0.0.1' || location.hostname === 'localhost')
  ? 'http://127.0.0.1:8787/api'
  : 'https://uorqui-api.uorqui1.workers.dev/api';
