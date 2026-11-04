# Mensageiro 1:1 — Uorqui

## Primeira versão conectada

O mensageiro individual usa autenticação Better Auth, PostgreSQL no Neon e as tabelas `direct_conversations` e `direct_messages`. O frontend React substitui os contatos fictícios por conversas verdadeiras entre exatamente duas pessoas.

### Funcionalidades
- Busca usuários públicos por nome ou @usuário e inicia conversa pelo botão **Conversar** do perfil público.
- Uma conversa única por par de usuários, independentemente de quem inicia.
- Envia texto até 4.000 caracteres e guarda histórico persistente (últimas 100 mensagens na primeira versão).
- ID único criado no cliente impede duplicação no reenvio.
- O horário original aparece junto ao texto de cada mensagem. **Somente o status Lida** é exibido em um aviso discreto ao final de blocos consecutivos de mensagens próprias que foram efetivamente lidas; **Enviando, Enviada e Recebida** continuam existindo na lógica de entrega, mas não são exibidos nos balões nem nas linhas de status. Uma mensagem editada só volta a aparecer como **Lida** depois da confirmação de leitura da versão atual. O badge de mensagens não lidas continua atualizado.
- Atualização instantânea via **SSE e PostgreSQL LISTEN/NOTIFY**, com polling de segurança quando necessário. O Web Push para mensagens foi implementado, mas entrega com PWA fechado depende de permissões e das restrições do dispositivo; presença online geral ainda não é garantida.
- Interface mobile-first preservando header fixo e teclado; campo de digitação com contraste em Light/Dark e sem indicador “Ao vivo”.
- O balão otimista aparece imediatamente **sem spinner**. O compositor continua liberado; em caso de falha, o balão oferece **Reenviar** usando o mesmo `clientId`. Spinners de outras ações e placeholders de mídia não são afetados.
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



### Sincronização em tempo real (SSE) — antes e depois da otimização

**O tempo real já existia antes de 04/11/2026.** O Uorqui já recebia eventos via `GET /api/v1/dm/events`, `EventSource` e PostgreSQL `LISTEN/NOTIFY`. A otimização **não introduziu SSE**: reduziu o trabalho necessário para transformar cada evento em uma atualização visível.

| Aspecto | Antes de 04/11/2026 | Implementação atual |
| --- | --- | --- |
| Chegada de nova mensagem | Evento com `kind` e `conversationId`; o cliente buscava novamente o histórico via HTTP. | Evento `message` pode incluir uma projeção compacta da mensagem para renderização imediata na conversa aberta. |
| Conexões | Chat e contador global de não lidas mantinham `EventSource` separados. | `dmEventStream.ts` compartilha um `EventSource` entre chat e badge. |
| Lista de conversas | Vários consumidores podiam consultar a mesma lista simultaneamente. | `loadDmInboxNetwork` deduplica requisições concorrentes e invalida a lista após mudanças. |
| Sincronização de segurança | Consultas periódicas relativamente frequentes, mesmo com o stream saudável. | Reconciliação de segurança aproximadamente a cada 120 s com SSE saudável; cerca de 12–15 s se desconectado e com a página visível. |
| Edições, reações e recibos | Evento sinalizava mudança e acionava nova consulta. | Continuam sendo reconciliados pela API quando o evento não transporta os dados completos. |

**Fluxo de mensagem atual:**

1. A rota autenticada valida as permissões, persiste a mensagem e publica o evento de conversa; a API usa uma consulta SQL para notificar os dois participantes.
2. O listener PostgreSQL `LISTEN uorqui_dm_events` da instância Fastify distribui o evento apenas aos assinantes autenticados. Para `LISTEN`, usar conexão de sessão direta ao Neon (`DATABASE_DIRECT_URL` quando necessário), não a conexão em modo transaction pooling.
3. Quando o payload compacto é incluído, a conversa aberta insere a mensagem imediatamente na interface e no cache local, sem aguardar um novo `GET /messages`. Se os dados não estiverem disponíveis, o cliente busca o histórico autorizado.
4. A lista de conversas e os contadores de não lidas são sincronizados por consultas autenticadas deduplicadas; eventos de recibo, edição, reação e cancelamento exigem reconciliação quando necessário.
5. Ao reconectar, voltar ao foco ou atingir o intervalo de segurança, o cliente reconcilia com o servidor, que permanece a **fonte autoritativa**. A reconciliação preserva mensagens recebidas enquanto a requisição HTTP estava em andamento.

**Conexão, privacidade e limitações:**

