# Uorqui UI Kit · Design System v0.1.0-beta.11

> **Contrato visual do beta de 06/11/2026.** Este UI Kit é documentação no GitHub; não existe uma rota de demonstração ou segundo frontend. O produto usa os componentes reais em `apps/web/src`.

- **Nomes de pessoas (beta.39):** fora das telas de perfil, usar `compactUserName` de `apps/web/src/userDisplayName.ts` para exibir somente o **primeiro + último nome** do nome salvo. O nome completo permanece nos perfis e na edição; `@usuário`, dados da API e conteúdo pesquisável não são alterados. Aplicar em mensagens, canais/respostas/menções, contatos, notificações, menus, moderação, reuniões e descrições acessíveis. Nomes de remetentes e autores do Web Push usam a regra equivalente em `apps/api/src/push-routes.ts`. Nomes com uma palavra permanecem como estão.
- **Link e cronômetro da reunião (beta.34):** o botão **Link da reunião** em `CommunityVoiceRoom` abre um diálogo próprio que exibe endereço reutilizável, separado do convite de canal. Não confundir navegação com autorização: a sala só abre para membros com acesso verificado, senha e aprovação quando exigidas. Um cronômetro regressivo comum aparece no cabeçalho e na janela flutuante (`60:00` ao iniciar), alerta nos últimos 5 minutos e desconecta ao zerar. O prazo vem do servidor e não reinicia ao minimizar, voltar do PWA ou entrar tardiamente.
- **Navegação e canais fechados (beta.33):** o primeiro canal de texto renderizado no desktop ancora automaticamente nas mensagens mais recentes sem clique. No modal de convite de canais fechados, somente dono/admin/moderador autorizado vê a ação; o link exclusivo de 24 horas e uso único permite autorização automática somente após o aceite explícito, com opção de revogar. Convites diretos por @usuário geram tokens vinculados à conta. Senhas e aprovação de reunião continuam obrigatórias quando configuradas.
- **Conexão com API (beta.31):** o estado inicial de autenticação separa indisponibilidade e bloqueio HTTP 429, informa o limite temporário e evita uma tela de carregamento permanente. O cliente consulta status público, prontidão e sessão sequencialmente; respeita espera de segurança. O Worker só faz cache curto dos endpoints públicos, sem armazenar respostas de usuário.
- **Anexos e avisos (beta.30):** o sino usa `UIKitCount` com contador unificado de não lidos. O `LiveMessageComposer` compartilha processamento de fotos de galeria/câmera/coladas via `imageCompression.ts`, com progresso e cancelamento; **Arquivo**, PNGs e GIFs preservam os dados originais. Mensagens otimistas de canal usam o avatar, nome e @ reais do autor antes da confirmação do servidor. Na tela Notificações, avisos de e-mail aparecem somente se ainda não foram lidos, sincronizados com as ações da caixa de entrada e verificações recentes do provedor.
- **Data e hora das mensagens (beta.29):** mensagens do dia atual exibem apenas a hora; de dias anteriores, `dd/MM HH:mm`; de outro ano, incluir também o ano. Usar `formatMessageTimestamp` e `useLocalDayKey` (um timer na meia-noite por lista) nos balões privados, resumos/recibos de leitura e mensagens de canais. Atualizar na virada do calendário local ou ao voltar ao PWA em segundo plano. Não comparar datas UTC nem mostrar a data em mensagens de hoje.
- **Separação entre header e menu mobile (beta.28):** seguir exatamente o tema escuro: cabeçalho (`[data-uorqui-main-header]`) usa a superfície `--kit-panel` (branco no claro, `#0a0a0a` no escuro); menu lateral aberto (`#uorqui-mobile-nav`) usa `--kit-sidebar` (cinza `#ededed` no claro). A beta.28 reverte a pintura indevida do header da beta.27. O cabeçalho desktop, lista de canais e leitura permanecem inalterados.
- **Fundo claro completo (beta.26):** todo o canvas externo da aplicação logada (`--background`), menu desktop/mobile (`--kit-sidebar`) e trilho externo (`--workspace-rail`) usam o mesmo cinza `#ededed`, inclusive as margens do painel e o espaço que aparece ao recolher o menu. Painéis de leitura e lista de canais continuam `--kit-panel: #ffffff`, com contraste. Tema escuro inalterado; não aplicar a cor na paleta global das páginas públicas.
- **Contraste do menu principal claro (beta.25):** menu desktop e menu lateral mobile usam `--kit-sidebar` (`#ededed` no tema claro, `#181818` no escuro), contrastando com o painel `--kit-panel` (`#ffffff` no claro). A beta.26 também unifica o fundo externo; estados de seleção e hover são mantidos.
- **Fundo da lista de canais (beta.23/24):** a coluna de canais de texto, voz, reunião, Novo canal e Moderação usa a superfície `--kit-panel` (escuro `#0a0a0a`, claro `#ffffff`) do painel de trabalho, em todas as telas e **com o menu desktop expandido ou recolhido**. A beta.24 removeu uma regra `--background` mais específica em `styles.css` que anulava o ajuste anterior. O menu principal continua em `--kit-sidebar`. A única regra de cor é a do UI Kit em `[data-uorqui-channel-nav]`; sem paleta individual no React ou CSS global.
- **Chats dos canais:** respostas com mensagem original, `@usuário` com sugestões, GIFs e lista de reagentes por emoji; não mostrar membros sem permissão.
- **Privacidade:** cartão de exclusão definitiva no Perfil com duas confirmações (senha e `EXCLUIR`), estados de erro e aviso de mídia em limpeza posterior.
- **Convites:** confirmação de ingresso somente depois da autenticação, sem bloquear a tela de cadastro. O modal, os erros, os botões e rótulos acessíveis seguem o idioma ativo (inicialmente o do navegador, respeitando a escolha salva), sem frases bilíngues separadas por barra.

