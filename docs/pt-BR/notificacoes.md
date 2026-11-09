# Notificações no Uorqui

O aplicativo oferece uma central de atividades autenticada, com badge de não lidas e ações para marcar uma ou todas como lidas.

Os eventos registrados são: curtidas e comentários em publicações, novos seguidores, solicitações de amizade e solicitações aceitas. Eventos originados pelo próprio usuário não geram notificação. Uma nova curtida ou novo seguidor repetido não duplica a mesma atividade. Contas bloqueadas não recebem nem exibem atividades relacionadas entre si.

Ao tocar em um evento de publicação, abre-se o post no feed. Os demais eventos levam ao perfil do autor. O histórico e o estado de leitura ficam no PostgreSQL, e a interface é atualizada por eventos autenticados e uma consulta periódica como contingência.

## Oferta de notificações no desktop

Nos navegadores desktop (janela de pelo menos 768 px, exceto iOS), a oferta diária **Ativar notificações** só aparece enquanto a permissão do navegador estiver em `default` (ainda não decidida) e houver suporte a push. Se a permissão já estiver **concedida**, nenhuma nova oferta de autorização aparece, mesmo quando a inscrição do service worker está ausente ou há falha na sincronização. Neste caso, o usuário pode usar **Notificações → Ajustes → Permissão neste dispositivo** para reconectar. O banner opcional de instalação do PWA é independente e não se sobrepõe ao pedido de permissão.

A oferta de permissão é limitada a **uma vez por dia por conta e navegador** quando a autorização ainda estiver pendente. A janela de permissão do sistema só abre após clicar em **Ativar notificações**. Se o navegador já negou a permissão, não há nova oferta automática: o caminho para liberá-la ou reconectar manualmente permanece em Ajustes.

Em mobile, a regra anterior permanece: no iPhone/iPad é necessário instalar o PWA para receber push. Em todos os dispositivos, há um controle manual em **Notificações → Ajustes → Permissão neste dispositivo**.

## Abas da central de notificações (`0.1.0-beta.5`)

A central reúne as abas **Todas**, **Mensagens**, **Menções**, **E-mail**, **Convites** e **Contatos**. No desktop e no mobile, as abas têm rolagem horizontal, foco acessível e navegação por setas, Home e End.

- **Todas** reúne as categorias e preserva os avisos persistentes de solicitações.
- **Mensagens** lista conversas privadas e canais com não lidas e abre a conversa/canal; a leitura é feita no respectivo módulo.
- **Menções** reúne `@usuário` gravados no banco mesmo sem push. O servidor verifica participação, acesso de canal, senha, bloqueios e banimentos antes de expor cada aviso. Não são criados eventos retroativos de mensagens antigas.
- **E-mail** mostra novos e-mails após o monitoramento inicial, com remetente, assunto e link para o leitor. O total de e-mails não lidos também abre a caixa de entrada, mesmo quando não houver aviso recente.
- **Convites** une convites pendentes e pedidos de entrada em comunidade/reunião; **Contatos** reúne solicitações e confirmações de amizade.
- Atividades e avisos persistentes podem ser dispensados; em **Todas**, a ação de leitura afeta atividades, menções e alertas de e-mail, **não** marca todas as mensagens e os e-mails reais como lidos.

A migração aditiva `0042_notification_inbox_events.sql` deve ser aplicada antes do deploy da API/Worker. Eventos são exclusivos de cada destinatário e apagam em cascata se o usuário, a conta de e-mail ou a mensagem/canal forem excluídos. O histórico na central independe da permissão de push.

## Push

O Web Push usa as mesmas chaves VAPID, inscrições por conta e service worker já utilizados nas mensagens. Somente inscrições com permissão concedida podem receber avisos. No iOS, é necessário instalar o PWA na tela inicial e conceder permissão. O push é uma entrega de melhor esforço; a atividade permanece na central se o push falhar.

A migração `0027_activity_notifications.sql` deve ser aplicada ao banco correto antes de disponibilizar a funcionalidade em produção. Não há envio de e-mail ou de conteúdo privado de posts no payload de push.

## Ajustes individuais de push

A central de notificações possui um botão **Ajustes** no canto superior direito, que abre outra tela com retorno à central. O sino do header e o pedido de permissão na lista de notificações foram removidos.

