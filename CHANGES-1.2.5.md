# Uorqui 1.2.5

## Correção do build Cloudflare

O build 1.2.4 falhou com:

```text
Could not resolve "./lib/pwa" from "src/App.tsx"
```

O `App.tsx` já utilizava o helper de instalação PWA, porém `src/lib/pwa.ts`
não estava presente no repositório usado pelo Cloudflare.

A 1.2.5 corrige isso com um patch cumulativo que inclui os arquivos de PWA
necessários, não apenas os arquivos alterados na 1.2.4.

## Importante

Use este patch mesmo se a 1.2.3 não tiver sido aplicada anteriormente.
Ele inclui:

- `src/lib/pwa.ts`;
- `src/App.tsx`;
- `src/styles.css`;
- `index.html`;
- `public/manifest.webmanifest`;
- `public/sw.js`;
- os arquivos atuais da confirmação de leitura exclusiva para Comunicados;
- Worker atual.

Nenhuma mudança de Firebase, Firestore, R2 ou Secrets é necessária para esta correção.
