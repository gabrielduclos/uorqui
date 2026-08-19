# Uorqui 1.0.0 — Pages + Worker API

Esta é a primeira versão real do **Uorqui**, agora separada em duas camadas Cloudflare:

- **Cloudflare Pages** — frontend/PWA.
- **Cloudflare Worker** — API, autorização, Firestore, R2 e Cron.

O projeto Firebase permanece `uorqui-ba281` e é usado para **Authentication + Firestore**.

## Arquitetura

```text
Navegador
  │
  ├── Cloudflare Pages
  │      └── HTML / CSS / JS / PWA
  │
  ├── Firebase Authentication
  │      └── login / cadastro / ID Token
  │
  └── https://api.seu-dominio/api/*
         └── Cloudflare Worker
                ├── valida Firebase ID Token
                ├── regras de empresa/comunidade
                ├── Firestore REST API
                ├── R2 privado
                └── Cron Trigger
```

O navegador **não acessa o Firestore diretamente**. O Worker continua sendo a fronteira de autorização.

## O que já está implementado

- conta pessoal independente da empresa;
- cadastro/login por Firebase Auth;
- criação de empresa;
- convite de colaboradores;
- convite de comunidades pela Central de Notificações;
- comunidades `Geral` e `Comunicados` automáticas;
- feed privado por empresa/comunidade;
- publicação para **Empresa / Comunidade / Mundo**;
- perguntas, respostas e solução aceita;
- comunicados com confirmação de leitura;
- curtidas, busca e notificações;
- anexos privados em Cloudflare R2;
- Cron a cada 6 horas para convites;
- PWA básica.

## 1. Firebase Web App

No Firebase `uorqui-ba281`, ative **Email/Password** e registre um Web App. Copie a configuração pública para:

```text
public/firebase-config.js
```

Exemplo:

```js
window.UORQUI_FIREBASE_CONFIG = {
  apiKey: "...",
  authDomain: "uorqui-ba281.firebaseapp.com",
  projectId: "uorqui-ba281",
  appId: "..."
};
```

## 2. Firestore

Crie o banco Firestore e publique `firestore.rules`. As regras bloqueiam acesso direto pelo cliente porque a API do Worker é quem faz autorização.

```bash
firebase deploy --only firestore
```

## 3. Cloudflare R2

Crie o bucket privado:

```bash
npx wrangler r2 bucket create uorqui-media
```

O binding `MEDIA` já está em `wrangler.api.jsonc`.

## 4. Service Account no Worker

Use `client_email` e `private_key` da Service Account somente como secrets do Worker:

```bash
npx wrangler secret put FIREBASE_SERVICE_ACCOUNT_EMAIL --config wrangler.api.jsonc
npx wrangler secret put FIREBASE_SERVICE_ACCOUNT_PRIVATE_KEY --config wrangler.api.jsonc
```

Nunca coloque Service Account em `public/`, Git ou Firebase config do navegador.

## 5. Desenvolvimento local

Instale dependências:

```bash
npm install
```

Terminal 1 — API:

```bash
npm run dev:api
```

Terminal 2 — Pages:

```bash
npm run dev:pages
```

O arquivo `public/api-config.js` já usa `http://127.0.0.1:8787/api` quando o frontend está em localhost. O Pages local fica em `http://127.0.0.1:8788`.

## 6. Primeiro deploy do Worker

```bash
npm run deploy:api
```

O Wrangler retornará uma URL parecida com:

```text
https://uorqui-api.<sua-conta>.workers.dev
```

Depois edite:

```text
public/api-config.js
```

e informe:

```js
window.UORQUI_API_BASE = 'https://uorqui-api.<sua-conta>.workers.dev/api';
```

Quando tiver domínio próprio, prefira:

```text
https://api.uorqui.com.br/api
```

## 7. Configurar CORS e links de convite

Em `wrangler.api.jsonc`, ajuste:

```json
"APP_ORIGIN": "https://uorqui.pages.dev",
"ALLOWED_ORIGINS": "https://uorqui.pages.dev,http://127.0.0.1:8788,http://localhost:8788"
```

`APP_ORIGIN` é usado para gerar o link de convite. `ALLOWED_ORIGINS` define quais frontends podem chamar a API.

Quando ligar domínio próprio, por exemplo:

```text
https://uorqui.com.br
```

substitua `APP_ORIGIN` e adicione o domínio a `ALLOWED_ORIGINS`.

## 8. Deploy do Pages

Escolha **uma estratégia para o projeto Pages antes de começar**. A Cloudflare informa que um projeto criado como Direct Upload não pode depois ser convertido para Git integration; nesse caso seria necessário criar outro projeto Pages.

### Opção A — Git integration (recomendada para o Uorqui)

Conecte o repositório no painel do Pages:

- Framework preset: **None**
- Build command: deixe vazio
- Build output directory: `public`
- Root directory: `/`

Assim cada push pode gerar deploy/preview automaticamente.

### Opção B — Direct Upload com Wrangler

Se preferir publicar manualmente pelo computador:

```bash
npm run deploy:pages
```

O script publica a pasta `public/` no projeto Pages `uorqui`.

O arquivo `public/_redirects` já garante fallback de SPA para `index.html`.

## 9. Firebase Authorized Domains

Em Firebase Authentication > Settings > Authorized domains, adicione:

- o domínio `*.pages.dev` real do projeto, quando necessário;
- `uorqui.com.br` quando existir;
- qualquer domínio final usado pelo frontend.

A API (`api.uorqui.com.br`) não precisa ser domínio autorizado do Firebase Auth, pois o login acontece no frontend Pages.

## Convites

Agora o link de convite sempre aponta para o **Pages**, não para o Worker. Isso é controlado por `APP_ORIGIN`.

Se configurar Resend:

```bash
npx wrangler secret put RESEND_API_KEY --config wrangler.api.jsonc
npx wrangler secret put INVITE_FROM_EMAIL --config wrangler.api.jsonc
```

o Worker envia o convite por e-mail. Sem esses secrets, a administração continua exibindo o link para copiar.

## Estrutura

```text
uorqui-real-v1.0.0-pages/
├── public/                  # Cloudflare Pages
│   ├── index.html
│   ├── app.js
│   ├── styles.css
│   ├── firebase-config.js
│   ├── api-config.js
│   ├── _redirects
│   ├── _headers
│   ├── manifest.webmanifest
│   ├── sw.js
│   └── assets/
├── worker/
│   └── index.js            # Cloudflare Worker API
├── wrangler.api.jsonc
├── firestore.rules
├── firebase.json
├── package.json
└── ARCHITECTURE.md
```

## Segurança da separação Pages/API

- o Pages contém somente código público do cliente;
- Service Account fica apenas em Worker Secrets;
- R2 continua privado;
- API exige Firebase ID Token;
- Worker aplica CORS somente para origens configuradas;
- links de convite apontam para o frontend Pages;
- mídia é entregue pela API após verificação de permissão.