## Princípios

- **Seta nas respostas dos canais (beta.9):** a seta de retorno precede **Sandra: belezinha** em uma única linha compacta. Trechos longos recebem reticências, com acesso à mensagem original pelo clique; a prévia no editor também ocupa só uma linha. A ordem é autor → citação → resposta, com clique na mensagem original. Toda mensagem exibe foto, nome, username e horário, inclusive nas sequências do mesmo autor.
- **Respostas unificadas (beta.10):** conversas privadas e canais compartilham a seta de retorno, referência compacta **autor: trecho** em uma linha e clique para localizar a original, além da prévia de uma linha no editor e botão de cancelar. Textos longos mostram reticências. Citações antigas embutidas em texto não permitem clicar porque não possuem ID de origem.
- **Largura do balão privado (beta.10):** reservar sempre os 36 px do botão `…` e 6 px de espaçamento, inclusive durante o envio otimista, evitando rolagem horizontal e mudança de largura após concluir o envio. Textos, anexos e respostas respeitam essa área.
- **GIFs nas mensagens (beta.11):** exibir a animação no chat privado sem carregar um segundo cartão de prévia de link ou consultar seus metadados. Links comuns continuam com prévia.


- **Central de notificações:** abas compactas e roláveis **Todas, Mensagens, Menções, E-mail, Convites e Contatos**; contadores por categoria, estados vazios específicos e atalhos internos. Push nativo e histórico são conceitos independentes. O toque em push com app aberto navega diretamente no React; com PWA fechado/oculto, usa link persistente. O badge de e-mail segue o total da Caixa de entrada do provedor e evita respostas atrasadas após leituras.
- **Rolagem nos canais (beta.22):** ao entrar em um canal de texto ou expandir o chat de voz/reunião, mostrar a última mensagem, inclusive com cache e mídias que aumentam de tamanho. Eventos de rolagem causados pelo layout não interrompem a fixação inicial. Ao subir manualmente ou abrir uma resposta, preservar o histórico; ao voltar ao final, retomar o acompanhamento. A posição inicial é individual por canal.
- **Instância ativa única (beta.18–21):** uma aba desktop e uma janela mobile/PWA por conta. Ao disputar a mesma vaga, aparece uma tela centralizada com o tema global, sem montar o aplicativo; botões **Usar nesta aba** para assumir, **Tentar novamente** quando houver erro e **Sair da conta**. Textos respeitam PT/EN, e transferir o controle não desloga nem bloqueia a outra categoria. Na abertura autenticada (ou ao assumir o controle), a checagem fica por trás do carregamento original; só conflito e falha mostram o bloqueio. A identidade do navegador/PWA persiste por conta/categoria ao reabrir ou recarregar; Web Locks impedem que outra aba aberta a compartilhe. Ao atualizar a mesma aba, o carregamento inicial cobre a curta espera pela liberação do bloqueio antigo.


