# Uorqui 1.1.0

Aplicação full-stack em **React + TypeScript + Vite + Cloudflare Workers Static Assets**.

Leia primeiro: `MIGRATION-TO-WORKER.md`.

## Comandos

```bash
npm install
npm run dev
npm run build
npm run deploy
```

## Estrutura

```text
src/                 React + TypeScript
worker/index.js      API + Firebase/Firestore/R2 + Cron
public/              Logos, manifest, Firebase Web config
wrangler.jsonc       Worker + Static Assets + R2 + Cron
vite.config.ts       Cloudflare Vite plugin
```

O frontend usa `/api/*` na mesma origem do Worker.
