# Requisitos do produto — versão inicial

[Português](produto.md) · [English](../en/product.md)

**Status:** planejamento. Este documento descreve requisitos, não funcionalidades já implementadas.

## Navegação

Áreas principais: **Feed**, **Conversas**, **Comunidades** e **Perfil**. Busca, notificações e configurações são globais. Versões mobile e desktop usam os mesmos conceitos, com layouts adaptados.

## 1. Mensageiro individual

- Exatamente dois participantes por conversa privada; **sem grupos tradicionais**.
- Recursos iniciais: texto, anexos com limites, respostas, reações, estados de entrega/leitura, notificações e histórico.
- Segurança: bloqueio, denúncia, solicitação de conversa, limites por usuário e permissões verificadas no servidor.
- Diferenciar enviado, entregue, lido e falhou; não prometer criptografia ponta a ponta sem implementação e revisão.

## 2. Feed híbrido

- **Rolagem vertical contínua** de publicações com alturas variáveis: texto, fotos, carrosséis e vídeos verticais/horizontais.
- Publicações públicas podem levar às comunidades públicas relacionadas; conteúdo restrito permanece restrito.
- Vídeos podem iniciar automaticamente **sem som** quando visíveis, somente um ativo por vez; pré-carregamento econômico.
- Preservar a posição do feed ao abrir publicação, perfil ou vídeo imersivo e retornar.
- Descoberta inicial: filtros **Para você** e **Seguindo**; classificação compreensível e simples antes de IA complexa.

## 3. Modo imersivo Vídeos

- Acesso **direto** por atalho/filtro do feed e **ao abrir um vídeo elegível**.
- A abertura a partir do feed começa pelo **vídeo selecionado**.
- Experiência em tela cheia, **exclusivamente de vídeos**, com navegação vertical de um vídeo por vez; só termina quando o usuário sair.
- Controles de compartilhamento, comentários, reações, perfil e comunidade autorizada.
- Ao sair, restaurar a posição original do feed; acesso direto tem retorno coerente próprio.
- **Vídeos é nome provisório. Não adotar “Reels” como nome oficial.**

## 4. Comunidades

- Pública/aberta, pública com aprovação ou privada por convite.
- Diversos **canais de texto** e **salas de voz**, cargos, permissões, convites, moderação e denúncias.
- Voz poderá continuar ao navegar conforme limitações de sistema/navegador. Outras mídias devem iniciar silenciadas durante a sessão.
- Usuários sem autorização nunca acessam canais, mídias, notificações nem resultados privados na busca.

## 5. Integração

Uma pessoa encontra uma publicação pública, conhece o autor/comunidade, entra num canal ou sala autorizada e depois pode conversar individualmente. Conteúdos podem ser compartilhados em conversas privadas ou canais permitidos.

## Aceite de segurança e qualidade

Sem vazamento de conteúdo privado; mensagens não podem desaparecer silenciosamente; limites claros de upload; reconexão testada no celular; bloqueio e denúncia; acessibilidade; monitoramento de custos de voz/vídeo.

## Fora do MVP inicial

Grupos tradicionais, lives em grande escala, pagamentos para criadores, marketplace, personalização prioritariamente por IA, federação completa, chamadas de vídeo 1:1 e mídia/voz gratuitas ilimitadas.

## Comunidades reais — etapa inicial

