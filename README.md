# Uorqui 1.2.4

Aplicação full-stack em **React + TypeScript + Vite + Cloudflare Workers Static Assets**.

## O que existe nesta versão

- empresas e comunidades privadas;
- níveis Proprietário / Administrador / Usuário;
- posts, perguntas, comunicados, enquetes e eventos;
- comentários inline, curtidas, solução aceita e status Resolvido;
- compartilhamento por permalink com autorização no backend;
- fotos e arquivos privados no R2;
- busca e notificações;
- plano Free por empresa: até 5 membros e 2 comunidades;
- Premium por empresa com checkout Asaas (Pix + cartão);
- eventos com Google Agenda e arquivo `.ics`;
- Superadmin com métricas globais e concessão manual de Premium.

## Comandos

```bash
npm install
npm run dev
npm run build
npm run check
npm run deploy
```

## Estrutura

```text
src/                 React + TypeScript
worker/index.js      API + Firebase/Firestore/R2 + Billing + Cron
public/              Logos, PWA, manifest, Firebase Web config
wrangler.jsonc       Worker + Static Assets + R2 + Cron
vite.config.ts       Cloudflare Vite plugin
BILLING-ASAAS.md     Configuração Pix/cartão do Premium
SUPERADMIN.md         Configuração e regras do acesso Superadmin
```

O frontend usa `/api/*` na mesma origem do Worker.

**Importante:** preserve `public/firebase-config.js` e nunca coloque secrets do Firebase/Asaas no frontend.


## Push

A versão 1.2.2 adiciona Web Push via Firebase Cloud Messaging, notificações para
novas publicações relevantes, respostas e curtidas, além de confirmação de
leitura persistente no sino.

Veja:

```text
PUSH-FCM.md
```


## Instalar como app

A versão 1.2.3 adiciona convite de instalação PWA e uma opção permanente no Perfil.

Veja:

```text
PWA-INSTALL.md
```
