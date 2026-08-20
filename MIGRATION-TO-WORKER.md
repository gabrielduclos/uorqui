# Uorqui 1.1.0 — React + TypeScript + Cloudflare Worker único

Esta versão migra o Uorqui de **Cloudflare Pages + Worker separado** para um único
**Cloudflare Worker com Static Assets**, mantendo o Worker existente `uorqui-api`
para preservar os Secrets e bindings já configurados.

## Nova arquitetura

- React + TypeScript + Vite: frontend
- Cloudflare Worker `uorqui-api`: frontend estático + `/api/*`
- Firebase Authentication: login/cadastro/senha
- Firestore: dados
- R2 `uorqui-media`: fotos e anexos
- Cron do mesmo Worker: rotinas agendadas

O navegador agora chama a API em `/api/...` na mesma origem.
O arquivo `public/api-config.js` deixa de existir e CORS deixa de fazer parte do
fluxo normal de produção.

## IMPORTANTE antes do commit

No seu repositório atual, **mantenha o seu `public/firebase-config.js` real**.
O patch desta migração NÃO inclui esse arquivo.

Apague estes arquivos antigos do Git:

- `public/app.js`
- `public/styles.css`
- `public/api-config.js`
- `public/_headers`
- `wrangler.api.jsonc`

Eles foram substituídos por React/Vite e `wrangler.jsonc`.

## Cloudflare Workers Builds

Use o Worker existente `uorqui-api`, que já possui:

- `FIREBASE_SERVICE_ACCOUNT_EMAIL`
- `FIREBASE_SERVICE_ACCOUNT_PRIVATE_KEY`
- binding R2 `MEDIA`

Configuração recomendada do Git:

- Root directory: `/`
- Build command: `npm run build`
- Deploy command: `npx wrangler deploy`

O `wrangler.jsonc` continua usando `name: "uorqui-api"` justamente para atualizar
o Worker existente em vez de criar outro.

## Teste antes de desligar o Pages

1. Faça o deploy do Worker com esta versão.
2. Abra `https://uorqui-api.uorqui1.workers.dev/`.
3. Confirme login, empresa, feed, comunidades, perfil, foto e senha.
4. Só depois aponte seu domínio principal para este Worker.
5. Quando estiver estável, o projeto Pages antigo pode ser removido.

## Domínio

Depois do teste, a ideia é servir tudo na mesma origem:

- `https://uorqui.com.br/` → React
- `https://uorqui.com.br/api/bootstrap` → Worker/API
- `https://uorqui.com.br/api/media/...` → Worker/R2

## Desenvolvimento local

```bash
npm install
npm run dev
```

O Cloudflare Vite plugin executa o frontend e o Worker no mesmo ambiente local.

## Segurança

Migrar para React não torna o JavaScript invisível. A segurança continua no
backend. O Worker valida token Firebase e autorização de empresa/comunidade antes
de Firestore/R2. O React evita montar HTML de conteúdo do usuário com
`dangerouslySetInnerHTML`; texto de posts e comentários é renderizado como texto.
