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