- SSE usa o cookie de sessão Better Auth, sem tokens na URL; o backend valida a identidade e restringe assinaturas a cada usuário. O conteúdo da mensagem **pode trafegar no evento autenticado** — já não é correto afirmar que o SSE envia somente `kind` e `conversationId`.
- O fluxo envia heartbeat a cada 15 s, encerra a conexão após cerca de 5 min para revalidar sessão, fecha com a página oculta e usa reconexão automática ao voltar.
- O payload compacto pode ser omitido quando ultrapassa o limite de tamanho do evento; nesse caso o cliente usa a API. O fluxo SSE é distinto de **Web Push** e não garante entrega de notificações com o aplicativo fechado. SSE não foi substituído por WebSocket.
- Receber uma mensagem e mostrá-la no badge pode confirmar **Recebida** sem marcá-la como **Lida**. Leitura requer conversa visível, em foco e posicionada no conteúdo mais recente. Eventos ou cache local não executam leitura por si mesmos.

Código principal: `apps/api/src/dm-events.ts`, `apps/api/src/direct-message-routes.ts`, `apps/web/src/dmEventStream.ts`, `apps/web/src/LiveDirectChat.tsx` e `apps/web/src/useUnreadDirectMessages.ts`.

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
- Os avisos de leitura agrupam mensagens próprias por estado efetivo, mas **exibem apenas Lida** quando a versão atual da mensagem foi confirmada como lida; não exibem ícone de carregamento, estados intermediários ou horário de atualização adicional. `delivered_at` e `read_at` anteriores à edição não confirmam o conteúdo revisado. As rotas `/received` e `/read` continuam renovando os horários de recibo internamente; o `read_at` histórico ainda impede o cancelamento de mensagens já lidas. Nenhuma migração adicional é necessária.


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
- O cache atual de mídia privada é **somente em memória da aba**: **48 MiB no total**, **12 MiB por item**, **24 entradas**, **45 minutos** de idade máxima e até **3 downloads paralelos**, com deduplicação. Imagens podem ser carregadas sob demanda, áudios sob ação do usuário e vídeos ao abrir. Arquivos maiores contornam o cache de Blob e seguem pela rota autenticada. **Não** persistir mídia privada no IndexedDB, Service Worker, Cache Storage ou localStorage. Todo acesso continua sujeito à autorização do Worker; logout/troca de conta limpa o cache da sessão, e cancelamento invalida a mídia. O **IndexedDB descrito abaixo é usado para metadados/histórico de mensagens e fila de envio**, não para manter cópias persistentes das mídias recebidas.
- Player de áudio usa cores semânticas **bg-card/text-foreground** e botão **bg-primary/text-primary-foreground**, trilha em cor primária e texto de tempo/velocidade com alto contraste em Light e Dark.
- Localização agora abre **Google Maps** (`https://www.google.com/maps?q=latitude,longitude`), sem chave API. Cartões antigos do OpenStreetMap continuam reconhecidos e também passam a abrir o Google Maps. O aplicativo pede permissão somente quando a pessoa seleciona Localização, nunca em segundo plano.
### Amizades e mensagens por visibilidade do perfil

- **Perfis públicos** recebem novas mensagens individuais sem exigência de amizade. **Perfis privados** só recebem mensagens de amizades `accepted` (solicitação enviada e aceita). A permissão é verificada no servidor ao abrir conversa e em cada nova mensagem, edição, reação e encaminhamento; uploads passam pela mesma criação de mensagem autorizada.
- Alterar um perfil para privado bloqueia novas mensagens de não amigos, mesmo em conversas antigas. O histórico existente não é apagado e continua disponível para os participantes. A remoção da amizade também encerra a permissão de enviar mensagens para um perfil privado.
- A área **Amigos** contém as abas Amigos, Recebidos e Enviados, com pesquisa, solicitação, aceitação, recusa, cancelamento e desfazer amizade. A solicitação pode ser enviada pelo @usuário exato para perfis privados; perfis privados continuam ocultos na busca pública. A lista de amizades não é recíproca antes da aceitação.
- API de amizades: `GET /api/v1/friends`, `GET /api/v1/friends/relationship/:handle`, `POST /api/v1/friends/requests`, `POST /api/v1/friends/requests/:handle/accept`, `POST /api/v1/friends/requests/:handle/decline`, `DELETE /api/v1/friends/:handle`. Todas autenticadas; escritas com proteção Origin. Eventos de atualização de amizade são enviados via SSE sem conteúdo sensível.
- Proteção inicial contra spam de solicitações: até 10 solicitações por 24 h, 25 pendentes, intervalo de 24 h após cancelar e 7 dias após recusa. Isso não constitui ainda um sistema completo de bloqueio/denúncia nem push com aplicativo fechado.
- Migração **`0009_mutual_friendships`** cria a tabela `user_friendships` (pares canônicos, estado e solicitante). **Aplicar na Neon de produção antes de publicar a API/web.** A migração anterior de contatos unilaterais foi substituída ainda na PR, sem aplicação no banco principal.

