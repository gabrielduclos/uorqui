# Mensageiro 1:1 — Uorqui

## Primeira versão conectada

O mensageiro individual usa autenticação Better Auth, PostgreSQL no Neon e as tabelas `direct_conversations` e `direct_messages`. O frontend React substitui os contatos fictícios por conversas verdadeiras entre exatamente duas pessoas.

### Funcionalidades
- Busca usuários públicos por nome ou @usuário e inicia conversa pelo botão **Conversar** do perfil público.
- Uma conversa única por par de usuários, independentemente de quem inicia.
- Envia texto até 4.000 caracteres e guarda histórico persistente (últimas 100 mensagens na primeira versão).
- ID único criado no cliente impede duplicação no reenvio.
- O horário original aparece junto ao texto de cada mensagem. Os estados **Enviando, Enviada, Recebida e Lida** aparecem **ao final de cada bloco consecutivo de mensagens enviadas**, como um aviso neutro de sistema centralizado com a **hora da atualização**. O status do bloco representa a menor confirmação alcançada entre suas mensagens não excluídas (não informa Lida antes de todas serem lidas). O estado Recebida depende da confirmação de entrega no cliente, separada da leitura. Contadores não lidos atualizados.
- Atualização instantânea via **SSE e PostgreSQL LISTEN/NOTIFY**, com polling de segurança quando necessário. Ainda não há push com o aplicativo fechado nem presença online.
- Interface mobile-first preservando header fixo e teclado; campo de digitação com contraste em Light/Dark e sem indicador “Ao vivo”.
- Balão otimista e spinner no envio, sem bloquear o compositor; reenvio após falhas usa o mesmo `clientId`.
- Editar texto próprio, excluir para ambos com tombstone, encaminhar mensagens entre conversas existentes e reagir a mensagens recebidas com atualização SSE. Reações são otimistas e revertidas em caso de erro.\n- **Responder** vincula a nova mensagem ao ID da mensagem original, mostrando sua prévia clicável no balão sem duplicar o texto no corpo. Toque na prévia para rolar até a mensagem original, inclusive carregando uma janela mais antiga do histórico, com destaque temporário. As prévias de origens excluídas não revelam o texto apagado.\n- Com a **lista de conversas aberta, visível e em foco**, as mensagens recebidas são marcadas como **Recebidas**, mesmo sem entrar na conversa; **Lida** exige conversa aberta, visível e em foco.

### API
- `GET /api/v1/dm/people?q=`: busca autenticada, apenas perfis públicos.
- `GET /api/v1/dm/conversations`: lista somente as conversas do usuário autenticado.
- `POST /api/v1/dm/conversations`: inicia/abre conversa por `handle`.
- `GET /api/v1/dm/conversations/:id/messages`: últimas 100 mensagens, após verificar participante.
- `POST /api/v1/dm/conversations/:id/messages`: texto + `clientId` para deduplicação; `replyToId` opcional validado na mesma conversa.
- `POST /api/v1/dm/conversations/:id/read`: confirma leitura das mensagens recebidas.
- `POST /api/v1/dm/conversations/:id/received`: confirma entrega sem marcar como lida.
- `PATCH /api/v1/dm/conversations/:id/messages/:messageId`: editar texto próprio.
- `DELETE /api/v1/dm/conversations/:id/messages/:messageId`: excluir para todos (sem apagar posição histórica).
- `PUT/DELETE /api/v1/dm/conversations/:id/messages/:messageId/reaction`: adicionar, trocar ou remover reação às mensagens recebidas.
- `POST /api/v1/dm/conversations/:id/messages/:messageId/forward`: encaminhar a uma conversa existente do usuário.



### Sincronização em tempo real (SSE)

- A API oferece `GET /api/v1/dm/events` com SSE e a sessão Better Auth existente, sem tokens no URL.
- O navegador mantém uma conexão enquanto a aba está visível, com reconexão automática. Notificações `message`, `read`, `received`, `update` e `conversation` provocam a atualização imediata do histórico e da lista de conversas.
- Um listener PostgreSQL `LISTEN uorqui_dm_events` por processo recebe `NOTIFY` enviado pelas rotas Fastify. Uma ligação direta ao Neon é necessária para `LISTEN`; definir `DATABASE_DIRECT_URL` quando a URL principal usar PgBouncer.
- O SSE transmite apenas o tipo de mudança e o ID da conversa. O texto continua acessível apenas pelas rotas autenticadas, com checagem de participação.
- Heartbeat a cada 15 segundos, desconexão e nova validação de sessão a cada 5 minutos. A conexão é fechada com a aba oculta.
- O cliente conserva polling de segurança a cada 25 a 30 segundos enquanto conectado e retorna a 3/4 segundos se o stream falhar. Não há suporte a notificações push com aplicativo fechado.


