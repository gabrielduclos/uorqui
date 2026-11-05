# Uorqui UI Kit · Design System v0.1

> Somente documentação. O UI Kit **não** terá página ou rota dentro do aplicativo.

## Objetivo

Definir a linguagem visual compartilhada do Uorqui para **Descobrir, mensagens individuais e comunidades**. O sistema precisa funcionar no desktop e no celular, com temas semânticos, acessibilidade e português/inglês.

## Direção de UX — Descobrir

- Tela inicial sem feed global: seções **Acontecendo agora** (atividade autorizada em canais e salas de voz das comunidades do usuário), **Comunidades recomendadas** e **Busca**.
- Cartões de comunidade exibem nome, imagem, descrição/categoria, contagens verificadas e entrada/solicitação de participação.
- Atalhos de atividade abrem o contexto exato, sem conectar o microfone automaticamente ou marcar mensagens como lidas.
- Estados vazios úteis para novos usuários; nunca inventar membros, atividade ou conversas.
- Navegação principal: **Descobrir · Mensagens · Comunidades**; Perfil, notificações e ajustes continuam acessíveis.
- Descobrir está implementado, e o feed global do beta foi aposentado; a aceitação visual em dispositivos ainda está pendente. Ver [decisão](descobrir.md).

## Identidade da marca

- Identidade oficial: **uorqui.** em lettering pixelado de 43 × 7 módulos, reproduzindo o ícone original do PWA (não usar o logotipo arredondado das propostas descartadas).
- A marca em cabeçalhos, tela de entrada e tela de confirmação usa o componente vetorial `UorquiWordmark`, com píxeis brancos no tema escuro e cor de texto no tema claro.
- O ponto final verde-menta `#69d2aa` é parte da assinatura da marca; o fundo escuro é `#101827` a `#080e1b`, compatível com o UI Kit.
- O PWA mantém os ícones `/icon-192.png` e `/icon-512.png` já escolhidos. O favicon `/icon.svg` replica a tipografia pixelada em alta definição.
- Evitar fontes remotas para compor a marca; preservar o desenho nítido nos tamanhos pequenos.

## Temas

O **Dark é o tema inicial padrão**. O botão de sol/lua no cabeçalho alterna imediatamente entre Dark e Light. A escolha explícita fica no localStorage, chave uorqui:theme.

| Token | Dark | Light | Uso |
| --- | --- | --- | --- |
| --background | #080e1b | #f7f8fc | Fundo principal |
| --foreground | #f1f5ff | #111827 | Texto |
| --card | #101a2b | #ffffff | Cards e painéis |
| --popover | #121d30 | #ffffff | Menus e sobreposições |
| --primary | #6366f1 | #4f46e5 | Ações principais |
| --secondary | #1d2b43 | #e9edf6 | Ações secundárias |
| --muted | #172338 | #eef1f7 | Superfícies neutras |
| --accent | #243653 | #e4eaf8 | Hover e seleção |
| --border | #27344c | #d8deea | Bordas |
| --input | #35445d | #cbd5e1 | Campos |
| --ring | #818cf8 | #6366f1 | Foco do teclado |
| --destructive | #ef4444 | #dc2626 | Excluir e alertas |

Use classes Tailwind semânticas, não cores fixas que só funcionem no dark. Verifique contraste nos dois temas.

## Tipografia, dimensões e estilo

- Fonte Inter/system sans-serif. Corpo de 14–16px; títulos de seção 18–30px; destaques até 48px; metadados 11–12px.
- Espaçamento na escala Tailwind de 4px e controles de toque com aproximadamente 40–44px.
- Cards podem ter cantos arredondados; **os balões do mensageiro têm cantos suavemente arredondados**.
- As conversas e canais usam a largura disponível do desktop, sem coluna estreita centralizada.
- Menus e modais ficam dentro da tela, inclusive com teclado do celular aberto; suporte a Escape.

## Componentes