### Bloqueio de contas e ocultação de fotos

- Em um perfil público ou no cabeçalho da conversa, use **Bloquear** e confirme. Em **Amigos → Bloqueados**, veja sua lista privativa e escolha **Desbloquear**. Há interface em português/inglês, mobile e desktop.
- O bloqueio é unilateral, mas **impede contato nos dois sentidos**: não se iniciam conversas, mensagens, edições, reações, encaminhamentos, anexos ou novas solicitações entre as duas contas. Bloquear encerra amizades/solicitações pendentes; desbloquear **não** restaura a amizade. O histórico existente é preservado.
- Fotos de perfil **e capas** são ocultadas entre ambas as contas. A API deixa de incluir URL de avatar na listagem de conversas; o perfil e a busca deixam de expor os dados; a autorização do Worker para **R2** recusa também links diretos de avatar/capa de perfis públicos. O cache tab-local de fotos é esvaziado ao bloquear e nas notificações SSE de alteração. As fotos dos bloqueados não são exibidas na lista de bloqueios.
- Endpoints autenticados: `GET /api/v1/blocks` (lista privativa), `POST /api/v1/blocks` (handle; idempotente) e `DELETE /api/v1/blocks/:handle` (idempotente). Escritas verificam Origin; transação revoga a amizade e registra o bloqueio.
- Limitação: uma foto já copiada ou disponibilizada externamente não pode ser apagada retroativamente pelo bloqueio. URLs externas cadastradas pelo usuário não estão sob controle do R2.
- Migração Drizzle `0010_user_blocks` cria `user_blocks`. **Aplicar em Neon antes do deploy da versão que usa essa tabela**.

## Desempenho, cache e recuperação (04/11/2026)

Esta evolução foi motivada pela percepção de maior demora no mensageiro social em comparação ao produto legado **Uorqui-chat**. **O principal ganho é evitar refazer toda a consulta HTTP após cada evento SSE, não a ativação de tempo real (que já existia).** O mensageiro legado permanece independente e não foi alterado.

- **Cache-first:** a inbox e as últimas 120 mensagens por conversa usam IndexedDB isolado pelo ID da conta. A API continua a fonte oficial; o cache só aparece depois da autenticação e é apagado no logout bem-sucedido.
- **Fila de saída:** mensagens e arquivos são gravados no IndexedDB antes da requisição. O serviço de envio permanece ativo enquanto a conta estiver aberta, inclusive ao sair da tela de conversas. Falhas de rede e erros temporários usam até oito tentativas e backoff; falhas permanentes exibem reenvio manual. O `clientId` estável evita duplicações no servidor.
- **Realtime:** o badge e o chat compartilham uma conexão SSE. Eventos compactos projetam mensagens recebidas diretamente na conversa visível; alterações de recibos, reações e histórico sem dados completos usam a API para reconciliar. Requisições simultâneas da lista são deduplicadas. **Ver quadro Antes/Depois na seção de SSE acima**.
- **Fallback:** com SSE saudável existe apenas uma reconciliação de segurança a cada ~120 s. Quando a conexão falha, a sincronização HTTP recupera o estado a cada ~12–15 s enquanto a página está visível.
- **Mídia privada:** mantém apenas cache temporário na memória, limitado a 48 MiB, 12 MiB por item, 24 entradas, 45 minutos e três downloads simultâneos. Dados privados **não** são mantidos em cache compartilhado do Service Worker ou CDN. Conteúdo fora dos limites é servido pelas rotas autorizadas, sem pré-carregamento agressivo.
- **Eficiência dos eventos:** a API publica os avisos de mensagem para os dois participantes em uma única consulta SQL, reduzindo consultas desnecessárias.
- **Validação:** executar typecheck/build e testes de integração, depois testar em dois dispositivos: offline/online, envio de mídia, troca de contas, logout, stream desconectado, envio simultâneo e retomada de chat. CI não mede a latência fim a fim no Brasil.

**Limites:** a fila roda quando a aplicação pode executar JavaScript; navegador/PWA suspenso pelo sistema operacional não garante envio em background. Mensagens canceladas e permissões continuam sob autorização do servidor.
