# Uorqui 1.2.7

## Push

- O Uorqui passa a apresentar automaticamente a solicitação de ativação de push
  depois que o usuário entra e o aplicativo termina de carregar.
- A solicitação aparece somente quando a permissão do navegador ainda está em
  estado `default`.
- O botão `Ativar notificações` dispara a permissão nativa do navegador.
- Se o usuário escolher `Agora não`, o Uorqui espera 7 dias antes de oferecer
  novamente.
- Se a permissão já estiver concedida, o registro do dispositivo continua sendo
  sincronizado automaticamente.
- A tela de Notificações continua com o botão manual como fallback.

Observação: navegadores modernos exigem interação do usuário para abrir a
permissão nativa. Por isso o Uorqui abre automaticamente o diálogo próprio e o
clique em `Ativar notificações` abre o prompt nativo.

## Concluir publicação

- O botão para concluir/reabrir saiu do meio do conteúdo.
- Agora fica no rodapé do post, abaixo das fotos/anexos e ao lado das reações.
- O texto foi simplificado para `concluir` / `reabrir`.
- O selo visual passou de `Resolvido` para `Concluído`.
- O backend continua usando o mesmo estado `isResolved`, mantendo compatibilidade.

## Enquete

- Adicionada uma quebra visual simples entre o cabeçalho do post e o início da enquete.

## Cache

- Service Worker atualizado para `uorqui-react-v1.2.7`.

## Deploy

Esta versão altera apenas frontend/PWA.
Não exige novos Secrets, alterações em Firebase, Firestore, R2 ou Worker.