| Componente | Responsabilidade |
| --- | --- |
| Button, Input, Label | Botões e formulários acessíveis |
| Card, Badge, Separator, ScrollArea | Estrutura e superfícies |
| Avatar | Foto ou iniciais |
| PreferencesControls | Troca de idioma por bandeira e tema no cabeçalho |
| LiveMessageComposer | Texto expansível, anexos, emojis e notas de voz |
| DirectMessageBubble | Status, respostas, reações e menu de ações que respeita o viewport |
| ChatAudioPlayer, ChatMediaViewer | Player de áudio e visualização de fotos/vídeos |
| ChatImageEditor | Anotações e desenhos em fotos antes de enviar |
| LiveCommunities, CommunityVoiceRoom | Canais responsivos, voz/reunião, texto recolhível e tela compartilhada |

O mensageiro 1:1 **já está conectado** à API e ao Neon. Os canais de texto comunitários também usam API e Neon; as salas de voz integram WebRTC P2P para grupos pequenos, com autorização pelo backend; dependerão de TURN para redes restritivas. O layout do chat real deve manter paridade com este UI Kit; funções que dependem de novas APIs não podem fingir persistência.

## Idiomas

- Cabeçalho com **🇧🇷 PT** ou **🇺🇸 EN**, alternando sem recarregar.
- Preferência salva na chave uorqui:language. Navegadores em português começam em PT-BR; os demais em inglês.
- Traduzir menus, botões, placeholders, labels acessíveis, modais e erros. **Não traduzir automaticamente** mensagens escritas por usuários nem identificadores técnicos.
- Código compartilhado em UorquiPreferences.tsx, através de useUorquiPreferences e t.
- Atualizar o atributo lang do documento ao trocar o idioma.

## Código de referência

- apps/web/src/styles.css — tokens de tema
- apps/web/src/UorquiPreferences.tsx — estado de idioma e tema
- apps/web/src/PreferencesControls.tsx — controles no cabeçalho
- apps/web/src/components/ui/ — componentes reutilizáveis
- apps/web/src/LiveDirectChat.tsx, DirectMessageBubble.tsx, LiveMessageComposer.tsx — mensageiro real
- apps/web/src/LiveCommunities.tsx, CommunityVoiceRoom.tsx — comunidades e reuniões

A cada mudança, conferir dark/light × português/inglês × desktop/mobile, acessibilidade e documentação.

## Contrato obrigatório do chat real

- `LiveDirectChat` é responsável pela lista, cabeçalho fixo, rolagem, mensagens e recebimento de eventos. A área de mensagens usa a **largura disponível do desktop** e rolagem somente no painel.
- `DirectMessageBubble` usa **cantos suavemente arredondados** como identidade visual atual dos balões, cores semânticas, resposta por swipe e menu com ações dentro do viewport.
- `LiveMessageComposer` preserva a ordem **+ anexos | texto expansível | emoji | mic/enviar**, com menu de anexo horizontal e seletor de emojis à direita. Um único botão mostra microfone quando o campo está vazio e envio quando há texto.
- O texto enviado é persistido na API; cada novo balão aparece imediatamente com spinner sem bloquear o compositor e permite reenviar com o mesmo identificador se falhar. O horário de envio permanece junto ao texto de cada balão; os estados Enviando/Enviada/Recebida/Lida são exibidos uma única vez em uma linha neutra, centralizada, como mensagem do sistema ao final de cada bloco consecutivo de mensagens próprias, com horário da última atualização do estado. Um bloco só indica Lida ou Recebida quando todas as mensagens não excluídas atingiram esse estado. O spinner de envio e a ação de reenvio continuam no próprio balão. O campo de entrada possui borda e fundo semânticos de alto contraste em Light e Dark. O indicador visual “Ao vivo” não é exibido (a sincronização continua ativa). **Áudios e anexos** usam endpoints autenticados da API/Worker e armazenamento autorizado. **Responder** salva uma referência real à mensagem original, com prévia no balão, inclusive após edição ou exclusão da origem. **Editar, excluir para todos, encaminhar e reagir** estão ligados ao backend, com autorizações e persistência. Reações são atualizadas de modo otimista e revertidas em caso de erro. A lista de conversas aberta e visível confirma **Recebida** sem marcar **Lida**. Controles sem backend ficam desabilitados e identificados; não enviar conteúdo apenas na interface local.
- A lista de conversas **não pode confirmar leitura**. Apenas uma conversa aberta, com janela e painel visíveis, pode emitir confirmação.
- Abrir chat rola até a última mensagem; ler mensagens antigas não desloca a rolagem. Novas mensagens fora da área visível usam aviso e seta para o final.
- Verificar desktop/mobile, Light/Dark e PT/EN antes de publicar. Qualquer migração futura deve reutilizar estes componentes em vez de substituí-los por telas genéricas.

