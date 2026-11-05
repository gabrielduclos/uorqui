# Uorqui — interface corporativa (branch de preview)

Recriação **autoral** da linguagem visual da [demonstração pública do Sprintrix](https://shadcn-nextjs-sprintrix-app-template.vercel.app/my-issues): workspace lateral, painel principal, cabeçalho discreto, navegação, listas agrupadas, modo quadro, temas claro/escuro e responsividade.

**Não contém arquivos do template comercial Sprintrix nem reutiliza o código anterior do Uorqui.** O objetivo é reproduzir as referências de estrutura e densidade visual com componentes próprios, preservando a possibilidade de publicar o Uorqui como open source.

## Preview de interface

- Tela inicial: canais separados em Fixados, Operação, Projetos e Clientes.
- Navegação: Caixa de entrada, Mensagens, Canais, Reuniões, Contatos, Clientes e Configurações.
- Interações reais de interface: recolher sidebar, tema, densidade, filtros, visão lista/quadro, busca (Ctrl/Cmd + K), abrir conversas, digitar mensagens localmente e criar um canal nesta sessão.
- Dados, pessoas, organizações e mensagens são **exemplos fictícios**. A interface ainda não tem login, banco, WebSocket, SSE, chamadas nem upload remoto.

## Desenvolvimento

```sh
cd apps/web
npm install
npm run dev
npm run typecheck
npm run build
```

Stack: Next.js 16, React 19, TypeScript, Tailwind CSS 4, ícones Lucide.

O preview da branch utiliza **static export** no Worker da Cloudflare. Quando o backend for integrado, substituir essa configuração temporária por um adaptador Next.js para Workers. O ambiente não deve ser apontado para as contas/API de produção sem etapa separada de autenticação e isolamento.
