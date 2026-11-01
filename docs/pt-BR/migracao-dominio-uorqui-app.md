# Migração segura do novo Uorqui para uorqui.app

Esta sequência trata **somente do novo Uorqui** (`gabrielduclos/uorqui`, Worker `main`, Render `uorqui-social-api`). O legado `uorqui-chat` e seus bancos/objetos **não podem ser modificados na preparação**.

**Versão da aplicação:** `0.1.0-beta.1` (beta técnico, não versão estável). **Situação atual do domínio (01/11/2026):** a API da Cloudflare confirma que `uorqui.app` está associado ao novo Worker `main`. O login com uma conta do novo Uorqui foi confirmado no domínio oficial. **Ainda faltam testes completos de cadastro/e-mail, PWA instalado, push e dispositivos reais; transferência de domínio não equivale a lançamento estável.**

## Inventário confirmado em 01/11/2026

- Domínio `uorqui.app`: custom domain Cloudflare **associado ao Worker `main`**, confirmado novamente em 01/11/2026. O Worker legado `uorqui-chat` continua separado.
- Novo frontend: Worker `main`, endereço de verificação `https://main.uorqui1.workers.dev`.
- Nova API: `https://uorqui-social-api.onrender.com` (Render).
- Turnstile `uorqui`: domínios autorizados `main.uorqui1.workers.dev` **e** `uorqui.app`.
- O PWA antigo e o novo usam `id: "/"`, `scope: "/"` e `/sw.js`: a identidade instalada em `uorqui.app` pode continuar, mas ícones iOS e a permissão Web Push precisam de verificação manual. **Dados e contas antigas não são migrados.**
- O HTML da nova aplicação registra `/sw.js` antes do login, inclusive quando já havia registro anterior da mesma origem. Não forçar reload em `controllerchange`.
- O backend aceita a origem principal de `WEB_ORIGIN` e somente origens HTTPS adicionais explicitamente configuradas em `WEB_EXTRA_ORIGINS`. Nenhum wildcard.

## Histórico da preparação reversível (etapa já realizada)

1. Publicar código do novo Uorqui com teste CI de origens e registro antecipado do service worker.
2. Configurar no **Render** `WEB_EXTRA_ORIGINS=https://uorqui.app,https://main.uorqui1.workers.dev`. Manter `WEB_ORIGIN` e `AUTH_BASE_URL` apontando para `https://main.uorqui1.workers.dev` até a virada.
3. Checar `GET /health/ready`, `GET /api/v1/status` com `publicRegistration:true`, anônimo `GET /api/v1/me` -> 401 e tokens Turnstile inválidos -> 403.
4. Realizar cadastro com Turnstile válido, chegada de e-mail, confirmação, login, recuperação; testar mensagem e push entre dois navegadores, Android e iOS Home Screen. Os testes CI não enviam e-mail real.
5. Salvar ID do custom domain Cloudflare (para reverter), vínculo atual do Worker, última versão do Worker `main` e informações do deploy ativo do Render.

## Procedimento de virada (concluído; manter como referência técnica)

1. Atualizar Render `WEB_ORIGIN=https://uorqui.app` e `AUTH_BASE_URL=https://uorqui.app` **na mesma alteração**, mantendo `WEB_EXTRA_ORIGINS`. Esperar deploy `live` e health `ready`.
2. Reassociar o custom domain `uorqui.app` ao Worker `main` pelo painel Cloudflare (Workers & Pages → `main` → Settings → Domains & Routes → Add custom domain). Como já existe associação com `uorqui-chat`, usar **transferência de hostname** caso o painel a ofereça. Se não houver opção de transferência, **não excluir o domínio automaticamente**: revisar a intervenção e o plano de reversão antes de prosseguir. Não alterar R2/D1/bindings antigos nem migrar cookies.
3. Rodar o smoke `Production signup smoke test` com entrada `target=production` e verificar `/manifest.webmanifest`, `/sw.js`, login, registro, confirmação de e-mail, envio de DM, anexos, feed, comunidade e sala de voz.
4. Abrir o PWA já instalado pela origem `uorqui.app` no iOS e no Android. Validar troca de worker, ausência de tela preta, atualização do ícone (pode exigir reinstalação no iOS), login e consentimento de notificações. **Sessões e histórico do sistema antigo não serão reconhecidos pelo novo**.
5. Só após monitoramento e aceitação, considerar **redirecionar o endereço `uorqui-chat.uorqui1.workers.dev`** para `https://uorqui.app`. Isso é uma etapa posterior, no legado, não automática, e exige preservar endpoints de APIs/APK e avaliar clientes nativos antes de ativar um 301/308 global.

## Rollback de emergência (avaliar impacto antes de executar)

Se houver 5xx ou bloqueio de cadastro/login, diagnosticar primeiro o deploy atual de `main` e a API. **Reassociar o domínio ao Worker `uorqui-chat` faria visitantes acessarem o produto legado e interromperia acesso às contas novas**: só realizar essa reversão após decisão explícita e avaliação das sessões e dados criados desde a virada. Se necessário, corrigir `WEB_ORIGIN`/`AUTH_BASE_URL` em conjunto e testar `/health/ready` e o login. Não apagar bancos, buckets, contas ou sessões no rollback.

## Observações

- Em HTTPS, service workers e web push são vinculados à **origem**, não ao nome do aplicativo. Redirecionar outro hostname não transfere suas inscrições push.
- Não prometer atualização universal do ícone de um PWA já instalado, sobretudo no iPhone.
- Após a virada, `uorqui.app` será o novo sistema, porém o mensageiro empresarial anterior continuará existindo de forma separada até decisão específica.