A tela permite ativar/desativar individualmente sete categorias: mensagens privadas, mensagens de comunidades, curtidas, comentários, pedidos de amizade, amizades aceitas e novos seguidores. Também oferece **Ativar todas** e **Desativar todas**, além de um controle separado para conceder ou revogar push no dispositivo.

As escolhas são persistidas por conta na tabela `notification_preferences`, aplicadas **no servidor** antes de qualquer envio push (inclusive mensagens privadas e de comunidades) e não ocultam atividades da central. Cada categoria começa ativada. A migração `0028_notification_preferences.sql` deve ser aplicada ao banco de produção somente após aprovação explícita.

## Ícone das notificações no Android

O ícone colorido do PWA permanece como `icon-192.png` no conteúdo da notificação. Para o pequeno símbolo da **barra de status do Android**, o service worker utiliza `notification-badge.png`: PNG de 72 × 72 px, branco com transparência, com o monograma U em um balão de conversa. A fonte vetorial é `notification-badge.svg`. Não usar o logotipo colorido como `badge`, pois o Android reduz esse recurso a uma silhueta monocromática.

Após a publicação, reabra o PWA para atualizar o service worker e receba um novo push em um aparelho Android para conferir o resultado. A aparência final depende da versão do Android e do navegador.

## Notificações de e-mail

O push de e-mails usa o mesmo service worker e inscrições VAPID. Gmail e IMAP são monitorados pelo backend, e contas Outlook conectadas anteriormente continuam elegíveis. A categoria **Novos e-mails** é controlada por `notification_preferences.email_message`, criada na migração `0037_mail_push.sql`. O usuário recebe remetente/assunto, sem corpo de mensagem; ao tocar, abre a mensagem na caixa conectada. O primeiro ciclo não notifica mensagens antigas; a API não promete entrega imediata quando a hospedagem estiver suspensa.

## Abertura de notificações e avisos dentro do app

Ao tocar um push do sistema, o service worker navega a janela do PWA para o link persistente da conversa, canal, e-mail ou atividade; isso corrige eventos de abertura perdidos ao retomar o iOS. Links de comunidade usam os identificadores reais de comunidade/canal, sem ingressar automaticamente em salas de voz; um convite abre a central de notificações. Uma atividade abre o pedido ou perfil vinculado assim que os dados autenticados chegam.

Com o app **visível**, novas mensagens privadas (SSE), canais com mensagens novas, convites e atividades geram um aviso interno clicável somente quando o módulo correspondente não está ativo. Push recebido com o PWA visível é encaminhado ao aviso interno, evitando dois alertas simultâneos; em segundo plano, mantém o aviso do sistema. Os avisos são temporários, dispensáveis e limitados a três na tela, sem alterar os contadores de não lidos.

## Retirada de notificações já lidas

Após confirmar a leitura no servidor, o PWA pede ao service worker para fechar o push correspondente no **dispositivo atual**, sem excluir o histórico: conversa privada, canal da comunidade, e-mail e atividade. **Marcar todas como lidas** fecha os pushes de atividade; mover um e-mail para Spam/Lixeira também retira seu push. A central e os avisos internos respeitam o mesmo estado. Atualizações de não lidos das mensagens e comunidades reconciliam pushes antigos depois de leituras em outras sessões. O navegador/sistema operacional controla a central de notificações e pode limitar a retirada em alguns aparelhos; não é possível fechar remotamente notificações exibidas em outro dispositivo.

## Contador de não lidos no ícone do PWA

O ícone do aplicativo instalado mostra o total de itens não lidos: **mensagens diretas**, mensagens dos **canais**, **convites de comunidade**, notificações de **atividade** e **e-mails de todas as contas conectadas**. O contador é recalculado a partir dos hooks de não lidos na interface e por consultas autenticadas no **service worker ao receber push**, mesmo quando a janela está fechada. Ao chegar a zero, o badge é removido; sair da conta também o limpa. Não existem ícones diferentes por módulo nem dados de mensagens armazenados no cache público do service worker.

O badge numérico usa a Badging API nativa do sistema. No **iPhone/iPad é necessário instalar o PWA na Tela de Início e permitir notificações**; o usuário ainda pode ocultar badges nos ajustes do sistema. Em navegadores sem Badging API, o app mantém os indicadores internos e as notificações normalmente, mas não consegue desenhar um número nativo sobre o ícone. Atualizações em segundo plano são de melhor esforço e o total é reconciliado ao abrir o app.