## Ajustes do chat real — cancelamento, reações e badge

- Os **balões de mensagem** mantêm cantos discretamente arredondados, acompanhando a identidade atual.
- A prévia de uma resposta é clicável: rola até a origem e a destaca; se for antiga, a API permite consultar `?around=id` mantendo controle de acesso.
- **Cancelar mensagem** substitui excluir: opção disponível somente para mensagens próprias ainda não lidas, remoção definitiva sem aviso ou tombstone. A API rejeita cancelamentos após `read_at` (HTTP 409).
- Reações **não** criam balões ou eventos no histórico: ficam ligadas ao balão original, com atualização otimista e ação para desfazer. A reação mais recente aparece na **prévia da lista de conversas** nos dois lados: **“Você reagiu ❤️ à mensagem”** para quem reagiu, sem contador; **“Maria reagiu ❤️ à sua mensagem”** para quem recebeu, contando como notificação não lida até a leitura.
- O ícone de conversas na navegação mobile/desktop mostra a **soma de mensagens e reações não lidas** (não número de conversas); SSE com fallback de polling mantém o número sincronizado. Assim que uma **mensagem** entra nessa contagem, o cliente confirma **Recebida** (sem marcar Lida). Reações só afetam a notificação; não criam recibo de entrega da mensagem.
- **Recibos por estado homogêneo:** mensagens próprias consecutivas não compartilham uma linha de status se uma já estiver **Lida** e outra estiver **Recebida/Enviada**. Cada edição separa seu próprio bloco de recibo e faz o texto revisado começar novamente em **Enviada**, aguardando nova entrega e leitura. A leitura anterior continua registrada para impedir cancelar uma mensagem que já foi lida.


## Anexos do mensageiro

- O menu **+** mantém o padrão semântica Light/Dark e PT/EN; Galeria, Câmera, Vídeo e Arquivo abrem seletores nativos. Localização solicita permissão somente ao tocar na opção e permite confirmar/remover a prévia antes de compartilhar.
- Uma mensagem pode ter texto ou **um anexo privado** (até 50 MB). Balões mantêm **cantos retos** e oferecem miniatura de imagem com ampliação, vídeo inline ou cartão de arquivo; status e timestamp seguem os mesmos padrões do chat.
- O anexo otimista tem miniatura local enquanto envia; falhas permitem **Reenviar** sem duplicar o ID. O R2 e o PostgreSQL devem preservar autorização por conversa; nem URL pública nem tokens nos links.


### Paridade de mídia com a versão demo (PR #31)

- Anexos agora ficam **em prévia antes do envio**, com nome, tamanho e ação para remover. Texto digitado pode acompanhar o anexo como legenda. Colar imagem do clipboard abre a mesma prévia.
- Câmera: escolha **Tirar foto** ou **Gravar vídeo** no seletor nativo. Galeria, vídeo e documentos continuam com entradas nativas.
- Microfone: gravar, pausar, retomar, finalizar, descartar e **ouvir antes de enviar**. Player do áudio com seek, duração e velocidades **1×, 1,5×, 2×**; formatos WebM/MP4/OGG/MP3/WAV/AAC conforme suporte do navegador.
- Editor de fotos **antes de enviar**: desenho, retângulo, círculo, seta, cores, desfazer e limpar. Salvar gera um PNG novo sem alterar o original.
- Visualizador de foto/vídeo com rolagem por mídias da conversa, botões anterior/próxima, teclado (←, → e Esc) e opção de salvar; vídeo tem controles nativos.
- O limite é restaurado para **50 MB** com migração Drizzle `0008_dm_attachment_50mb`, trocando somente a restrição `dm_attachment_consistency`. A mudança requer migração no Neon principal antes de publicar o Worker/API do PR #31; nenhum arquivo existente é apagado.
- Localização é enviada como texto especial com link Google Maps depois da permissão e confirmação da prévia; não existe rastreamento contínuo.


### Ajustes do kit — mídias do chat

