# UI kit

[English](../en/ui-kit.md) · [README](../../README.pt-BR.md)

O UI kit compartilhado usa preto, branco e cinzas neutros nos temas claro e escuro. Os componentes React usam Tailwind e convenções shadcn/ui com diálogos Radix. Os tokens globais de [styles.css](../../apps/web/src/styles.css) são a referência central e podem ser importados no tweakcn.

| Token | Claro | Escuro |
| --- | --- | --- |
| Background / sidebar | `#f5f5f5` | `#0a0a0a` |
| Foreground | `#171717` | `#fafafa` |
| Card / popover | `#ffffff` | `#141414` |
| Primary | `#171717` | `#fafafa` |
| Primary foreground | `#ffffff` | `#0a0a0a` |
| Muted | `#ededed` | `#262626` |
| Muted foreground | `#5c5c5c` | `#a3a3a3` |
| Accent | `#e5e5e5` | `#303030` |
| Border / input | `#d9d9d9` | `#333333` |
| Ring | `#737373` | `#fafafa` |

Os tokens secondary, popover e sidebar referenciam a paleta semântica compartilhada. Erros usam mensagem identificada, peso e contraste neutro. O texto comunica o estado.

## Componentes e layout

| Componente | Regras |
| --- | --- |
| Botões | Variantes primary, outline e ghost. O estado desabilitado reduz opacidade e bloqueia interação. |
| Diálogos | Foco gerenciado pelo Radix, título visível, rótulo de fechamento e suporte a Esc. |
| Formulários | Rótulos persistentes, texto de 16 px nos campos, foco visível e validação traduzida. |
| Equipes | Barra vertical de 68 px, botões de 46 px com iniciais, nome ao passar o mouse e rótulo acessível. A equipe ativa usa contraste invertido e marcador lateral. A criação de equipe fica após a lista. |
| Canais | Barra lateral compacta ao lado das equipes. Canais privados mostram um cadeado. |
| Mobile | Barra de equipes de 58 px e botões de 42 × 44 px. Canais e conversa ocupam telas alternadas. |
| Mensagens | Autor, horário, texto e ação de tópico usam os tokens compartilhados. Tópicos aparecem ao lado da conversa quando há espaço. |

Use uma escala de espaçamento de 4 px e o token compartilhado de raio de 10 px. A barra de equipes tem rolagem independente para listas longas. A navegação oferece Tab, Shift+Tab e Enter ou Espaço. O foco usa contorno visível de 2 px. A preferência por movimento reduzido desativa transições.

Os dois temas e idiomas cobrem diálogos, formulários de conta, estados vazios e navegação de canais. Enter envia uma mensagem e Shift+Enter insere uma linha.

Manter a estrutura estática visível enquanto os dados carregam. Skeletons reservam espaço para equipes, nomes de canais, mensagens e conteúdo do campo de composição. Atualizações em segundo plano preservam os dados existentes. Regiões de carregamento têm rótulos acessíveis e suporte a movimento reduzido. Formulários pendentes preservam os rótulos de envio.

Botões de ação usam o spinner compartilhado enquanto aguardam o backend, com aria-busy e interação bloqueada. Os rótulos permanecem visíveis. Envios de formulários, mensagens, paginação, novas tentativas e saída restauram o estado disponível após sucesso ou erro. Ações de clique assíncronas recebem esse feedback automaticamente.

O campo de mensagem usa uma linha e cresce conforme o conteúdo. Mensagens pendentes aparecem imediatamente. Mensagens próprias já enviadas oferecem edição e cancelamento com feedback compartilhado de espera. Textos editados recebem identificação. O cancelamento substitui o texto por uma indicação e mantém o tópico disponível.

A barra de equipes começa com mensagens diretas. O cabeçalho da equipe oferece ajustes para o responsável. O avatar no topo abre o próprio perfil; nomes de autores abrem o perfil correspondente. Perfis e gestão usam os mesmos modais, skeletons e botões com spinner nos dois temas e idiomas. No mobile, mensagens diretas alternam entre lista e conversa.

O cadastro reserva o prefixo @ ao lado do campo de usuário e normaliza a identificação para minúsculas. O popover (+) do compositor da main oferece galeria, câmera, arquivos e localização, com gravação de áudio ao lado do campo e prévias locais. A composição continua começando em uma linha e crescendo com o texto. O estado de carregamento cobre reserva de metadados, upload e confirmação da mensagem; mídias pendentes aparecem de forma otimista e permitem nova tentativa.

## Tipografia

Usar a pilha global do sistema `-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`, compartilhada com o token sans do Tailwind. Texto principal e mensagens usam `1rem` (16 px na configuração raiz padrão). Itens de navegação usam `0.875rem` (14 px), peso 400 normalmente e 500 quando selecionados. Campos de formulário mantêm mínimo de 16 px. Os dois temas compartilham os tokens; o zoom e as preferências de fonte do usuário permanecem disponíveis.


Mensagens de áudio exibem o player sem o nome do arquivo. Finalizar a gravação usa contraste inverso dos tokens de cor primária nos dois temas. Badges numéricos de não lidas usam tokens monocromáticos globais e rótulos acessíveis nas equipes, canais e mensagens diretas. A segurança do perfil oferece estado/reenvio de confirmação e campos de senha atual, nova e confirmação, com controles individuais de mostrar/ocultar e feedback compartilhado de espera/erro.


## Configurações

Abrir configurações em dialog Radix, agrupadas por assunto em abas. Perfil, Segurança e Aparência compartilham o dialog do usuário; Geral, Membros e Avançado organizam equipes. Tema e idioma ficam em Aparência. Abas usam setas, Home e End, preservam formulários e têm painéis associados. O dialog controla foco, fecha por Escape e permite rolagem interna no mobile e desktop.


## Anexos e reações

O botão + abre um dialog Radix centralizado, limitado à largura e altura da tela, com rolagem interna. Reações aparecem sob cada mensagem com contador e destaque da seleção própria; tocar novamente remove a própria reação. O seletor oferece 👍 ❤️ 😂 😮 😢 🎉.
