# Uorqui 1.2.6

## Correção cumulativa do build

O build 1.2.5 avançou além do problema de `./lib/pwa`, mas parou em:

```text
Could not resolve "./lib/push" from "src/App.tsx"
```

A causa foi a mesma: o patch anterior não carregava todos os módulos novos
que o `App.tsx` já importava.

A 1.2.6 transforma o patch em um patch cumulativo de frontend:

- inclui **todo o diretório `src/` atual**;
- inclui `src/lib/push.ts`;
- inclui `src/lib/pwa.ts`;
- inclui `src/lib/firebase.ts`;
- inclui `src/lib/api.ts`;
- inclui todos os componentes usados pelo App;
- inclui o Worker atual;
- inclui manifest e Service Worker;
- preserva a regra de confirmação de leitura somente para Comunicados.

## Verificação

Foi feita uma varredura de todos os imports relativos dos arquivos `.ts/.tsx`
e nenhum import local ficou sem arquivo correspondente no pacote.

## push-config.js

O arquivo `public/push-config.js` não é sobrescrito pelo patch para evitar apagar
uma chave VAPID que já tenha sido configurada. Se ele ainda não existir no seu
repositório, copie-o do pacote completo e configure a chave pública VAPID.

## Cloudflare

O aviso abaixo não é o motivo da falha:

```text
<script src="/push-config.js"> ... can't be bundled without type="module"
```

A falha real era o módulo `./lib/push` ausente.

Nenhum novo Secret é necessário para esta correção.
