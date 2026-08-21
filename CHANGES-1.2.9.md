# Uorqui 1.2.9

## Concluir assunto

- “Marcar como concluído” fica sempre como a primeira ação à esquerda.
- Continua na mesma linha das curtidas, respostas e compartilhamento.
- Quando concluído, o botão muda para “Reabrir assunto”.

## Lembrete após 5 dias

- Posts e perguntas com pelo menos uma resposta entram no acompanhamento.
- Se ficarem 5 dias sem novas respostas e ainda não estiverem concluídos, o autor recebe uma notificação.
- O lembrete orienta a marcar como concluído ou continuar o assunto.
- O aviso é enviado pela central de notificações e por push quando o dispositivo estiver cadastrado.
- Cada ciclo de respostas gera no máximo um lembrete; uma nova resposta reinicia a contagem de 5 dias.
- Ao abrir o lembrete, a publicação já abre com as respostas visíveis.

## Desempenho

- A publicação desaparece imediatamente da interface após a confirmação de exclusão.
- A API responde depois de remover ou substituir o post, sem aguardar a limpeza de comentários, reações, votos, confirmações, notificações e mídias.
- A limpeza relacionada ocorre em segundo plano.
- A consulta da publicação e das respostas agora ocorre em paralelo.
- O carregamento das respostas começa no toque, foco ou aproximação do ponteiro e reutiliza a mesma requisição.

## Cache

- Service Worker atualizado para `uorqui-react-v1.2.9`.