- **Convites de permissão no desktop:** oferecer push somente quando a permissão do navegador estiver pendente (`default`), nunca se estiver concedida ou negada, mesmo se a inscrição não sincronizar. O convite opcional para instalar PWA é independente; não sobrepor avisos nem abrir a permissão nativa sem clique. No mobile, manter as regras próprias de instalação.


- O modal de e-mail reúne Gmail OAuth, Outlook OAuth e IMAP/SMTP manual, com rolagem independente. A disponibilidade do botão Outlook depende das credenciais Microsoft Entra no Render; isso não bloqueia os outros provedores.

- Interface compacta, orientada a comunicação, com referências de organização visual a painéis de trabalho; **não** restringir o Uorqui ao público empresarial.
- Navegação principal: **Descobrir · Mensagens · Comunidades · E-mail**; contatos são acessados **dentro de Mensagens**, não por um item independente do menu.
- Trilho de comunidades e barra lateral no desktop; **Descobrir** usa ícone de bússola no lugar da lupa. O cabeçalho dos canais tem **Convidar** e, para proprietários/administradores, **Editar**, que abre o canal em **Moderação → Canais**. Descrições fixas apresentam **Ler mais / Mostrar menos** e permanecem editáveis na moderação. Somente a área de conteúdo deve rolar.
- Dark e Light têm a mesma estrutura e ações. Todos os controles de toque e diálogos devem respeitar viewport, área segura do iOS, teclado, Escape e acessibilidade.
- PT-BR e inglês coexistem; linguagem humana, ícones Lucide, sem misturar bibliotecas ou criar CSS avulso para cada página.

## Hierarquia dos temas — fonte de verdade

1. `apps/web/src/styles.css`: tokens semânticos **globais**, resets, movimentos e superfícies reutilizáveis. Existe **um único par** `:root` e `:root.light`, sem paletas globais repetidas.
2. `apps/web/src/ui-kit/sprintrix.css`: personalização **intencional do workspace logado** em `[data-uorqui-ui-kit="sprintrix-v1"]`, conservando os mesmos nomes de tokens para páginas e componentes. É esta a paleta efetiva do app logado.
3. `apps/web/src/components/ui/` e `ui-kit/components.tsx`: botões, campos, menus, skeletons, contagens e estrutura visual reutilizável.
4. Componentes de módulos consomem `bg-card`, `bg-background`, `text-foreground`, `border-border` e demais tokens, **sem definir paletas próprias**.

O padrão de instalação nova é **Dark**, como implementado em `UorquiPreferences.tsx`; uma escolha existente de tema é respeitada pela chave `uorqui:theme`. O tema muda sem recarregar. O guia contextual do onboarding mede o conteúdo, escolhe espaço acima/abaixo do destaque na navegação mobile e permite rolagem interna em telas baixas. As superfícies de **Contatos, Mensagens e E-mail** compartilham `data-uorqui-workspace-surface`. O documento HTML recebido por e-mail permanece isolado e pode ter cores próprias do remetente, sem alterar a paleta do aplicativo.

### Paleta real do workspace logado

| Token | Dark | Light | Uso |
| --- | --- | --- | --- |
| `--background` | `#181818` | `#fafafa` | Tela e navegação |
| `--foreground` | `#fafafa` | `#171717` | Texto principal |
| `--card` | `#0a0a0a` | `#ffffff` | Conteúdo e painéis |
| `--popover` | `#111111` | `#ffffff` | Menus e overlays |
| `--primary` | `#e5e5e5` | `#171717` | Seleção e ação principal |
| `--secondary` | `#171717` | `#f5f5f5` | Áreas secundárias |
| `--muted` | `#171717` | `#f7f7f7` | Estado neutro |
| `--muted-foreground` | `#a3a3a3` | `#777777` | Metadados |
| `--accent` | `#242424` | `#f1f1f1` | Hover |
| `--border` | `rgba(255,255,255,.10)` | `#e5e5e5` | Divisórias |
| `--input` | `rgba(255,255,255,.16)` | `#d4d4d4` | Campos |
| `--ring` | `#b6b6b6` | `#7c7c7c` | Foco de teclado |
| `--destructive` | `#fa646e` | `#d7384c` | Ações destrutivas; token global |
| `--workspace-rail` | `#181818` | `#fafafa` | Trilho lateral |

