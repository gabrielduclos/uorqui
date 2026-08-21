# Uorqui 1.2.2

## Push

- Integração Web Push com Firebase Cloud Messaging.
- Registro de token por dispositivo em `pushSubscriptions`.
- Envio via FCM HTTP v1 pelo Cloudflare Worker.
- Service Worker exibe notificações em segundo plano.
- Clique no push abre a publicação correta.
- Token é sincronizado novamente quando o usuário já concedeu permissão.
- Ao sair da conta, o token do dispositivo é removido do backend.

## O que dispara push

- nova publicação para a empresa;
- nova publicação para uma comunidade da qual o usuário participa;
- comunicados;
- perguntas;
- enquetes;
- eventos;
- respostas;
- curtidas;
- confirmação de leitura pendente.

`Mundo` não envia push global porque ainda não existe um modelo explícito de
seguir/interesse para conteúdo público.

## Confirmação de leitura

- `Solicitar confirmação de leitura` agora aparece em qualquer post privado.
- Funciona em Empresa e Comunidade.
- Não funciona em Mundo.
- A pendência é criada para cada destinatário.
- A notificação fica persistente no sino.
- Abrir/clicar na notificação não a marca como lida.
- Somente `Confirmar leitura` dentro do post encerra a pendência.
- O PostCard mostra claramente se a leitura está pendente ou confirmada.
- Comunidades, busca, feed e permalink conseguem registrar a confirmação.
- Se um administrador remover o post, as pendências são encerradas.

## Notificações internas

- Novas publicações privadas agora também entram no sino.
- Respostas continuam notificando o autor e agora também disparam push.
- Curtidas agora criam notificação para o autor e disparam push.
- Push de resposta usa texto reduzido para não expor a conversa em tela bloqueada.

## Configuração necessária

Gerar a chave pública VAPID no Firebase Console e colocar em:

```text
public/push-config.js
```

Consulte `PUSH-FCM.md`.

## Cache

- Service Worker atualizado para `uorqui-react-v1.2.2`.

## Deploy

A versão altera Worker e frontend.

Não é necessário criar uma nova Service Account.
A integração reutiliza:

```text
FIREBASE_SERVICE_ACCOUNT_EMAIL
FIREBASE_SERVICE_ACCOUNT_PRIVATE_KEY
```

O build completo ainda deve ser validado no Cloudflare após o commit/push.
