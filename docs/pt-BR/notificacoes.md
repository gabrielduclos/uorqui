# Notificações no Uorqui

O aplicativo oferece uma central de atividades autenticada, com badge de não lidas e ações para marcar uma ou todas como lidas.

Os eventos registrados são: curtidas e comentários em publicações, novos seguidores, solicitações de amizade e solicitações aceitas. Eventos originados pelo próprio usuário não geram notificação. Uma nova curtida ou novo seguidor repetido não duplica a mesma atividade. Contas bloqueadas não recebem nem exibem atividades relacionadas entre si.

Ao tocar em um evento de publicação, abre-se o post no feed. Os demais eventos levam ao perfil do autor. O histórico e o estado de leitura ficam no PostgreSQL, e a interface é atualizada por eventos autenticados e uma consulta periódica como contingência.

## Push

O Web Push usa as mesmas chaves VAPID, inscrições por conta e service worker já utilizados nas mensagens. Somente inscrições com permissão concedida podem receber avisos. No iOS, é necessário instalar o PWA na tela inicial e conceder permissão. O push é uma entrega de melhor esforço; a atividade permanece na central se o push falhar.

A migração `0027_activity_notifications.sql` deve ser aplicada ao banco correto antes de disponibilizar a funcionalidade em produção. Não há envio de e-mail ou de conteúdo privado de posts no payload de push.

## Ajustes individuais de push

A central de notificações possui um botão **Ajustes** no canto superior direito, que abre outra tela com retorno à central. O sino do header e o pedido de permissão na lista de notificações foram removidos.

A tela permite ativar/desativar individualmente sete categorias: mensagens privadas, mensagens de comunidades, curtidas, comentários, pedidos de amizade, amizades aceitas e novos seguidores. Também oferece **Ativar todas** e **Desativar todas**, além de um controle separado para conceder ou revogar push no dispositivo.

As escolhas são persistidas por conta na tabela `notification_preferences`, aplicadas **no servidor** antes de qualquer envio push (inclusive mensagens privadas e de comunidades) e não ocultam atividades da central. Cada categoria começa ativada. A migração `0028_notification_preferences.sql` deve ser aplicada ao banco de produção somente após aprovação explícita.