**Não copiar esses valores hexadecimais para os componentes.** Usar o token. Canais e conversas privadas usam os mesmos componentes globais `uorqui-reply-reference` e `uorqui-reply-draft`; a largura reservada para o botão do chat privado usa `uorqui-dm-message-content`. Todos utilizam tokens globais para contraste claro/escuro. Cantos seguem a escala compartilhada.

## Componentes e comportamentos obrigatórios

| Componente / módulo | Contrato |
| --- | --- |
| `SocialShell`, `UIKitSectionHeading` | Navegação e cabeçalhos responsivos; uma só fonte de verdade para área ativa |
| `LiveDirectChat`, `DirectMessageBubble` | Conversas persistidas, SSE, estados entregue/lido, hora de leitura, respostas otimistas e fixadas, ações e menus sem ultrapassar a tela |
| `LiveMessageComposer` | **+ anexos · Galeria com fotos/vídeos · texto expansível · emoji · microfone/enviar**; bloqueio de suspensão opcional durante gravação e compactação local de vídeo com progresso, cancelamento, tamanhos antes/depois e limite final de 50 MB; não fechar teclado desnecessariamente |
| `ConversationAttachmentsPanel`, `ChatMediaViewer`, `ChatAudioPlayer` | Histórico paginado de fotos/vídeos/áudios/arquivos; zoom, download, prévia responsiva |
| `LiveCommunities`, `CommunityVoiceRoom` | Canais de texto, áudio e reunião; SSE, participantes, moderação, convites e texto associado às salas |
| `CommunityModerationPanel` | Confirmação de exclusão visível, no próprio canal e fora da rolagem principal |
| `EmailInbox` | Gmail OAuth e IMAP/SMTP manual, pastas, leitura/ação; HTML isolado, links externos no navegador, skeleton até montagem/ajuste das imagens |
| `WorkspaceContentLoading` | Skeleton para dados ainda não prontos, sem piscadas ou deslocamento abrupto |

Mensagens de **texto** são otimistas sem spinner individual; progresso de envio visível é reservado principalmente às **mídias**. A rolagem horizontal não aparece durante o carregamento de anexos. O cache de mídia é privado, limitado à memória, reutilizado ao voltar ao canal, invalidado após remoção/perda de acesso e limpo no logout. A tela de e-mail é separada do HTML externo, que não pode executar scripts ou formulários.

## Arquitetura e organização do código

- Cliente HTTP reutilizável: `apps/web/src/lib/apiClient.ts`. Mantém os códigos de erro de Mensagens e Comunidades existentes; nenhuma chamada usa um cache indiscriminado.
- Estado e tempo real ficam por domínio: `dmCache.ts`, `dmEventStream.ts`, `communityMessageCache.ts`, `chatMediaCache.ts`. Não duplicar SSE ou cache num novo componente.
- API Node/Fastify em `apps/api/src`: autorização no servidor, migrações Drizzle, mensagens e mídias privadas. A validação exata de origem para rotas de escrita é compartilhada em `request-origin.ts`.
- UI Kit não é uma implementação alternativa. O código React publicado é a única interface a manter.

## Marca, tradução e qualidade

O `UorquiWordmark` usa o lettering pixelado **uorqui.** de 43 × 7 módulos e ponto verde-menta `#69d2aa`; os ícones PWA e favicon seguem os arquivos públicos existentes. Não introduzir fontes externas para desenhar a marca. O aplicativo suporta PT/EN via `UorquiPreferences`, preserva textos escritos pelos usuários e respeita o atributo `lang`.

Antes de mesclar: validar **mobile/desktop × Dark/Light × PT/EN**, navegação por teclado, loading, conteúdo extenso, acesso protegido, reprodução de mídias e telas do PWA instalado. O badge nativo do ícone depende do suporte da plataforma.

## Versão e manutenção

Este documento corresponde ao marco **`v0.1.0-beta.9`**. A partir deste marco, **todo PR, inclusive só de CSS ou documentação, deve aumentar a versão SemVer dos três manifestos**, atualizar os changelogs PT/EN e passar na verificação automática `Version policy`. As releases são publicadas com tags imutáveis `v...`; ver [política de versões](versoes.md), [notas](../../CHANGELOG.pt-BR.md) e [contribuição](../../CONTRIBUTING.pt-BR.md).