- Menu + de anexos: **4 itens**, Galeria / Câmera / Arquivo / Localização. Dentro da Câmera há Tirar foto e Gravar vídeo; o botão Vídeo redundante foi retirado.
- Nada de nomes técnicos `IMG_2026...`, `gravacao-...` ou IDs R2 nas mídias. Mostrar **Foto / Vídeo / Áudio / Documento PDF** conforme idioma, preservando metadados para download.
- Player de áudio em **bg-card + text-foreground**, Play em **bg-primary**, controles de velocidade em **bg-secondary** e barra de progresso `accent-primary` para contraste adequado no Light/Dark.
- A prévia e o visualizador compartilham URLs Blob de cache privado limitado à aba. A localização abre o Google Maps, inclusive para mensagens antigas com link OpenStreetMap.

## Layout das comunidades reais

- Faixa de comunidades à esquerda com ícones, busca/criação, e painel fixo de canais no desktop; no celular, entrar em um canal abre a conversa, com seta para voltar e barra inferior de navegação principal oculta.
- Cabeçalho dos canais com `data-uorqui-context-header` fixo, lista de mensagens ocupando a largura e rolando isoladamente, campo de texto fixo próximo ao rodapé do painel.
- Modos públicos/por aprovação/privados claramente identificados. Nas comunidades privadas, os canais só aparecem depois da aceitação do convite. Proprietário/admin vê solicitações pendentes e o formulário de convite por @usuário.
- Seletores, botões, estados vazios e erros usam tokens semânticos do tema light/dark. Mensagens de usuário não são traduzidas.

## Voz em comunidades

- As salas apresentam botão **Entrar na sala**, permissão do microfone sob gesto do usuário, **Ligar/Desligar microfone** e **Sair**. A conexão de áudio não abre vídeo, não grava e não persiste o som.
- Indicadores de participantes/microfones e ligação; `audio.play()` utiliza um botão explícito de *Ativar som* quando bloqueado pelo navegador.
- Ao trocar/fechar canal, limpa tracks, RTCPeerConnections, players e sessão. Os painéis principais e o header permanecem fixos com rolagem apenas interna no desktop/mobile.
- Caso o navegador não consiga conectar por uma rede fechada, a tela avisa quando TURN não está disponível. Nunca exibir um estado "conectado" sem confirmação de `RTCPeerConnection.connectionState`.

## Painel de moderação das comunidades

- Componente de moderação expansível na coluna lateral de canais; utiliza o mesmo cabeçalho e rolagem independente do UI Kit, sem deslocar o cabeçalho do canal.
- Operações destrutivas (banimento, expulsão, desbanimento e exclusão do canal) exigem confirmação explícita na interface.
- Controles exibidos conforme a hierarquia dos cargos. A API valida novamente cada operação; esconder botões não é a estratégia de segurança.
- Mensagens permitem edição do próprio autor, cancelamento e visualização de uma marcação discreta após remoção. Moderadores recebem a ação de cancelar mensagens de outros membros.

## Salas de voz — apresentação estilo Discord

- A área principal usa **grade responsiva de participantes** com avatares grandes, nomes e indicação real de microfone/conexão. Não inventar animações de fala nem mostrar status conectado sem confirmação de sessão.
- O rodapé da chamada fica fixo dentro do painel, com ações compactas: **mutar microfone**, **silenciar áudio (deafen)** e **desconectar**. Deafen silencia saída e microfone; ao desfazer, restaura o estado anterior do microfone.
- A coluna lateral de canais mostra os participantes ativos do canal em uso. Ao sair, a lista e os estados locais são limpos.
- Remover da tela da chamada textos técnicos explicativos de WebRTC, STUN, TURN e armazenamento de áudio. Essas informações permanecem na documentação técnica e só aparecem ao usuário quando houver erro real de conexão.
- Preservar o header de contexto fixo, a área rolável interna, o tema claro/escuro, os controles de pelo menos 44px e a navegação mobile sem deslocamento com teclado.

## Indicadores ao vivo e sons das salas de voz

