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

- A lista e a busca **nunca** marcam mensagens como **Lidas**. Uma mensagem que entrou no **badge global de não lidas** já foi recebida pelo cliente conectado, portanto o hook da navegação confirma **Recebida** via `/received`, mesmo fora da área de conversas. Isso **não** executa `/read` e **não** zera o badge. Uma edição cria uma nova revisão e nova confirmação de entrega.
- Uma confirmação de leitura só ocorre com conversa aberta, painel realmente visível, aba e janela em foco, histórico renderizado e visualização no final da conversa. O botão Voltar fecha a seleção da conversa.
- Abrir uma conversa rola até a mensagem mais recente; rolar para cima mantém a posição. Novas mensagens recebidas enquanto o usuário lê o histórico mostram uma seta para baixo e um contador, sem deslocar a tela.
- Mensagens de outras conversas podem mostrar um aviso flutuante com prévia; abri-lo exige ação explícita do usuário e dispensá-lo não altera o estado de leitura.
- Header da conversa fixo, campo de mensagem contrastante e com borda visível, menu de ações do balão contido no viewport com blur, avatares com cache, filtros Todas/Não lidas e placeholders de carregamento.
- A ação **Responder** cria uma referência relacional persistente à mensagem original. Mensagens antigas com citação textual continuam renderizadas por compatibilidade. Edição, exclusão, encaminhamento e reações são persistidas; anexos e áudios aguardam API real. Não exibir opções falsas como se já funcionassem.

### Segurança
Todas as rotas exigem sessão, e cada acesso a um ID de conversa confirma participação. Escritas validam o cabeçalho Origin. Não há suporte a grupos no mensageiro individual. Perfis privados ficam ocultos na busca, mas as conversas já existentes continuam disponíveis para seus participantes.

### Banco
A migração `0003_live_direct_messages` acrescenta `client_id` (UUID único) e `read_at` no histórico. A `0004_dm_actions` acrescenta `delivered_at`, `edited_at`, `deleted_at`, `forwarded_from_id` e `direct_message_reactions`. A `0005_dm_replies` acrescenta `reply_to_id` (FK opcional para a mensagem original). A `0006_dm_reaction_notifications` adiciona `notified_at` e `read_at` às reações: reações antigas não geram notificações retroativas. **Migrar o banco antes de implantar a API**, senão consultas podem falhar. Nenhum arquivo binário é armazenado no Neon.

### Próximas etapas
Paginação do histórico, anexos privados no R2, push, controle antispam e moderação.

### Cancelamento, eventos de reação e navegação

- `DELETE /api/v1/dm/conversations/:id/messages/:messageId` cancela uma mensagem própria **não lida**: remoção definitiva, sem ocupar espaço no chat. Caso `read_at` esteja preenchido, retorna `409` e não altera a mensagem.
- `GET /api/v1/dm/conversations/:id/messages?around=<uuid>` retorna um trecho autorizado do histórico em torno de uma mensagem original, para rolagem/destaque ao tocar na resposta.
- Reações permanecem como pequenos indicadores vinculados ao **balão original**, sem evento ou balão extra no histórico. Elas continuam otimistas e podem ser desfeitas.
- A **prévia da conversa** mostra a reação mais recente quando é o evento mais recente. Para quem recebeu: “Maria reagiu ❤️ à sua mensagem”, gerando **uma notificação não lida** até ler a conversa aberta. Para quem reagiu: “Você reagiu ❤️ à mensagem”, **sem aumentar a contagem de não lidas**. A API retorna `lastReactionAuthorId` para diferenciar as duas perspectivas. Desfazer a reação remove a prévia quando não houver outra reação recente. O ícone Conversas soma somente mensagens e reações recebidas não lidas, por SSE/polling.
- Identidade visual: balões de mensagens com cantos retos.
- As linhas de status são segmentadas **por estado efetivo** dentro de sequências de mensagens próprias. Uma mensagem **Lida** jamais compartilha o status de outra **Enviada/Recebida**. Editar uma mensagem inicia um bloco próprio em **Enviada**; `delivered_at` e `read_at` anteriores à edição não valem como confirmação do conteúdo revisado. As rotas `/received` e `/read` renovam os horários ao visualizar a revisão. O `read_at` histórico permanece no banco para não liberar o cancelamento de mensagem anteriormente lida. Nenhuma migração adicional é necessária.


