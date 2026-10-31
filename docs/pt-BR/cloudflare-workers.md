# Front-end no Cloudflare Workers

[Português](cloudflare-workers.md) · [English](../en/cloudflare-workers.md)

## Arquitetura

A aplicação React/Vite/Tailwind do Uorqui é compilada em **arquivos estáticos**, servidos pelo **Cloudflare Workers Static Assets**, não pelo Cloudflare Pages. Um Worker pequeno recebe as requisições `/api/*` e `/health*` no mesmo domínio e as encaminha à API independente **Node.js + Fastify**, que usa **PostgreSQL Neon com Drizzle**.

O Worker **não executa Fastify** nem recebe `DATABASE_URL` ou `AUTH_SECRET`. Ainda não escolhemos a hospedagem da API. **Nenhum deploy foi realizado** e o domínio e Worker legados do `uorqui.app` permanecem intactos.

## Arquivos

- `apps/web/wrangler.jsonc`: Worker independente `uorqui-social-web`, arquivos compilados, fallback SPA e prioridade das rotas da API
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

## Deploy isolado futuro (ainda não executado)

1. Criar o Worker **`uorqui-social-web`** separadamente, sem substituir o Worker ou domínio do Uorqui legado. Não adicionar rota a `uorqui.app` enquanto o domínio atender ao produto antigo.
2. Compilar com `npm run build -w @uorqui/web` e publicar com `npm run deploy:worker -w @uorqui/web` **somente após autorização**. Sem API conectada, os arquivos estáticos podem abrir, mas `/api/*` retornará 503.
3. Hospedar a API Fastify em serviço Node.js independente, por HTTPS, usando `DATABASE_URL` e `AUTH_SECRET` privados gerenciados pelo provedor.
4. Configurar a variável de runtime **`API_ORIGIN`** no novo Worker com a origem HTTPS da API, **sem caminho adicional**, usando as configurações de variáveis/segredos da Cloudflare.
5. Configurar `AUTH_BASE_URL` e `WEB_ORIGIN` da API com a **origem pública do novo Worker**, garantindo cookies de sessão de primeira parte no proxy `/api/auth/*`.
6. Validar proxy, cookies, endpoints protegidos, logout, falhas e segurança em staging antes de abrir o acesso. **Cadastro público continua bloqueado** até confirmação de e-mail, recuperação de senha e controles de abuso.

O proxy preserva cookies e cabeçalhos de resposta, aplicando `Cache-Control: no-store` nas respostas de API para impedir cache de dados privados. `API_ORIGIN` ausente/inválida resulta em JSON 503, não no `index.html`.
