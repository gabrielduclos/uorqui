# Migração segura do novo Uorqui para uorqui.app

Esta sequência trata **somente do novo Uorqui** (`gabrielduclos/uorqui`, Worker `main`, Render `uorqui-social-api`). O legado `uorqui-chat` e seus bancos/objetos **não podem ser modificados na preparação**.

## Inventário confirmado em 01/11/2026

- Domínio `uorqui.app`: custom domain Cloudflare atualmente associado ao Worker `uorqui-chat`.
- Novo frontend: Worker `main`, endereço de verificação `https://main.uorqui1.workers.dev`.
- Nova API: `https://uorqui-social-api.onrender.com` (Render).
- Turnstile `uorqui`: domínios autorizados `main.uorqui1.workers.dev` **e** `uorqui.app`.
- O PWA antigo e o novo usam `id: "/"`, `scope: "/"` e `/sw.js`: a identidade instalada em `uorqui.app` pode continuar, mas ícones iOS e a permissão Web Push precisam de verificação manual. **Dados e contas antigas não são migrados.**
- O HTML da nova aplicação registra `/sw.js` antes do login, inclusive quando já havia registro anterior da mesma origem. Não forçar reload em `controllerchange`.
- O backend aceita a origem principal de `WEB_ORIGIN` e somente origens HTTPS adicionais explicitamente configuradas em `WEB_EXTRA_ORIGINS`. Nenhum wildcard.

## Preparação reversível (sem tocar no domínio)

1. Publicar código do novo Uorqui com teste CI de origens e registro antecipado do service worker.
2. Configurar no **Render** `WEB_EXTRA_ORIGINS=https://uorqui.app,https://main.uorqui1.workers.dev`. Manter `WEB_ORIGIN` e `AUTH_BASE_URL` apontando para `https://main.uorqui1.workers.dev` até a virada.
3. Checar `GET /health/ready`, `GET /api/v1/status` com `publicRegistration:true`, anônimo `GET /api/v1/me` -> 401 e tokens Turnstile inválidos -> 403.
4. Realizar cadastro com Turnstile válido, chegada de e-mail, confirmação, login, recuperação; testar mensagem e push entre dois navegadores, Android e iOS Home Screen. Os testes CI não enviam e-mail real.
5. Salvar ID do custom domain Cloudflare (para reverter), vínculo atual do Worker, última versão do Worker `main` e informações do deploy ativo do Render.

## Virada (somente após testes anteriores)

1. Atualizar Render `WEB_ORIGIN=https://uorqui.app` e `AUTH_BASE_URL=https://uorqui.app` **na mesma alteração**, mantendo `WEB_EXTRA_ORIGINS`. Esperar deploy `live` e health `ready`.
2. Reassociar o custom domain `uorqui.app` ao Worker `main` pelo Cloudflare. Não alterar R2/D1/bindings do antigo e não migrar cookies antigos.
3. Rodar o smoke `Production signup smoke test` com entrada `target=production` e verificar `/manifest.webmanifest`, `/sw.js`, login, registro, confirmação de e-mail, envio de DM, anexos, feed, comunidade e sala de voz.
4. Abrir o PWA já instalado pela origem `uorqui.app` no iOS e no Android. Validar troca de worker, ausência de tela preta, atualização do ícone (pode exigir reinstalação no iOS), login e consentimento de notificações. **Sessões e histórico do sistema antigo não serão reconhecidos pelo novo**.
5. Só após monitoramento e aceitação, considerar **redirecionar o endereço `uorqui-chat.uorqui1.workers.dev`** para `https://uorqui.app`. Isso é uma etapa posterior, no legado, não automática, e exige preservar endpoints de APIs/APK e avaliar clientes nativos antes de ativar um 301/308 global.

## Rollback imediato

Se houver 5xx ou bloqueio de cadastro/login, reassociar `uorqui.app` ao Worker `uorqui-chat` e reverter `WEB_ORIGIN`/`AUTH_BASE_URL` para `https://main.uorqui1.workers.dev`. Usar o endereço de testes para diagnosticar. Não apagar bancos, buckets, contas, sessões nem caches de mídia como parte do rollback.

## Observações

- Em HTTPS, service workers e web push são vinculados à **origem**, não ao nome do aplicativo. Redirecionar outro hostname não transfere suas inscrições push.
- Não prometer atualização universal do ícone de um PWA já instalado, sobretudo no iPhone.
- Após a virada, `uorqui.app` será o novo sistema, porém o mensageiro empresarial anterior continuará existindo de forma separada até decisão específica.