### Anexos individuais privados — primeira entrega

- **Galeria, Câmera, Vídeo e Arquivo** conectados ao mensageiro real; **Localização** usa a permissão explícita do navegador, gera uma prévia antes do envio e envia um cartão de mapa como mensagem real, sem criar arquivos no R2. Primeiro escopo: um arquivo por mensagem, até **50 MB**, tipos JPEG/PNG/WebP/GIF, MP4/WebM, PDF, TXT, ZIP ou arquivo genérico para download; sem transcodificação, gravação de áudio ou uploads em lote.

- **Proteção antifalsificação:** o Worker assina os metadados com HMAC SHA-256 via variável secreta `DM_ATTACHMENT_PROOF_SECRET`. A API valida a assinatura em tempo constante antes de aceitar um anexo; requisições diretas sem assinatura são recusadas. A variável secreta precisa ser configurada com o **mesmo valor**, de pelo menos 32 caracteres, no Worker da Cloudflare e no Render **antes do deploy**; não entra no repositório nem nas URLs.
- Bucket **R2 privado** `uorqui-dm-attachments`, distinto da mídia do perfil, sem URL pública. Worker recebe bytes por `POST /api/media/dm/:id` após origem e sessão verificadas; cria a mensagem no backend com ID de cliente idempotente, metadados e referência ao objeto. Uploads não confirmados são descartados em melhor esforço. O banco guarda **somente metadados**, não os bytes.
- `GET/HEAD /media/dm/:conversationId/:attachmentId` verifica sessão, participação e vínculo do arquivo a uma mensagem não cancelada antes do R2. Resposta privada com `no-store`, `nosniff`, `Content-Disposition` seguro, sem acesso público. O Worker tenta remover o objeto ao cancelar mensagem não lida.
- Balões com **cantos retos**, prévia de imagem ampliável, vídeo com controles, arquivos para baixar, nome e horário. Envio otimista com miniatura local, status e opção de reenviar falhas usando o mesmo `clientId`; reações, recibos, respostas e badge continuam vinculados à mensagem.
- A migração **`0007_dm_attachments`** adiciona `attachment_id`, `attachment_name`, `attachment_type`, `attachment_size` e restrição de consistência. **Precisa ser validada no Neon temporário e aprovada antes de aplicar ao banco principal e fazer merge.** A UI não deve publicar antes da migração.


### Paridade de mídia com a versão demo (PR #31)

- Anexos agora ficam **em prévia antes do envio**, com nome, tamanho e ação para remover. Texto digitado pode acompanhar o anexo como legenda. Colar imagem do clipboard abre a mesma prévia.
- Câmera: escolha **Tirar foto** ou **Gravar vídeo** no seletor nativo. Galeria, vídeo e documentos continuam com entradas nativas.
- Microfone: gravar, pausar, retomar, finalizar, descartar e **ouvir antes de enviar**. Player do áudio com seek, duração e velocidades **1×, 1,5×, 2×**; formatos WebM/MP4/OGG/MP3/WAV/AAC conforme suporte do navegador.
- Editor de fotos **antes de enviar**: desenho, retângulo, círculo, seta, cores, desfazer e limpar. Salvar gera um PNG novo sem alterar o original.
- Visualizador de foto/vídeo com rolagem por mídias da conversa, botões anterior/próxima, teclado (←, → e Esc) e opção de salvar; vídeo tem controles nativos.
- O limite é restaurado para **50 MB** com migração Drizzle `0008_dm_attachment_50mb`, trocando somente a restrição `dm_attachment_consistency`. A mudança requer migração no Neon principal antes de publicar o Worker/API do PR #31; nenhum arquivo existente é apagado.
- Localização é enviada como texto especial com link Google Maps depois da permissão e confirmação da prévia; não existe rastreamento contínuo.