- Som de **entrada**: dois tons suaves ascendentes. Som de **saída**: dois tons suaves descendentes. São gerados no próprio navegador, sem assets externos. Tocar somente quando a sessão entra de verdade ou sai voluntariamente; para participantes remotos, usar mudanças reais na lista de presença, sem repetir sons após a carga inicial. Não tocar por tentativa fracassada, sincronização normal nem ao mudar uma tela sem confirmar a entrada.
- A detecção de fala usa os **níveis reais** das trilhas WebRTC locais e remotas (analisador Web Audio, sem gravar, transmitir ou armazenar o conteúdo). Exibir apenas uma **borda verde pulsante** enquanto a pessoa fala, preservando estático o nome e a foto. Muted não mostra atividade.
- Na grade e na lista lateral, exibir **microfone desligado** com `MicOff` vermelho e **áudio desativado (deafen)** com `VolumeX` vermelho. Deafen desativa reprodução e microfone; ao voltar, restaura o estado anterior do microfone.
- `community_voice_sessions.deafened` sincroniza o estado do áudio em tempo real via heartbeat, ao lado de `muted`. O estado é somente da sessão atual, não configuração de perfil. Migração `0014_voice_deafen_status`.
- Não tocar sons se o usuário está com deafen ativado. Sem autorização de autoplay, o navegador pode silenciar os efeitos; a chamada não deve falhar por isso.

## Estados assíncronos obrigatórios

- **Skeleton** para dados sendo carregados inicialmente ou ao trocar telas: lista de conversas, mensagens, membros, informações e canais. Skeleton ocupa a área real do componente, evitando movimento de layout. Atualizações em segundo plano não substituem conteúdo já visível.
- **Spinner** para ações que aguardam o backend. O componente `Button` aceita `loading`: mostra indicador, marca `aria-busy` e desativa cliques duplicados. Em operações perigosas, mantenha também a confirmação explícita.
- **Envio de mensagens:** inserir imediatamente a mensagem na conversa com spinner e status **Enviando**. Limpar e liberar o compositor no envio, sem esperar resposta. Ao confirmar, retirar spinner; se falhar, marcar falha com ação de reenviar sem perder o conteúdo.
- Não usar um estado `busy` de toda a tela para o envio de cada mensagem. Operações independentes mantêm seus próprios estados; acessibilidade com `role=status` e rótulos traduzidos.

## Comunidades, convites e compartilhamento

- **Administrar comunidade:** editar foto (R2), nome e descrição; hierarquia de permissões para promover/rebaixar administradores; exclusão definitiva somente pelo proprietário após confirmar digitando o nome exato.
- **Link para compartilhar:** membro pode copiar o link ativo; administrador gera, renova e revoga. O link é temporário (7 dias) e a renovação invalida o anterior. Usuários banidos não podem reingressar.
- **Convite para novos usuários:** aceitar link em `/invite/<token>` antes de login; após cadastro, confirmação de e-mail e criação do perfil, a participação é efetivada automaticamente. A verificação por e-mail não deve ser pulada. Preservar o convite ao voltar da confirmação e ao usar o mesmo navegador.
- **Compartilhamento de tela em voz:** botão de apresentar, solicitação explícita de permissão, prévia local, vídeos remotos e botão para parar. Finalizar todas as trilhas quando sair da sala, sem gravar vídeo. Ocultar/desabilitar o controle quando `getDisplayMedia` não existir no navegador.


## Migração visual — Workspace v1 (05/11/2026)

O UI Kit agora também possui uma implementação reutilizável em código próprio, inspirada na demonstração Sprintrix, sem importar o código comercial nem o protótipo Next.js:

- `apps/web/src/ui-kit/sprintrix.css` — variáveis semânticas escopadas ao workspace autenticado: canvas e sidebar claro `#fafafa` / escuro `#181818`, painel branco / `#0a0a0a`, bordas discretas e seleção contrastante.
- `apps/web/src/ui-kit/components.tsx` — `UIKitSectionHeading`, `UIKitCount` e `UIKitChip`.
- `apps/web/src/SocialShell.tsx` — aplica a paleta e a estrutura de sidebar compacta, com recolhimento total instantâneo, marca pixelada sem símbolo circular, 53 px de cabeçalho e painel com 7 px de margem e raio de 17 px no desktop.
- O item **Comunidades** permanece no menu principal, mas as comunidades foram removidas dessa lista. Ao acessar o módulo, uma **barra secundária de ícones** mostra apenas as comunidades reais e autorizadas, com avisos de não lidas, criar e buscar. Em telas pequenas, ela se recolhe ao abrir um canal para preservar a largura da conversa. Comunidades continua na navegação inferior mobile.
- No desktop, o cabeçalho não exibe a lupa nem o avatar de perfil; a busca continua em `Ctrl/Cmd + K` e no botão da sidebar, e o perfil continua acessível em Configurações. No mobile, esses controles permanecem no cabeçalho.