### Contrato da interface real (não regredir)

O componente `LiveDirectChat` usa o mesmo UI Kit de tema claro/escuro e idiomas PT/EN que o restante do Uorqui. Os componentes `DemoChatBubble` e `DemoMessageComposer` ainda guardam exemplos de funcionalidades não migradas e **não** devem ser confundidos com o backend real.

- A lista e a busca **nunca** marcam mensagens como lidas. Nem a chegada de um evento SSE ou uma consulta de histórico constitui confirmação de leitura.
- Uma confirmação de leitura só ocorre com conversa aberta, painel realmente visível, aba e janela em foco, histórico renderizado e visualização no final da conversa. O botão Voltar fecha a seleção da conversa.
- Abrir uma conversa rola até a mensagem mais recente; rolar para cima mantém a posição. Novas mensagens recebidas enquanto o usuário lê o histórico mostram uma seta para baixo e um contador, sem deslocar a tela.
- Mensagens de outras conversas podem mostrar um aviso flutuante com prévia; abri-lo exige ação explícita do usuário e dispensá-lo não altera o estado de leitura.
- Header da conversa fixo, campo de mensagem contrastante e com borda visível, menu de ações do balão contido no viewport com blur, avatares com cache, filtros Todas/Não lidas e placeholders de carregamento.
- A ação **Responder** cria uma referência relacional persistente à mensagem original. Mensagens antigas com citação textual continuam renderizadas por compatibilidade. Edição, exclusão, encaminhamento e reações são persistidas; anexos e áudios aguardam API real. Não exibir opções falsas como se já funcionassem.

### Segurança
Todas as rotas exigem sessão, e cada acesso a um ID de conversa confirma participação. Escritas validam o cabeçalho Origin. Não há suporte a grupos no mensageiro individual. Perfis privados ficam ocultos na busca, mas as conversas já existentes continuam disponíveis para seus participantes.

### Banco
A migração `0003_live_direct_messages` acrescenta `client_id` (UUID único) e `read_at` no histórico. A `0004_dm_actions` acrescenta `delivered_at`, `edited_at`, `deleted_at`, `forwarded_from_id` e `direct_message_reactions`. A `0005_dm_replies` acrescenta `reply_to_id` (FK opcional para a mensagem original). **Migrar o banco antes de implantar a API**, senão consultas podem falhar. Nenhum arquivo binário é armazenado no Neon.

### Próximas etapas
Paginação do histórico, anexos privados no R2, push, controle antispam e moderação.

### Cancelamento, eventos de reação e navegação

- `DELETE /api/v1/dm/conversations/:id/messages/:messageId` cancela uma mensagem própria **não lida**: remoção definitiva, sem ocupar espaço no chat. Caso `read_at` esteja preenchido, retorna `409` e não altera a mensagem.
- `GET /api/v1/dm/conversations/:id/messages?around=<uuid>` retorna um trecho autorizado do histórico em torno de uma mensagem original, para rolagem/destaque ao tocar na resposta.
- Reações permanecem como marcadores na mensagem original e **não viram balões no histórico**. Reações recebidas aparecem na **prévia da lista de conversas**, com emoji, horário e trecho da mensagem reagida; contam como **não lidas** na conversa e no ícone global até a confirmação real de leitura.
- O ícone Conversas exibe o total de mensagens não lidas em toda a conta, por SSE/polling, em mobile e desktop.
- Identidade visual: balões de mensagens com cantos retos.

### Notificações persistentes de reação

- A migração `0006_dm_reaction_notifications` acrescenta `updated_at` e `read_at` às reações. Reações anteriores são inicialmente marcadas como lidas para evitar alertas retroativos.
- `PUT /api/v1/dm/conversations/:id/messages/:messageId/reaction` cria/atualiza o emoji e zera `read_at`, gerando evento SSE. `DELETE .../reaction` remove o marcador e a notificação pendente.
- `GET /api/v1/dm/conversations` retorna `previewKind`, `previewReactionEmoji`, `previewReactionBody`, `previewReactionAt`, `unreadMessageCount`, `unreadReactionCount` e `unreadCount` total. Somente reações enviadas por outra pessoa a mensagens próprias geram notificações para o destinatário.
- `POST /api/v1/dm/conversations/:id/read` reconhece em uma única chamada as mensagens e reações pendentes **somente com conversa aberta/visível**, nunca ao apenas olhar a lista.
