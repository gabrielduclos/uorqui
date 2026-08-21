# Uorqui Push — Firebase Cloud Messaging (v1.2.2)

## O que esta versão ativa

O Uorqui passa a usar Firebase Cloud Messaging (FCM) para Web Push.

Disparam push:

- nova publicação para a empresa;
- nova publicação em comunidade da qual o usuário participa;
- comunicado;
- pergunta;
- enquete;
- evento;
- resposta à publicação do usuário;
- curtida na publicação do usuário;
- publicação com confirmação de leitura pendente.

`Mundo` não dispara push em massa. Hoje não existe um modelo de seguir/interesse
individual para publicações públicas; enviar para todos criaria spam.

## 1. Gerar a chave VAPID pública

No Firebase Console:

1. Abra o projeto `uorqui-ba281`.
2. Configurações do projeto.
3. Cloud Messaging.
4. Configuração da Web.
5. Certificados de push da Web.
6. Gere um par de chaves.
7. Copie a chave pública.

O FCM exige uma chave VAPID para registrar navegadores Web Push.

## 2. Colocar a chave no Uorqui

Edite:

```text
public/push-config.js
```

Troque:

```js
window.UORQUI_PUSH_CONFIG = {
  vapidKey: "COLE_AQUI_A_CHAVE_PUBLICA_VAPID"
};
```

pela chave pública gerada no Firebase.

Essa chave é pública. Não é Secret do Worker.

## 3. Firebase Web App

O Uorqui já usa `public/firebase-config.js`.

A versão 1.2.2 tenta derivar `messagingSenderId` automaticamente do `appId`
quando ele não estiver explícito no objeto de configuração.

Não coloque a Service Account no frontend.

## 4. Worker / FCM HTTP v1

O Worker usa os Secrets Firebase que o projeto já utiliza:

```text
FIREBASE_SERVICE_ACCOUNT_EMAIL
FIREBASE_SERVICE_ACCOUNT_PRIVATE_KEY
```

O token OAuth do Worker agora solicita os escopos do Firestore e do Firebase
Cloud Messaging.

Se o envio retornar 403:

- confirme que a Firebase Cloud Messaging API está ativada no projeto;
- confirme que a Service Account utilizada pelo Worker possui permissão para
  enviar mensagens pelo FCM HTTP v1.

## 5. Como o usuário ativa

No Uorqui:

```text
Notificações → Ativar push
```

O navegador exibirá a permissão nativa.

Depois da autorização, o token FCM do dispositivo é enviado ao Worker e salvo
na coleção:

```text
pushSubscriptions
```

Ao sair da conta, o Uorqui remove o registro desse dispositivo antes de encerrar
a sessão, reduzindo o risco de notificações de uma conta aparecerem para outra
pessoa no mesmo navegador.

## 6. HTTPS

Web Push exige contexto seguro. Em produção o Uorqui já roda via HTTPS no
Cloudflare Worker.

## 7. iPhone / iPad

O suporte depende das regras do navegador/PWA da Apple. Quando o navegador exigir,
adicione o Uorqui à Tela de Início e conceda a permissão de notificações pelo app
instalado.

## 8. Confirmação de leitura

A opção `Solicitar confirmação de leitura` agora pode ser usada em qualquer
publicação privada:

- Empresa;
- Comunidade.

Não é permitida em `Mundo`.

Quando ativada:

1. cada destinatário recebe uma notificação;
2. a notificação fica `persistent: true`;
3. clicar no sino não elimina a pendência;
4. a pendência só muda para `confirmed` quando o usuário toca em
   `Confirmar leitura` dentro da publicação;
5. o contador do sino só diminui depois da confirmação.

Se a publicação for removida por um administrador, a pendência é encerrada para
não deixar uma notificação impossível de resolver.

## 9. Privacidade do push

Para reduzir exposição em tela bloqueada:

- novas publicações usam texto genérico;
- curtidas usam texto genérico;
- respostas em push não exibem o conteúdo integral do comentário.

O conteúdo completo continua dentro do Uorqui, protegido pela autenticação e
pelas permissões da empresa/comunidade.

## 10. Teste recomendado

Use duas contas em navegadores/dispositivos diferentes:

1. Ative push na conta B.
2. Na conta A, publique na empresa.
3. Confirme o push na conta B.
4. Responda pela conta B.
5. Confirme o push de resposta na conta A.
6. Curta a postagem pela conta B.
7. Confirme o push de curtida na conta A.
8. Crie uma publicação com confirmação de leitura.
9. Abra a notificação na conta B sem confirmar.
10. Verifique que ela continua no sino.
11. Confirme a leitura dentro da publicação.
12. Verifique que a pendência desapareceu.