A migração visual **não troca** React/Vite por Next.js e **não modifica** API Fastify/Render, Better Auth, Neon, SSE, uploads ou WebRTC. `LiveCommunities` continua montado para preservar salas de voz ao navegar. Dados do protótipo não entram na produção.

**Validação:** `npm run build -w @uorqui/web`, `npm run check:worker -w @uorqui/web`, login e navegação reais, temas claro/escuro, fechamento do menu e continuidade da voz.

## Ajuste de disposição — comunidades e notificações (05/11/2026)

- A barra de ícones das comunidades pertence à **área de conteúdo**, dentro de `data-uorqui-inset-panel`, diretamente abaixo do cabeçalho, e não ao lado do menu principal. É exibida somente no módulo Comunidades; no mobile se oculta quando um canal está aberto. Segue as cores e as bordas do painel.
- O acesso a **Notificações** foi transferido da sidebar para o **cabeçalho desktop** (sino com badge de não lidas e acesso à tela existente). No mobile, Notificações continua na navegação inferior.
- O menu principal não exibe a lista de comunidades nem o item Notificações no desktop; o módulo Comunidades permanece acessível. A busca e o perfil continuam disponíveis pelos acessos anteriores.
- Não foram alterados API, persistência, SSE ou WebRTC; `LiveCommunities` continua montado durante a navegação.

## Ajuste do trilho e política de cache de mídia (05/11/2026)

- O painel Comunidades agora usa **apenas uma barra de ícones**: a barra antiga dentro de `LiveCommunities` fica oculta, sem desmontar a sala de voz. Os avatares têm tamanho fixo 40 × 40 px, imagens contidas em um quadrado com `object-fit: cover`, badges posicionados dentro do ícone e largura do trilho fixa (56 px no celular e 64 px no desktop), sem extrapolar o quadro.
- **Fotos de perfil, capas e avatares de comunidades**: cache único de URLs de mídia versionadas em memória e IndexedDB **por conta autenticada**, com no máximo 96 itens / 48 MiB em disco e validade de 24 h; limite de 3 MiB para fotos de perfil e 10 MiB para imagens de comunidades. Logout ou troca de conta limpa o armazenamento e revoga os Blob URLs.
- **Mensagens diretas e anexos de canais**: cache somente **na memória da aba**, com URLs Blob reutilizáveis para imagens, vídeos, áudio e arquivos comuns (PDF, ZIP, texto e documentos Office). Limites de 32–96 MiB conforme RAM detectada (64 MiB padrão), até 42 itens, até 24 MiB por item e 90 min. O fluxo de download é interrompido quando excede o limite; o que for maior permanece acessível diretamente pelo endpoint autorizado.
- **Arquivos públicos do PWA**: o Service Worker guarda a versão atual dos assets com hash (JS, CSS, ícones, imagens, fontes e áudios/vídeos estáticos até 8 MiB) e ícones/manifest do PWA, com limite de 100 itens. Ícones sem hash são revalidados em segundo plano.
- **Não cachear via Service Worker/Cache Storage** respostas de sessão, API, autenticação, `/media/*`, chats, documentos privados nem arquivos de outras origens. Anexos privados sempre passam por autorização inicial no Worker e não persistem entre sessões. Recibos, histórico e mensagens continuam sujeitos à API. Não alterar os recibos de leitura ao pré-carregar mídia.

Verificação: abrir diversas comunidades, trocar de módulo, inspecionar a aba Network para downloads duplicados de avatar; testar fotos/áudios/vídeos/PDF em conversas reais, logout e troca de conta, light/dark, celular e permissões. Validar `npm run build -w @uorqui/web` e `npm run check:worker -w @uorqui/web`.


## Cache privado de chats — proteção do navegador (05/11/2026)