### Mídias privadas, rótulos e mapa (PR #32)

- O modal de anexos apresenta **Galeria, Câmera, Arquivo e Localização**. O vídeo é gravado pelo submenu da Câmera; não existe outro botão Vídeo.
- Nomes técnicos de fotos, vídeos, gravações e documentos **não aparecem** nos balões, na prévia de envio, no visualizador ou na lista. A interface usa rótulos traduzidos como **Foto, Vídeo, Áudio, Documento PDF**; o nome real permanece apenas no metadado para salvar o arquivo.
- Mídias do chat possuem **cache em memória da aba** com URL Blob compartilhada entre balão e visualizador, limite agregado **90 MiB**, **50 MiB por item**, **36 itens**, tempo de vida **10 min** e deduplicação de requisições. Imagens carregam sob demanda na interface; áudio é buscado para cache quando o usuário inicia a reprodução; vídeos são armazenados ao abrir o visualizador. Nunca gravar no service worker, Cache Storage, IndexedDB ou localStorage. O primeiro acesso sempre passa pela autorização privada do Worker; logout/troca de conta limpa URLs Blob e requisições em andamento. Cancelar uma mensagem invalida seu objeto em cache.
- Player de áudio usa cores semânticas **bg-card/text-foreground** e botão **bg-primary/text-primary-foreground**, trilha em cor primária e texto de tempo/velocidade com alto contraste em Light e Dark.
- Localização agora abre **Google Maps** (`https://www.google.com/maps?q=latitude,longitude`), sem chave API. Cartões antigos do OpenStreetMap continuam reconhecidos e também passam a abrir o Google Maps. O aplicativo pede permissão somente quando a pessoa seleciona Localização, nunca em segundo plano.
### Amizades e mensagens por visibilidade do perfil

- **Perfis públicos** recebem novas mensagens individuais sem exigência de amizade. **Perfis privados** só recebem mensagens de amizades `accepted` (solicitação enviada e aceita). A permissão é verificada no servidor ao abrir conversa e em cada nova mensagem, edição, reação e encaminhamento; uploads passam pela mesma criação de mensagem autorizada.
- Alterar um perfil para privado bloqueia novas mensagens de não amigos, mesmo em conversas antigas. O histórico existente não é apagado e continua disponível para os participantes. A remoção da amizade também encerra a permissão de enviar mensagens para um perfil privado.
- A área **Amigos** contém as abas Amigos, Recebidos e Enviados, com pesquisa, solicitação, aceitação, recusa, cancelamento e desfazer amizade. A solicitação pode ser enviada pelo @usuário exato para perfis privados; perfis privados continuam ocultos na busca pública. A lista de amizades não é recíproca antes da aceitação.
- API de amizades: `GET /api/v1/friends`, `GET /api/v1/friends/relationship/:handle`, `POST /api/v1/friends/requests`, `POST /api/v1/friends/requests/:handle/accept`, `POST /api/v1/friends/requests/:handle/decline`, `DELETE /api/v1/friends/:handle`. Todas autenticadas; escritas com proteção Origin. Eventos de atualização de amizade são enviados via SSE sem conteúdo sensível.
- Proteção inicial contra spam de solicitações: até 10 solicitações por 24 h, 25 pendentes, intervalo de 24 h após cancelar e 7 dias após recusa. Isso não constitui ainda um sistema completo de bloqueio/denúncia nem push com aplicativo fechado.
- Migração **`0009_mutual_friendships`** cria a tabela `user_friendships` (pares canônicos, estado e solicitante). **Aplicar na Neon de produção antes de publicar a API/web.** A migração anterior de contatos unilaterais foi substituída ainda na PR, sem aplicação no banco principal.
