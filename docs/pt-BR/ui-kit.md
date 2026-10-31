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

O mensageiro 1:1 **já está conectado** à API e ao Neon. Os canais comunitários ainda usam prévias locais. O layout do chat real deve manter paridade com este UI Kit; funções que dependem de novas APIs não podem fingir persistência.

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

- O menu **+** mantém o padrão semântica Light/Dark e PT/EN; Galeria, Câmera, Vídeo e Arquivo abrem seletores nativos. Localização permanece claramente indisponível.
- Uma mensagem pode ter texto ou **um anexo privado** (até 20 MB). Balões mantêm **cantos retos** e oferecem miniatura de imagem com ampliação, vídeo inline ou cartão de arquivo; status e timestamp seguem os mesmos padrões do chat.
- O anexo otimista tem miniatura local enquanto envia; falhas permitem **Reenviar** sem duplicar o ID. O R2 e o PostgreSQL devem preservar autorização por conversa; nem URL pública nem tokens nos links.