- As mídias de mensagens diretas e canais privados continuam **somente na RAM da aba** (Blob URLs temporários). Não são gravadas em IndexedDB, Cache Storage, localStorage nem pelo Service Worker; o Worker mantém `Cache-Control: private, no-store` e revalida a autorização em cada solicitação de rede.
- O cache agora é **vinculado à conta autenticada**. Ao trocar de usuário ou sair, os downloads em andamento são abortados, e as URLs temporárias são revogadas. Mídia cancelada ou conversa excluída também invalida o cache.
- Áudios próximos da área visível são pré-carregados com controle de concorrência. O player não solicita metadados diretamente antes de ser acionado e reutiliza os bytes em RAM se já disponíveis; o `play()` segue dentro do gesto do usuário, inclusive no Safari iOS.
- Imagens abertas no visualizador aguardam a versão já carregada em memória, evitando duas solicitações paralelas. Anexos e vídeos abertos também reutilizam o cache temporário quando disponíveis.
- Permanecem os limites por dispositivo de 32–96 MiB, até 42 itens, 24 MiB por arquivo e 90 minutos. Arquivos grandes ou não compatíveis seguem pelo endpoint original e a sessão ativa continua exigindo permissão para acessá-los.
- **Atenção:** qualquer mídia exibida durante uma sessão autenticada pode ser inspecionada por alguém que controle o mesmo navegador/perfil. Não há cache persistente de anexos privados, por isso eles não ficam disponíveis após encerrar a aba. O cache persistente de **avatares** é separado e tem outra política.

Testar no desktop e no Safari iOS: tocar/reproduzir áudio e vídeo, alternar mensagens, reabrir imagem, baixar PDF, trocar contas e sair; verificar que `/media/dm/*` nunca consta no Cache Storage/IndexedDB nem no Service Worker.

## Ancoragem de mensagens na abertura (05/11/2026)

- **Mensagens privadas:** ao abrir uma conversa, rola imediatamente para a última mensagem. Um `ResizeObserver` acompanha mudanças tardias de altura de fotos, mídias e conteúdo, mantendo o fim visível **somente se o usuário estiver no fim**. Quando a pessoa sobe para ler histórico antigo, a posição não é forçada para baixo; novas mensagens continuam gerando o aviso já existente.
- **Canais de texto e chat das salas de voz:** reabrir um canal inicia na última mensagem, sem restaurar a rolagem antiga. O scroll segue o fim enquanto a pessoa está próxima dele, inclusive ao expandir anexos; ao rolar para cima, mantém a posição. No celular, um ajuste após o primeiro frame cobre a disposição responsiva.
- As mudanças afetam apenas a apresentação e não enviam recibos de leitura por abertura da lista nem modificam SSE, cache, API ou WebRTC.

Validar com históricos longos, mídia de carregamento tardio, mensagens recebidas enquanto lê o histórico e abertura repetida no Safari iOS e desktop.


## Transições e carregamento por área de conteúdo (05/11/2026)

- O **menu principal, a barra de comunidades e o cabeçalho do workspace permanecem estáveis**. Ao navegar entre Mensagens, Comunidades, E-mail, Notificações, Perfil e Moderação, **somente o painel central** usa a mesma transição de entrada: opacidade 0 → 1, deslocamento horizontal de 14 px → 0, 180 ms e curva `cubic-bezier(.22,1,.36,1)`.
- **Comunidades continua montado** quando o usuário muda de módulo, para não desconectar o microfone/WebRTC. Apenas sua superfície de conteúdo fica oculta e é animada novamente ao retornar.
- Dentro dos módulos, entrar em conversa privada, canal ou mensagem de e-mail usa o mesmo efeito no conteúdo, sem animar o cabeçalho do chat. A tela de ajustes de notificações também usa a transição.
- Um único `WorkspaceContentLoading` (`apps/web/src/ui-kit/WorkspaceContentLoading.tsx`) padroniza skeletons de **conversas, mensagens, canais, comunidades, e-mails, notificações e moderação**, exibidos apenas na região que aguarda dados reais. Nenhum timer artificial ou bloqueio da navegação é introduzido.
- O movimento é removido quando o sistema solicita **redução de animações** (`prefers-reduced-motion`). SSE, posicionamento da última mensagem, uso do cache, recibos de leitura e chamadas permanecem independentes da transição.

Validar ida e volta entre módulos, troca de canais, abertura de conversa, e-mail e notificações, bem como PWA/mobile, redução de movimento e voz ativa durante a navegação.