- O Uorqui permite criar comunidades **públicas** (entrada imediata), **por aprovação** (solicitação aceita por owner/admin) e **privadas** (visíveis apenas a membros e convidados). A criação registra automaticamente o proprietário, um canal de texto `#geral` e uma sala de voz `Sala de voz`.
- A lista de comunidades exibe espaços descobríveis e a participação da conta; espaços privados não aparecem para terceiros. Os administradores podem convidar por @usuário, aprovar solicitações de comunidades moderadas e criar até 50 canais de texto/voz.
- Mensagens de texto são persistidas no PostgreSQL, com autor, data, identificador idempotente e limite de 4.000 caracteres. Somente membros podem ler/escrever; atualização da conversa a cada cinco segundos enquanto o canal estiver ativo.
- Salas de voz usam **WebRTC P2P mesh** para até **6 participantes**. O usuário entra com permissão do microfone, controla mute e saída, vê presenças e estados de conexão. Somente sinais SDP/ICE e estados temporários chegam ao PostgreSQL; o app não grava áudio. Salas com NAT/firewall restritivo precisam de credenciais TURN (configuração descrita abaixo). Conexões de voz devem ser testadas manualmente em dois navegadores/redes reais.
- A sinalização utiliza polling autenticado a cada ~1,3 s e heartbeat a cada ~12 s, com expiração de sessões após 45 s sem atualização e sinais após 3 minutos. Saída voluntária revoga a sessão. A API verifica membro+canal em cada operação. Usuários que se bloquearam não veem presença/avatares mútuos nessa sala nem recebem sinalização SDP/ICE um do outro; eventos que já estavam enfileirados também são filtrados após o bloqueio. Anexos e ferramentas avançadas de denúncias permanecem para os próximos incrementos.
- Entrada, convites, solicitações e canais possuem autorizações aplicadas na API, sem depender de botões ocultos. Fotos/nomes de perfis privados e fotos bloqueadas nos canais respeitam as autorizações atuais.
- Migração Drizzle `0011_live_communities` acrescenta `communities.description`, `community_channels`, `community_messages` e `community_join_requests`, preservando as tabelas base `communities` e `community_members`.

## Moderação de comunidades (cargos, banimentos e canais)

- Hierarquia de acesso: **proprietário** > **administrador** > **moderador** > **membro**. Proprietários podem promover admins/moderadores; admins podem promover moderadores; moderadores não alteram cargos. Nenhum usuário pode remover, banir ou alterar cargo de alguém com cargo igual/superior. O proprietário nunca é alvo dessas ações.
- **Remover** retira a pessoa da comunidade; **Banir** grava uma proibição persistente que impede a entrada pública, convites e aprovações, remove a participação e encerra suas sessões de voz. Apenas proprietário ou administrador pode desbanir; desbanir não restabelece a participação.
- Proprietários/admins podem renomear canais e excluí-los, mantendo **pelo menos um canal de texto** por comunidade. Excluir um canal remove as mensagens daquele canal; por isso a interface exige confirmação.
- O autor pode editar e cancelar suas mensagens; proprietários, administradores e moderadores podem cancelar mensagens de outros membros. Mensagens canceladas retornam como marcação sem conteúdo, preservando a referência e o registro original no banco. Operações são validadas na API.
- Painel **Moderação** aparece apenas para equipes autorizadas, com membros, cargos, bans e gerenciamento de canais; está traduzido em PT/EN e usa os componentes do UI Kit. Banimentos em `community_bans` e edição/cancelamento em `community_messages.edited_at/deleted_at/deleted_by_id`, migração Drizzle `0013_community_moderation`.

## Experiência de presença da sala de voz

O cartão de um participante mostra uma borda verde pulsante apenas quando um analisador Web Audio detecta atividade na trilha WebRTC recebida ou enviada. O estado visual de mute e deafen é derivado da própria sessão e sincronizado entre os participantes (migração `0014_voice_deafen_status`). Efeitos discretos de entrada e saída são gerados localmente, sem arquivos e sem gravação. Indicadores também aparecem na lista lateral de canais. O áudio da chamada continua pelo WebRTC, sem novas gravações ou armazenamento de voz.

## Reações nos canais de texto

