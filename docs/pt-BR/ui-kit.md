# Uorqui UI Kit · Design System v0.1

> Somente documentação. O UI Kit **não** terá página ou rota dentro do aplicativo.

## Objetivo

Definir a linguagem visual compartilhada do Uorqui para mensagens individuais, feed híbrido e comunidades. O sistema precisa funcionar no desktop e no celular, com temas semânticos, acessibilidade e português/inglês.

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
| DemoMessageComposer | Texto expansível, anexo horizontal pelo +, emoji à direita, áudio/envio no mesmo botão |
| DemoChatBubble | Balão retangular, resposta, reação e menu dentro da tela sobre conversa desfocada |
| DemoAudioPlayer, DemoMediaViewer | Áudio e visualização de fotos/vídeos |
| DemoImageEditor | Desenhos e formas em fotos antes de enviar e no visualizador |

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
- apps/web/src/Demo*.tsx — componentes do chat

A cada mudança, conferir dark/light × português/inglês × desktop/mobile, acessibilidade e documentação.

## Contrato obrigatório do chat real

- `LiveDirectChat` é responsável pela lista, cabeçalho fixo, rolagem, mensagens e recebimento de eventos. A área de mensagens usa a **largura disponível do desktop** e rolagem somente no painel.
- `DirectMessageBubble` usa **cantos retos** (`rounded-none`) como identidade visual dos balões de conversa, cores semânticas, resposta por swipe e menu com blur limitado ao painel da conversa, sem sair do viewport.
- `LiveMessageComposer` preserva a ordem **+ anexos | texto expansível | emoji | mic/enviar**, com menu de anexo horizontal e seletor de emojis à direita. Um único botão mostra microfone quando o campo está vazio e envio quando há texto.
- O texto enviado é persistido na API; cada novo balão aparece imediatamente com spinner sem bloquear o compositor e permite reenviar com o mesmo identificador se falhar. O horário de envio permanece junto ao texto de cada balão; os estados Enviando/Enviada/Recebida/Lida são exibidos uma única vez em uma linha neutra, centralizada, como mensagem do sistema ao final de cada bloco consecutivo de mensagens próprias, com horário da última atualização do estado. Um bloco só indica Lida ou Recebida quando todas as mensagens não excluídas atingiram esse estado. O spinner de envio e a ação de reenvio continuam no próprio balão. O campo de entrada possui borda e fundo semânticos de alto contraste em Light e Dark. O indicador visual “Ao vivo” não é exibido (a sincronização continua ativa). **Áudios e anexos** ainda dependem de endpoints específicos. **Responder** salva uma referência real à mensagem original, com prévia no balão, inclusive após edição ou exclusão da origem. **Editar, excluir para todos, encaminhar e reagir** estão ligados ao backend, com autorizações e persistência. Reações são atualizadas de modo otimista e revertidas em caso de erro. A lista de conversas aberta e visível confirma **Recebida** sem marcar **Lida**. Controles sem backend ficam desabilitados e identificados; não enviar conteúdo apenas na interface local.
- A lista de conversas **não pode confirmar leitura**. Apenas uma conversa aberta, com janela e painel visíveis, pode emitir confirmação.
- Abrir chat rola até a última mensagem; ler mensagens antigas não desloca a rolagem. Novas mensagens fora da área visível usam aviso e seta para o final.
- Verificar desktop/mobile, Light/Dark e PT/EN antes de publicar. Qualquer migração futura deve reutilizar estes componentes em vez de substituí-los por telas genéricas.

## Ajustes do chat real — cancelamento, reações e badge

- O formato dos **balões de mensagem é reto** (`rounded-none`), mesmo com outras superfícies suavemente arredondadas.
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
