# Front-end no Cloudflare Workers

[Português](cloudflare-workers.md) · [English](../en/cloudflare-workers.md)

## Arquitetura

A aplicação React/Vite/Tailwind do Uorqui é compilada em **arquivos estáticos**, servidos pelo **Cloudflare Workers Static Assets**, não pelo Cloudflare Pages. Um Worker pequeno recebe as requisições `/api/*` e `/health*` no mesmo domínio e as encaminha à API independente **Node.js + Fastify**, que usa **PostgreSQL Neon com Drizzle**.

O Worker **não executa Fastify** nem recebe `DATABASE_URL` ou `AUTH_SECRET`. Ainda não escolhemos a hospedagem da API. O novo Worker `main` já existe na Cloudflare, vinculado ao repositório `gabrielduclos/uorqui` e à branch `main`; a publicação será feita pelo **Cloudflare Builds**, não pelo GitHub Actions. O domínio e Worker legados do `uorqui.app` permanecem intactos.

## Arquivos

- `apps/web/wrangler.jsonc`: Worker independente `main` (nome existente no painel Cloudflare), arquivos compilados, fallback SPA e prioridade das rotas da API
- `apps/web/worker/index.ts`: proxy no mesmo domínio, retornando 503 enquanto a API não estiver configurada
- `apps/web/.dev.vars.example`: exemplo seguro para prévia com API local
- `apps/web/vite.config.ts`: proxy do Vite mantido para desenvolvimento convencional

## Validação local

Com Node.js 22 ou superior, na raiz do repositório:

```sh
npm install
npm run build -w @uorqui/web
npm run check:worker -w @uorqui/web
```

Para abrir a prévia do próprio Worker, execute a API em outro terminal (`npm run dev -w @uorqui/api`), copie `apps/web/.dev.vars.example` para `apps/web/.dev.vars` e execute:

```sh
npm run preview:worker -w @uorqui/web
```

O exemplo usa `API_ORIGIN=http://127.0.0.1:3001` localmente. Para testar login nessa prévia, `AUTH_BASE_URL` e `WEB_ORIGIN` devem ser configurados na API privada com a **origem exata do endereço da prévia**; caso contrário, Better Auth pode rejeitar sessões. Continua possível desenvolver normalmente pelo Vite em `http://localhost:5173`.

## Deploy automático pelo Cloudflare Builds

O novo Worker **`main`** foi criado pelo usuário e está conectado à branch **`main`** do repositório **`gabrielduclos/uorqui`**. As configurações do Cloudflare Builds são:

| Campo | Configuração |
| --- | --- |
| Diretório raiz | `/apps/web` |
| Comando de build | `npm run build` |
| Comando de deploy | `npx wrangler deploy` |
| Nome do Worker no `wrangler.jsonc` | `main` |
| Origem | GitHub, branch `main` |
| Deploy automático | Via Cloudflare Builds após push, sem GitHub Actions de front-end |

O Cloudflare instala as dependências do workspace web, compila React/Vite e executa o deploy usando o Wrangler localizado em `apps/web`. Para alterações no front-end, o fluxo padrão é **commit → push na main → Cloudflare Builds → Worker**. O GitHub Actions permanece com testes da API e do Drizzle, sem fazer deploy do front-end.

**Atenção:** o nome técnico `main` corresponde ao Worker já conectado; é diferente da branch Git `main`. Não apontar este projeto para o Worker legado `uorqui-chat` ou para o domínio `uorqui.app` sem migração aprovada.

A aplicação está em pré-MVP. Sem `API_ORIGIN` configurada para uma API Fastify independente e segura, `/api/*` retorna 503. No futuro, configure `API_ORIGIN` nas variáveis **de runtime** do Worker, e configure os segredos de banco/autenticação apenas no host da API. Para cookies no mesmo domínio, `AUTH_BASE_URL` e `WEB_ORIGIN` da API precisarão corresponder à origem pública do novo front-end. Cadastro público continua bloqueado até os requisitos de segurança estarem completos.

Acompanhe a execução de cada build no painel **Workers & Pages → main → Builds**. Não confundir um build concluído com funcionalidade social pronta.