- Mensagens ativas podem receber reações por emoji de outros participantes da comunidade. O autor não pode reagir à própria mensagem, conforme a regra atual de conversa do Uorqui.
- Cada pessoa pode marcar **uma vez por emoji** em uma mensagem, mas pode escolher emojis diferentes. Os chips mostram emoji e total; a própria escolha aparece destacada. Clicar novamente na reação remove a escolha pessoal; o controle `+` abre o seletor compacto de emojis.
- A API inclui `reactions: [{emoji,count,mine}]` e `canReact` na listagem de mensagens, sincronizada pela atualização periódica do canal. Endpoints: `PUT` e `DELETE /api/v1/communities/:id/channels/:channelId/messages/:messageId/reactions`, com corpo `{emoji}`, sessão obrigatória, verificação da origem e controle de acesso.
- Reações não são mensagens separadas; mensagens canceladas não exibem contagens nem podem receber novas reações.
- A migração aditiva **`0017_community_message_reactions`** cria a tabela `community_message_reactions`. Deve ser aplicada ao PostgreSQL da Neon antes de habilitar reações em produção. Até a migração, o histórico de mensagens continua legível e a operação de reação responde como indisponível.

## Campo de mensagens unificado nos canais de texto

- Os canais de texto usam o mesmo `LiveMessageComposer` do mensageiro direto: galeria, câmera, arquivos, localização do Google Maps, edição de imagem, gravação de áudio com pausa/retomada e seleção de emojis.
- O seletor de **GIFs permanece**, usando o catálogo existente da comunidade integrado ao mesmo campo.
- Mensagens do canal continuam sem indicadores individuais de **enviado, entregue ou lido**; somente o progresso temporário de envio/upload e opção de reenviar quando falhar.
- Arquivos (máximo 50 MB, formatos permitidos) e áudio são validados no Worker e armazenados em uma área `community/<communityId>/<channelId>` do bucket R2 privado, reutilizando a infraestrutura assinada de uploads do chat, mas com autorização específica por comunidade/canal.
- O acesso à mídia exige participação ativa na comunidade e mensagem não cancelada. A API verifica uploads e downloads individualmente, e os uploads só são aceitos com assinatura HMAC produzida pelo Worker.
- A migração Drizzle `0018_community_message_attachments` adiciona campos de anexo às mensagens comunitárias e permite corpo vazio quando houver anexo. Deve estar aplicada na Neon antes de habilitar uploads em produção; as mensagens de texto existentes são preservadas.

### Implementação inicial do feed (persistente)

- A aba Início agora renderiza a linha do tempo real por paginação baseada em cursor: **Para você** mostra publicações autorizadas (públicas, de amigos e próprias); **Seguindo** mostra publicações de contas seguidas explicitamente e próprias; seguir é independente de amizade.
- Criar publicações de texto, até **6 imagens** em carrossel ou **1 vídeo** (limite de 50 MB por mídia), curtir/descurtir, comentar, editar e apagar a própria publicação; perfis privados exigem amizade e bloqueios entre contas ocultam o conteúdo.
- Uploads passam pelo Worker, que verifica o arquivo e a propriedade do rascunho, armazena no bucket R2 privado e assina os metadados antes da vinculação via API. Publicação com anexos só fica visível quando a quantidade esperada foi confirmada; falhas podem ser retomadas por slot, com edição da legenda e descarte explícito do rascunho.
- O **Modo Vídeos** é separado, em tela cheia, abre no vídeo tocado, avança por gesto vertical/teclas e preserva a posição do feed até o retorno. O feed pode reproduzir vídeos visíveis silenciados.
- Compartilhamento por `/?post=<id>`, modo imagem ampliada e zoom. Imagens privadas usam cache temporário e limitado à aba, apagado ao sair da conta. Compartilhamento de conteúdos privados continua sujeito à autorização da API.
- Migração `0019_hybrid_feed` cria `feed_posts`, `feed_media`, `feed_likes` e `feed_comments`. A produção precisa dessa migração antes de habilitar os endpoints; o código trata a ausência como `FEED_NOT_READY`.
- A migração `0020_feed_follows` cria relações de seguir unidirecionais. Perfis privados só podem ser seguidos por amizades aceitas, sem revelar publicações a terceiros; bloqueios prevalecem sobre a relação de seguir. Botões Seguir/Seguindo permitem alternar em cada publicação.
- Próximas etapas: paginação dos comentários, algoritmos de descoberta, transcodificação de vídeos, denúncias, prévias, acessibilidade e limpeza periódica de mídias órfãs de uploads interrompidos.
