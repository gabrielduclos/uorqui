# Notas de versão

O novo Uorqui utiliza [versionamento semântico](https://semver.org/lang/pt-BR/) nos manifestos da aplicação. O sufixo `-beta.N` indica **pré-lançamento** e não uma versão estável ou liberada para todos.

## [Unreleased]

Mudanças posteriores ao marco exigem aumento de versão nos três manifestos npm e atualização dos changelogs. Ver [política de versões](docs/pt-BR/versoes.md).

## [0.1.0-beta.19] — 09/11/2026

- **Verificação de instância em segundo plano:** ao recuperar a conta autenticada, a checagem da vaga desktop/mobile acontece sob a tela inicial de carregamento do Uorqui, que permanece montada até o resultado. A interface deixa de exibir a tela separada **Verificando instância ativa…** e evita a troca intermediária de layout.
- **Resultados diretos:** vaga livre abre o aplicativo; conflito abre **Uorqui já está aberto** com **Usar nesta aba**; erro de rede/servidor mantém **Tentar novamente** com o aplicativo suspenso. Permanecem as mesmas sessões, transferência, SSE e verificação a cada 15 segundos.
- **Escopo e testes:** ajuste somente de interface na inicialização/bloqueio, sem migração SQL nem alterações na API. Validar abertura autenticada/recarregamento, segunda aba e troca de controle, retomada do segundo plano, falhas de rede, desktop/mobile/PWA e typecheck/build web.

## [0.1.0-beta.18] — 09/11/2026

- **Uma instância por categoria:** uma aba/janela desktop e uma instância mobile/PWA por conta autenticada, inclusive entre navegadores distintos. A segunda aba fica bloqueada, sem sair da conta; **Usar nesta aba** assume explicitamente a vaga e suspende a anterior (desmonta chats, SSE e mídias), preservando o login.
- **Controle atômico no servidor:** a migração `0043_app_instance_leases.sql` cria uma vaga por conta e categoria no PostgreSQL. A rota `POST /api/v1/instances/claim` adquire/renova a vaga ou devolve `409 INSTANCE_IN_USE`; somente `takeover:true` substitui a instância viva. Após 60 segundos sem renovação, a vaga expira; `/release` encerra somente a posse da instância certa. Requisições exigem autenticação e Origin válido. Se a migração ainda não foi aplicada durante o deploy escalonado, o serviço mantém o acesso normal, sem bloquear todas as contas; para efetivar o limite em produção, aplicar a migração antes de considerar o recurso ativo.
- **Transferência rápida:** BroadcastChannel bloqueia a aba anterior no mesmo navegador; evento SSE `instance-lease` avisa outros navegadores quando houver transferência, com consulta a cada 15 segundos como fallback. Falhas persistentes de rede suspendem temporariamente a interface; não encerram a sessão. Mobile é detectado pelo agente do navegador (incluindo iPadOS), sem depender da largura da janela. O bloqueio limita as interfaces abertas, não substitui autorização de API contra clientes maliciosos.
- **Escopo e testes:** integração com PostgreSQL temporário cobre isolamento por usuário/categoria, validação de origem, troca de controle, expiração e tentativa de liberação pela aba antiga. Validar abas duplicadas, PWA iOS/Android, desktop e celular simultâneos, encerramento de chamada de voz e retomada após queda de rede. Migração SQL aditiva; nenhuma revogação de login ou alteração das permissões de push.

## [0.1.0-beta.17] — 09/11/2026

- **Contagem de e-mails não lidos:** o Gmail passa a consultar o valor `messagesUnread` do marcador `INBOX`, no lugar da estimativa `messages.list.resultSizeEstimate`. Outlook/IMAP mantêm seus totais do provedor. A interface ignora respostas antigas recebidas após marcar como lido/mover, sincroniza o badge no botão Atualizar e ao mover mensagens e não desconta e-mails de Spam/Enviados/Lixeira da Caixa de entrada.
- **Corrida no monitoramento:** a API registra o horário de atualização após leitura individual, leitura em lote e movimentação. Uma varredura iniciada antes dessas operações não sobrescreve o total mais recente.
- **Notificação com app aberto:** ao tocar uma notificação do sistema com a aba Uorqui visível, o service worker envia a rota diretamente para o React, sem depender de uma navegação que pode reaproveitar a página sem reabrir a tela. Instâncias ocultas/congeladas/fechadas continuam usando URL de destino; o aplicativo também processa links no retorno de foco e navegação.
- **Validação:** conferir leitura individual/em lote, múltiplas contas, atualização de provedores, totais do Gmail, notificações com aba visível/oculta e PWA fechado. Sem migração de banco, mudança de login, R2 ou conexões de e-mail.

## [0.1.0-beta.16] — 09/11/2026

- **Convites no idioma correto:** o diálogo de entrada após autenticação, botões, rótulos acessíveis, título alternativo e avisos de erro (convite inválido, banimento e falha) passam a seguir o idioma ativo do aplicativo. O idioma inicial vem de `navigator.language`; caso o usuário já tenha escolhido outro idioma, a preferência salva continua valendo. Não há textos misturados em PT/EN; a entrada depende sempre de aceite explícito.
- **Sem nova oferta quando o desktop já permite push:** `PwaFirstRun` só oferece a autorização diária enquanto a permissão do navegador estiver como `default` (pendente). Com permissão concedida, falhas ou ausência de inscrição no serviço não exibem **Ativar notificações** novamente. A reconexão continua disponível em **Notificações → Ajustes → Permissão neste dispositivo**. O aviso de instalação do PWA permanece independente.
- **Escopo e validação:** somente frontend; sem migração de banco, API, esquema push ou alteração de permissões. Conferir convites em PT/EN, troca de idioma com diálogo aberto e permissões concedida/negada/pendente no desktop, além da reconexão manual. Executar build/typecheck do web e CI de API/integração antes do merge.

## [0.1.0-beta.15] — 09/11/2026

- **Compactação de vídeo aprimorada:** preparação no navegador com resolução máxima de 1280×720, cerca de 1,3 Mbps de vídeo e 96 kbps de áudio, preservando o arquivo original quando a compactação não for suportada ou não oferecer redução significativa. O limite de envio final permanece **50 MB**; não aumenta a capacidade permitida no R2.
- **Preparação visível e cancelável:** o compositor de conversas e canais mostra tamanho original, percentual de progresso e botão **Cancelar** durante a compactação. Após converter, exibe os tamanhos anterior e final. O cancelamento interrompe antes do upload e libera os recursos locais; inicialização e carregamento agora respeitam cancelamento sem aguardar todos os timeouts.
- **Energia:** tenta manter a tela ligada durante a compactação local por Screen Wake Lock e libera a solicitação ao concluir. Navegador e sistema podem negar o recurso.
- **Limites e validação:** vídeo original até 300 MB e compactação em tempo real para clipes de até 180 segundos. É preciso conferir áudio e qualidade no Safari/PWA iOS e Android/PWA; CI valida build e compatibilidade com API, não mídia real. Sem mudanças no banco/backend.

## [0.1.0-beta.14] — 09/11/2026

- **Gravação de áudio:** o compositor compartilhado de conversas e canais solicita Screen Wake Lock durante gravação ou pausa e libera ao finalizar, descartar ou sair. Reativa ao voltar para a tela, quando o navegador/sistema permitir.
- **Editar canal no header:** proprietários e administradores recebem Editar ao lado de Convidar no cabeçalho do canal; o atalho abre Moderação → Canais diretamente no canal selecionado, preservando permissões da API.
- **Compactação de vídeos da Galeria:** Galeria passa a aceitar fotos e vídeos MP4/WebM/MOV; o vídeo da Câmera usa a mesma preparação. Vídeos originais de até 300 MB podem ser compactados localmente com canvas/MediaRecorder antes do envio. O limite final para o R2 **permanece em 50 MB**, e um original só é preservado se couber quando a compactação for indisponível ou ineficaz. A interface mostra o progresso e o aviso de fallback. Fotos continuam em lote; vídeos são selecionados individualmente.
- **Riscos/testes:** verificar compatibilidade, preservação do áudio, duração da conversão, uso de memória e qualidade em dispositivos reais, sobretudo Safari/PWA iOS. A compressão em tempo real atualmente cobre clipes de até 3 minutos; os demais usam o original caso caibam. Sem mudança na API, banco ou limite do R2.

## [0.1.0-beta.13] — 08/11/2026

- **Onboarding responsivo:** o guia mede a própria altura, escolhe espaço acima ou abaixo do item destacado na navegação mobile conforme o viewport e permite rolagem interna em telas baixas. No desktop, mantém a posição lateral.
- **Escuro como padrão:** usuários sem tema salvo agora iniciam em Dark; preferências Light/Dark anteriores continuam respeitadas e podem ser alteradas a qualquer momento.
- **Escopo e validação:** frontend e UI Kit bilíngue, sem migração de API ou banco. Validar Comunidades, Mensagens e E-mail no PWA iOS/Android, telas estreitas, rotação, PT/EN e ambos os temas.

## [0.1.0-beta.12] — 07/11/2026

- **Abertura de e-mails Outlook:** detalhes, marcação como lido e resposta agora usam rotas POST curtas com o ID opaco da mensagem em JSON validado, evitando falhas HTTP 414 relacionadas ao tamanho do caminho da URL.
- **Caixa unificada:** opção Todas as contas reúne Gmail, Outlook e IMAP conectado com ordenação cronológica, identificação da conta, paginação independente e filtro por caixa individual. Ao escrever pela lista unificada, o remetente é selecionável.
- **Marcar como lido em lote:** seleção múltipla permite marcar mensagens como lidas, além de mover para Spam/Lixeira, inclusive entre contas, com tratamento de falhas parciais e atualização dos contadores. Cada seleção combina conta e ID para evitar colisões.
- **Compatibilidade e segurança:** rotas antigas continuam disponíveis; as novas preservam sessão, titularidade da conta, verificação de origem e validação dos IDs. Sem migração de banco nem novas permissões.
- **Validação:** executar typecheck/build da API e do frontend; após deploy, testar a abertura, marcação de leitura e resposta de e-mails Outlook com IDs longos no PWA atualizado. A origem exata do 414 em produção ainda não foi verificada.

## [0.1.0-beta.11] — 06/11/2026

- **Sem prévia duplicada para GIFs nas mensagens privadas:** GIFs reconhecidos do GIPHY continuam aparecendo como animação no chat, mas não montam o cartão externo `LinkPreview` nem consultam seus metadados. Links normais continuam com prévia.
- **Escopo:** condição visual apenas no frontend; sem mudanças de API, banco, mídia, SSE ou migração. Testar GIFs e links normais no celular e desktop, nos temas claro/escuro.

## [0.1.0-beta.10] — 06/11/2026

- **Largura dos balões privados:** cada mensagem reserva os 36 px do botão de três pontos e os 6 px de espaçamento, inclusive antes de concluir o envio otimista, evitando rolagem horizontal e mudança de largura quando o menu aparecer.
- **Respostas padronizadas com canais:** mensagens privadas usam a seta de retorno, referência compacta em uma linha **autor: trecho**, reticências e clique para localizar a original, além da mesma prévia de uma linha no editor com botão de cancelar.
- **Respostas antigas:** citações embutidas em texto recebem a mesma aparência compacta, sem falso clique porque não possuem ID da mensagem original.
- **Escopo e validação:** somente interface e documentação; sem mudanças de API, banco, armazenamento ou SSE. Conferir telas estreitas, textos/anexos longos, envio otimista, temas claro/escuro e navegação à mensagem original.

## [0.1.0-beta.9] — 06/11/2026

- **Seta nas respostas dos canais:** referência e prévia no editor recebem uma seta de retorno à direita, mantendo autor e trecho compactos em uma única linha (inclusive no editor), com reticências em textos longos e clique para visualizar a mensagem original, sem expansão multilinha nem botão Ler mais.
- **Chat privado restaurado:** respostas individuais voltam ao cartão de citação e à prévia do editor anteriores, com contraste próprio para os temas claro e escuro.
- **Sem agrupamento nos canais:** toda mensagem da comunidade exibe foto, nome, username e horário, inclusive quando o mesmo usuário envia várias mensagens seguidas.
- **Escopo:** alteração somente visual no frontend. Sem migração, ajustes de API, banco, permissões, SSE ou histórico de mensagens. Revisar mobile/desktop e temas Light/Dark.

## [0.1.0-beta.8] — 06/11/2026

- **Referência de resposta na mesma linha:** nome de quem escreveu e trecho da mensagem citada aparecem juntos, como **Sandra: belezinha**, em canais e conversas privadas, sem quebra forçada entre os dois.
- **Prévia do editor:** mostra igualmente autor e trecho na mesma linha, mantendo o botão de cancelar e a opção de expansão.
- **Textos longos:** o limite visual passa a abranger autor e citação como um único texto, permitindo até quatro linhas nas mensagens e três no editor. **Ler mais / Mostrar menos** continua revelando a mensagem inteira e o clique na referência localiza a original.
- **Identificação:** nos canais, prefere o nome de exibição do autor quando a mensagem original está carregada; caso contrário, utiliza o username. CSS global preserva responsividade e contraste nos temas claro e escuro. Apenas frontend, sem migração ou alteração na API.

## [0.1.0-beta.7] — 06/11/2026

- **Ordem de leitura das respostas:** nos canais, o nome e horário de quem respondeu voltam a aparecer **antes** da mensagem citada, seguidos do conteúdo da nova resposta. Nas mensagens privadas, a citação também permanece antes do texto respondido.
- **Prévia da mensagem original:** removido o corte fixo de 180 caracteres. A citação pode ocupar **quatro linhas** nas mensagens e **três linhas** acima do editor, com **Ler mais / Mostrar menos** para visualizar todo o texto sem perder o atalho para localizar o original.
- **Mobile:** balões com resposta ganham largura suficiente para não espremer a citação; a prévia expande sem rolagem horizontal. Respostas antigas continuam legíveis.
- **Tema e navegação:** CSS global para Light/Dark e preservação dos vínculos, mensagens otimistas e salto à mensagem original. Apenas frontend; sem migração do banco ou alteração de API.

## [0.1.0-beta.6] — 06/11/2026

- **Respostas no estilo Discord:** canais e conversas privadas agora usam uma referência compacta, com conector curvo, nome do autor e trecho da mensagem original, sem balão de citação dentro de outro balão.
- **Posicionamento:** nos canais, a referência aparece antes do cabeçalho e conteúdo da resposta; no mensageiro privado, antes do texto da resposta. Ambas mantêm o clique para localizar a mensagem original.
- **Editor:** prévia em uma única linha acima do campo de digitação, com cancelamento, truncamento responsivo e resumo para GIFs, mensagens excluídas e anexos.
- **Visual:** componente React compartilhado e CSS global com contraste nos temas claro/escuro, foco por teclado e largura adequada no mobile. Respostas antigas continuam legíveis. Não há alteração de API nem migração de banco.

## [0.1.0-beta.5] — 06/11/2026

- **Abas na central de notificações:** **Todas, Mensagens, Menções, E-mail, Convites e Contatos**, com rolagem horizontal responsiva, navegação por teclado e contadores por categoria. Todas reúne as categorias sem excluir atividades antigas.
- **Mensagens:** a aba apresenta conversas privadas e canais de comunidades com mensagens não lidas e abre o destino correto.
- **Menções:** cada `@usuário` válido gera uma notificação persistente mesmo sem push ativado; acesso de membro, canais restritos/protegidos, bans e bloqueios são respeitados na criação e consulta. Cada aviso abre seu canal.
- **E-mail:** novos e-mails detectados pelo monitoramento entram no histórico com remetente/assunto e acesso ao leitor. Existe também um atalho com o total de não lidos de todas as contas. O primeiro monitoramento continua silencioso e não simula notificações históricas.
- **Ações:** marcar aviso como lido ou dispensá-lo, marcar atividades como lidas em Todas; desconectar o e-mail ou apagar a conta remove os registros relacionados.
- **Banco de dados:** migração aditiva `0042_notification_inbox_events`; aplicar antes da API/Worker. Testes abrangem isolamento por usuário, permissões, leitura/exclusão, segurança de origem, autoria e desconexão.

## [0.1.0-beta.4] — 06/11/2026

- **Notificações no desktop:** o convite diário para ativar o push passa a ter prioridade sobre a oferta de instalar o PWA. Antes, o aviso de instalação surgia primeiro e cancelava o lembrete de notificações.
- **Sem sobreposição:** a instalação poderá ser oferecida em outro acesso, sem interromper a permissão de notificações já apresentada durante a visita.
- **Permissão do navegador:** o pedido nativo continua acontecendo somente após clicar em **Ativar notificações**. Em caso de bloqueio, o usuário recebe orientação para alterar a permissão nas configurações do site.
- **Mobile preservado:** no iOS o push continua exigindo PWA instalado; avisos móveis e limite de uma oferta por conta/dia não mudam. A ativação manual permanece em Notificações → Ajustes.

## [0.1.0-beta.3] — 06/11/2026

- **Outlook OAuth restaurado:** a conexão de novas contas Outlook.com, Hotmail e Microsoft 365 volta a ser aceita por Microsoft Entra e Graph, com PKCE, estado de uso único, renovação de tokens e armazenamento criptografado. Contas já conectadas permanecem preservadas.
- **Interface de e-mail:** botão Outlook volta ao modal de configuração, junto com Gmail e Servidor manual. Fica indisponível até que as credenciais Microsoft estejam presentes no Render; sem afetar outros provedores.
- **Erros de conexão:** o callback devolve apenas o identificador público do provedor (sem códigos, tokens ou estado) e a interface apresenta instruções específicas para permissões e erros Microsoft.
- **Configuração:** criar aplicativo Entra para contas organizacionais e pessoais, plataforma Web, redirect exato `https://uorqui.app/api/v1/mail/oauth/outlook/callback`, permissões delegadas `User.Read`, `Mail.ReadWrite`, `Mail.Send` e `offline_access`. Configurar `MAIL_MICROSOFT_CLIENT_ID` e `MAIL_MICROSOFT_CLIENT_SECRET` **somente no Render**, preservando `MAIL_TOKEN_KEY`.
- **Testes:** fluxo Microsoft de autorização, escopos, PKCE, callback com isolamento por usuário/provedor, proteção contra replay e ausência de segredos, e bloqueio seguro quando as credenciais não estiverem configuradas. Sem migração do banco.

## [0.1.0-beta.2] — 06/11/2026

- **Canais:** removido o botão Editar do cabeçalho; nome, descrição/regras, acesso e senha são administrados em **Moderação → Canais**.
- **Descrição fixa:** criação e edição de textos de até 4.000 caracteres, exibidos permanentemente abaixo do cabeçalho, com **Ler mais / Mostrar menos** para textos longos. Disponível em canais de texto, voz e reunião.
- **Nomes sugeridos:** novas salas recebem nomes numerados por tipo (**Sala de texto 1**, **Sala de voz 1**, **Sala de reunião 1**); a numeração evita nomes duplicados no mesmo tipo e pode ser alterada antes de salvar. A restrição única no PostgreSQL permanece.
- **Convites:** removidas as ações independentes de convidar/compartilhar a comunidade. Cada canal fornece um link único que aceita a entrada na comunidade e abre o canal de destino. O link pode ser copiado ou enviado por mensagem direta; reunião e canal usam o mesmo modal/link.
- **Descobrir:** a lupa na barra das comunidades foi substituída pelo ícone e nome **Descobrir**, mantendo o acesso à lista de comunidades públicas.
- **Segurança:** convite não contorna senha de canal, permissão de canal restrito nem aprovação de reunião. Link temporário existente é reutilizado; administradores podem gerar o primeiro link se não existir.
- **Migração:** `0039_channel_descriptions`, aditiva, acrescenta a coluna opcional `community_channels.description` sem apagar dados. Exige migração do banco antes do deploy da nova API.
- **Segurança de ingresso:** após login/cadastro, o convite apresenta o nome da comunidade e exige **Entrar na comunidade** ou **Agora não**; cadastro e autenticação nunca resgatam convites automaticamente.
- **Mensagens dos canais:** resposta com referência à mensagem original (também para anexos), envio otimista, menções `@usuário` com autocompletar e destaque, e lista de pessoas que reagiram ao tocar na contagem. Acesso restrito é respeitado; push destaca quando a pessoa foi mencionada.
- **GIFs:** seletor compartilhado nos canais e nas mensagens privadas, com envio/visualização como mídia animada e preservação do rascunho. Suporte a catálogo expansível via GIPHY Trending/Busca com paginação quando configurado `VITE_GIPHY_API_KEY`; sem chave, mantém catálogo local limitado.
- **Exclusão da conta:** em Perfil, confirmação de senha e texto `EXCLUIR`; apaga dados pessoais, sessões, mensagens e vínculos do banco, transferindo comunidades com outros membros. Objetos R2 são removidos por fila persistente e tarefa agendada, com tentativas posteriores. A exclusão de conversas privadas compartilhadas impacta o outro participante. Backups do provedor seguem a política de retenção.
- **Migrações adicionais:** `0040_community_message_replies` e `0041_account_media_cleanup`; aplicá-las antes de publicar a nova API. Testes de integração cobrem exclusão e os fluxos de respostas/reações. Testar exclusão e GC do R2 com dados de teste em ambiente real antes de liberar a opção em produção.
- **Testes:** casos de integração para persistência, autorização, limite e remoção de descrição; compilação de frontend e backend/CI. Testar convite com conta nova, link expirado e PWAs reais após implantação.

## [0.1.0-beta.1] — 06/11/2026

**Marco oficial do beta técnico.** Consolida a interface React, os tokens CSS, a API Fastify e a documentação sob uma única versão no GitHub. Testes automáticos e deploy não certificam todos os fluxos em aparelhos reais.

### Implementação consolidada (04–06 de novembro)

- **Interface:** layout compacto e responsivo de Mensagens/Contatos/Comunidades/E-mail, melhor contraste de respostas nos temas e superfícies globais. UI Kit passa a descrever a **paleta cinza real do workspace**, não as propostas roxas/azuis anteriores. Um par global de tokens Dark/Light substitui declarações duplicadas.
- **Mensageiro:** SSE e horários de entrega/leitura, texto e respostas otimistas, anexos, galeria paginada de todas as mídias/arquivos, uma mensagem fixada compartilhada por conversa, cache e placeholders responsivos.
- **Comunidades:** canais, permissões, confirmação de exclusão sempre visível, reuniões de áudio/vídeo, chat mobile e carregamento inteligente de mídias privadas em memória.
- **E-mail:** OAuth Gmail e IMAP/SMTP manual, pastas entrada/enviados/spam/lixeira, leitura/resposta/movimentação, visualizador HTML isolado com links externos nativos e skeleton até a montagem do layout/imagens (com limite para serviços remotos travados).
- **PWA/notificações:** categorias configuráveis de push para atividade, comunidades, DMs e e-mail; badge nativo de não lidos onde suportado e service worker seguro.
- **Código consolidado:** transporte JSON reutilizável em `apps/web/src/lib/apiClient.ts`, sem alterar erros existentes; validação estrita da origem de escrita compartilhada em `apps/api/src/request-origin.ts`. **Sem mudanças nas rotas, autenticação ou schema nesta consolidação.**
- **Governança:** workflow `Version policy` exige versão SemVer superior e changelogs PT/EN nos próximos PRs; `Publish tagged beta releases` cria tags/Releases imutáveis `v...` na `main` (dependente das permissões do GitHub).

### Evolução de produto de 02–03/11 incluída neste beta

As mudanças abaixo precederam o marco formal de 06/11 e integram esta versão.

### Produto e comunidades
- Removido o **Explorar comunidades** interno da aba Comunidades (ícone bússola, pesquisa e lista pública). A área agora mostra apenas comunidades participadas, convites pendentes e criação; a descoberta de novas comunidades fica exclusivamente na aba **Descobrir**.
- Links de convite para canais enviados nos chats e prévias abrem a comunidade e o canal por **navegação interna**, sem nova aba ou recarregamento. Convites por token usam o fluxo existente de entrada no próprio app; tocar no push do convite direto também abre o canal.
- O seletor **Convidar para o canal** agora mostra exclusivamente outros participantes da comunidade atual, excluindo contas bloqueadas e respeitando a privacidade de nomes/fotos; o convite usa link direto sem gerar convite geral da comunidade.
- Migração `0034_channel_names_per_kind` aplicada no Neon de produção (3 nov. 2026), com verificação do novo índice exclusivo por comunidade, tipo e nome; backups existentes preservados, mas limite do Neon impediu criar um novo snapshot/branch.
- Push de convite apenas ao destinatário: mensagens privadas de convite usam o push normal do chat com texto específico, e convites de entrada na comunidade notificam somente a pessoa convidada.
- Cabeçalho dos canais com **Convidar**: lista contatos/amigos e envia DM com link direto para texto, voz ou reunião; convites válidos da comunidade são aproveitados quando disponíveis, mantendo senha e permissão de canal.
- **Descobrir** agora resume atividade com autor e tipo: GIF, foto, vídeo, áudio, arquivo, link, emoji, mensagem ou reação, sem mostrar URL de GIF nem nomes de arquivos.
- Canais de tipos diferentes podem usar **o mesmo nome**; nomes continuam únicos dentro da mesma comunidade e tipo. Migração versionada `0034_channel_names_per_kind` e índice de recência para reações, já aplicados ao banco de produção.
- Lista de conversas privadas agora tem divisórias **sutis e recuadas** entre os itens, sem afetar a separação entre áudio/vídeo e chat nas salas.
- Notificações agora têm botão **X** para exclusão individual e persistente, com atualização imediata da lista e do badge; a exclusão não cancela pedidos de amizade/entrada. Em salas de voz e reuniões, uma divisória explícita separa áudio/vídeo do chat quando ambos estão abertos (vertical no desktop, horizontal no celular); retiradas as divisórias indevidas entre conversas privadas.
- Notificações de solicitações de entrada em comunidade/reunião agora identificam a comunidade (e a reunião, se aplicável) no app e no push. Na moderação, avatar, nome e @usuário formam uma área clicável para abrir o perfil público; esse perfil aparece acima do dialog. Nomes da lista principal de participantes das comunidades permanecem texto simples, com links apenas nos canais e na moderação.
- Divisórias de conversas no desktop reforçadas com separadores contínuos de contraste visível entre as linhas.
- **Comunidades** agora é a entrada principal e primeira aba da navegação; logo volta a Comunidades e onboarding apresenta essa área primeiro. O app retoma a última comunidade acessada apenas se a conta continuar participando; quem ainda não participa encontra convite para explorar.
- Nomes de participantes e autores nas comunidades (mensagens, voz e moderação) abrem o perfil público; o mini-player flutuante de reunião mostra a própria câmera e a câmera/avatar de quem está falando, com destaque de atividade.
- Lista de conversas com divisórias discretas no desktop; controles e botões do compositor alinhados em 48 px nas salas de voz e reuniões no layout desktop, preservando tamanhos compactos no celular.
- Menu principal lateral do desktop com fonte e ícones ligeiramente maiores, além de mais altura nos itens; lista de conversas no celular com retorno visual de toque (pressão e destaque) ao abrir chats.
- Moderação da comunidade organizada em abas no dialog: **Membros** (inclui acesso aos canais fechados), **Banimentos**, **Canais**, **Configurações** e **Exclusão** (exclusiva ao proprietário), com navegação adaptada ao celular.
- A moderação da comunidade agora abre em **dialog responsivo**: tela completa no celular e janela centralizada no desktop, com foco controlado, rolagem interna e fechamento sem interromper ações pendentes.
- O feed global e o modo de vídeos antigo deram lugar a **Descobrir**, com recomendações, busca e atividades autorizadas; aposentadoria e snapshots de recuperação foram documentados.
- Reuniões com áudio/vídeo, links ou convites via mensagem individual, controle de entrada, compartilhamento de tela, destaque de quem fala e tela cheia com câmera própria em miniatura.
- O painel de texto das salas de voz e reuniões inicia **recolhido**, com expansão sem desconectar.
- Aprovação de solicitação de comunidade envia evento SSE direcionado ao solicitante e atualiza a participação sem recarregar a página.
- Proprietário/admins editam nome, senha e acesso **aberto/fechado** pelo cabeçalho de canais de texto/voz/reunião; exclusão continua na moderação.
- **Permissões individuais de canais fechados** em Moderação → Membros; API filtra mensagens, Descobrir, notificações, mídia, presença e WebRTC. Revogação encerra a chamada. Migração `0033_restricted_channel_members` versionada; aplicar e verificar no banco de destino antes de liberar o recurso.

### Manutenção
- Auditoria de traduções: excluídas 38 chaves sem uso de feed/demonstrações; texto do cadastro e tradução inglesa atualizados para Descobrir.
- Termos e Privacidade revisados em PT/EN para a experiência atual; aceite de **novos cadastros** usa versão `2026-11-03`, sem alterar registros de usuários anteriores. Política de Cookies permanece `2026-11-01`. Reaceite de contas antigas não foi imposto.
- Retirados controles de compartilhamento de posts do feed já desativado; links antigos recebidos em DMs exibem aviso em vez de navegação quebrada.
- Removidos dois componentes shadcn sem importações (Sheet/Tabs). Mantidos históricos de migração e mídias de recuperação.
- Revisada a documentação bilíngue, com [auditoria de código de 03/11](docs/pt-BR/auditoria-manutencao.md).

**Pendências:** testes reais de reunião e apresentação entre aparelhos, PWA iOS/Android, push/e-mail de ponta a ponta e confirmação independente do deploy em produção.

### Escopo inicial (registros históricos do preview)

**Primeiro beta técnico para testes controlados.** Este documento descreve código implementado e testes automatizados, **não** uma certificação em todos os navegadores e dispositivos.

### Incluído

- Nova rede social open source em React/TypeScript, com interface inspirada no UIKit, temas claro e escuro e selo Beta consistente junto ao logo no header.
- Autenticação Better Auth com e-mail/senha, perfis, privacidade e bloqueios; cadastro público com proteção Turnstile e integração de e-mail.
- Mensageiro individual 1:1 com persistência, anexos, respostas, reações, estados de mensagens, atualizações SSE e suporte a Web Push.
- Descoberta de comunidades em substituição ao feed global removido; rotas e tabelas legadas foram desativadas durante a evolução do beta.
- Comunidades com convites, cargos, canais de texto, moderação e salas WebRTC, incluindo chamada minimizável.
- Frontend Cloudflare Worker/R2; API Fastify no Render; PostgreSQL Neon; testes automáticos de interface, API e integração.
- Preparação para migração de domínio, lista de origens autorizadas e substituição do service worker em PWAs instalados.

### Pendências e limitações

- Validar **com uma conta real** envio/recebimento de e-mail, confirmação e recuperação de senha.
- A substituição do PWA, notificações e ícone **não está garantida** para todos os aparelhos, especialmente iPhone.
- Voz entre redes diferentes pode precisar de TURN; iOS limita execução e microfone em segundo plano.
- Em 01/11/2026, a Cloudflare confirmou `uorqui.app` habilitado no Worker `main` em produção. Ainda faltam conferir caches dos PWAs instalados, particularidades de dispositivos e fluxos de recuperação.
- Não há migração automática das contas, mensagens, push ou dados do Uorqui Chat empresarial.
- Antes de ampliar o beta: monitoramento, backups e restauração, testes de acessibilidade/segurança, operação de moderação e custos.

### Deploy e reversão

Siga o [procedimento de migração do domínio](docs/pt-BR/migracao-dominio-uorqui-app.md). A versão exige build e testes GitHub Actions. Não reutilizar credenciais ou dados do mensageiro empresarial legado.

> Alterar a versão e criar estas notas **não publica automaticamente** uma tag nem uma GitHub Release. A prerelease pode ser publicada depois de selecionar um commit validado.
