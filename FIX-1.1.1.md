# Uorqui 1.1.1 — correção do build Cloudflare

O build 1.1.0 falhava durante `bun install` porque o `package.json` fixava:

`@cloudflare/workers-types: ^4.20260819.0`

Essa versão não existe no npm.

A 1.1.1 remove essa dependência. O Worker do Uorqui continua em JavaScript e é
empacotado pelo Cloudflare Vite plugin/Wrangler, então ela não é necessária
para o deploy.

Também foi removido `tsconfig.worker.json`, que dependia desse pacote.

Scripts:
- `npm run build` -> `vite build`
- `npm run check` -> checa o TypeScript do frontend React
- `npm run typegen` -> `wrangler types`
- `npm run deploy` -> build + Wrangler

Não altere Secrets, Firebase, Firestore ou R2 por causa deste erro.
