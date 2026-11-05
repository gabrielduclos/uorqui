# Referência visual Sprintrix — fidelidade de layout

A interface adapta padrões gerais observados na [caixa de entrada pública do Sprintrix](https://shadcn-nextjs-sprintrix-app-template.vercel.app/inbox). O Sprintrix é comercial; nenhum código-fonte, imagem, asset ou componente pago foi copiado.

## Escopo
- Visual shadcn mais neutro e compacto, com barra lateral de 256px no desktop.
- Seção Principal com módulos e contadores reais; seção Suas comunidades com vínculos autorizados, acesso aos canais existentes e destaque para a comunidade selecionada.
- Navegação principal: Mensagens, Comunidades e Email; notificações e perfil continuam disponíveis. Descobrir foi retirado da navegação e do tour. Preferências antigas de Descobrir abrem Mensagens.
- Barra lateral expandida substitui a coluna duplicada de ícones no desktop; barra recolhida preserva a coluna. No mobile, a navegação inferior usa as mesmas superfícies neutras, divisórias e destaque de seleção. Conversas, canais e emails abrem em painéis com retorno à lista.
- Mensagens e Email usam filtros discretos, busca, lista lateral e painel de leitura. O filtro Públicas dentro de Comunidades permite encontrar comunidades pelo fluxo existente de entrada/aprovação.
- [Email via OAuth](email.md): Gmail e Outlook, caixa de entrada/enviados, filtros, leitura em texto e envio. Requer configuração privada no Fastify antes de conectar contas reais.
- Paleta com Ctrl/Cmd+K ou botões de busca: navega por módulos e comunidades existentes, sem prometer busca global ainda não implementada.
- Preferências de conta e moderação seguem operacionais, com suas permissões.
- Preservados cache das mensagens, SSE, envio otimista, chamadas WebRTC e endpoints existentes.

## Sistema visual implementado

- Fundo/canvas cinza muito claro e barra lateral contínua de 256 px, sem cartões decorativos no menu.
- Superfície de trabalho principal branca, afastada 8 px da borda superior/direita, com borda e raio de 16 px.
- Cabeçalho de 52 px com separador e trilha de navegação, seleção escura com texto claro e linhas compactas.
- Barra lateral com blocos principais e área de trabalho, comunidades autorizadas expandidas em uma árvore de canais aninhados e indicador de não lidas.
- Histórico de canais e mensagens na área principal, com a coluna de gerenciamento de canais acessível por botão, não aberta por padrão com a barra lateral expandida.
- Conversas privadas com lista mais densa, divisórias, pesquisa e filtros compactos.
- Tema claro como padrão para novas instalações; preferência claro/escuro salva anteriormente é respeitada.
- Em telas móveis, mantém-se o padrão nativo do Uorqui/PWA, inclusive botão voltar e teclado.

## Lógicas preservadas

React/Vite, API Fastify no Render, dados no Neon, cache de canal em memória, SSE e envio otimista, notificações, permissões de canais, chamadas WebRTC e reuniões seguem funcionando pela implementação original. A referência visual **não é uma cópia do produto de gestão de tarefas Sprintrix** e não cria módulos falsos de issues.

## Direitos de uso

Sprintrix é um template comercial. Esta implementação utiliza apenas conceitos gerais de layout visíveis na demonstração pública. Nenhum arquivo, fonte, ícone exclusivo ou código pago foi copiado.

## Testes

- Conferir visualmente desktop em 1440×900 comparando com a referência: proporções, contraste, seleção e densidade.
- Abrir e recolher sidebar; alternar comunidades/canais; botão de gerenciamento e criação de comunidade.
- Verificar canais sem permissão, troca de conta, itens não lidos, atalhos, pesquisa Ctrl/Cmd+K.
- Testar dark/light, iOS/Android PWA, teclado, áudio/vídeo e acessibilidade com movimento reduzido.
- Rodar CI: TypeScript/build do frontend, integração da API/Worker/PostgreSQL. Testes visuais manuais permanecem necessários.
