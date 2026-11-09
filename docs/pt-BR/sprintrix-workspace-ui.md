# Referência visual Sprintrix — fidelidade de layout

A interface adapta padrões gerais observados na [caixa de entrada pública do Sprintrix](https://shadcn-nextjs-sprintrix-app-template.vercel.app/inbox). O Sprintrix é comercial; nenhum código-fonte, imagem, asset ou componente pago foi copiado.

## Escopo
- Visual shadcn mais neutro e compacto, com barra lateral de 256px no desktop.
- Menus principal e mobile: Mensagens, Email e notificações; perfil continua disponível. Comunidades ficam em uma coluna própria de ícones no estilo Stoat, com contadores, criação e acesso às públicas. Descobrir permanece removido.
- Selecionar um servidor abre seus canais independentemente do menu geral. A coluna permanece acessível nos outros módulos e fica oculta durante a leitura de conversas, canais ou emails no mobile; voltar restaura a coluna.
- Mensagens e Email usam filtros discretos, busca, lista lateral e painel de leitura. O filtro Públicas dentro de Comunidades permite encontrar comunidades pelo fluxo existente de entrada/aprovação.
- [Email via OAuth](email.md): Gmail e Outlook, caixa de entrada/enviados, filtros, leitura em texto e envio. Requer configuração privada no Fastify antes de conectar contas reais.
- Paleta com Ctrl/Cmd+K ou botões de busca: navega por módulos e comunidades existentes, sem prometer busca global ainda não implementada.
- Preferências de conta e moderação seguem operacionais, com suas permissões.
- Preservados cache das mensagens, SSE, envio otimista, chamadas WebRTC e endpoints existentes.

## Sistema visual implementado

- Fundo/canvas cinza muito claro e barra lateral contínua de 256 px, sem cartões decorativos no menu.
- Superfície de trabalho principal branca, afastada 8 px da borda superior/direita, com borda e raio de 16 px.
- Cabeçalho de 52 px com separador e trilha de navegação, seleção escura com texto claro e linhas compactas.
- Navegação geral separada da coluna de servidores no estilo Stoat e dos canais existentes de texto, voz e reuniões.
- Histórico ao lado da lista de canais. Recolher o menu geral o esconde por completo e amplia o conteúdo, como na referência; trocar de módulo preserva essa escolha e a coluna de servidores permanece independente.
- **Fundo externo claro completo (beta.26):** todo o fundo/canvas do app logado e suas margens (`--background`) e o trilho externo (`--workspace-rail`) usam o mesmo `#ededed` do menu principal. O painel, a lista de canais e a área de leitura continuam brancos; o tema escuro permanece igual.
- **Contraste do menu claro (beta.25):** menus principais desktop/mobile passam a usar o token compartilhado `--kit-sidebar` (`#ededed` no modo claro); o painel e a lista de canais permanecem brancos e o tema escuro não muda.
- **Superfície alinhada (beta.23):** os grupos de canais e suas ações de gerenciamento compartilham o fundo do painel de conteúdo (`--kit-panel`), em vez do fundo externo (`--background`). O menu principal mantém sua própria superfície nos temas claro e escuro.
- Notificações ficam em Administração para todas as contas; Moderação continua condicionada à permissão.
- Paleta base neutra: fundo cinza, área branca, seleção preta e coluna de servidores discretamente mais escura no tema claro; superfícies escuras neutras com seleção clara no tema escuro, incluindo mobile.
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
