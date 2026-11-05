# Referência visual Sprintrix — fidelidade de layout

A referência é a página pública [Sprintrix / My Issues](https://shadcn-nextjs-sprintrix-app-template.vercel.app/my-issues), examinada em 05/11/2026 na resolução 1440 × 900. A primeira adaptação do Uorqui reproduzia apenas cores e partes da navegação; esta segunda etapa corrige a composição visual.

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
