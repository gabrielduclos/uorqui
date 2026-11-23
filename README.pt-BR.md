# Uorqui Workplace

[English](README.md) · 0.2.0-beta.2

Um espaço compacto para equipes conversarem em canais internos e colaborarem com clientes em canais privados. Responsáveis pelas equipes criam canais e geram links vinculados ao e-mail de cada convidado. Quem tem acesso ao canal pode enviar mensagens e organizar as respostas em tópicos.

A interface oferece português do Brasil, inglês e temas claro e escuro. O frontend React e a API Fastify rodam separadamente. O Better Auth gerencia sessões e o Drizzle armazena mensagens no PostgreSQL.

## Rodar localmente

Use Node.js 22 ou superior, npm e um banco PostgreSQL de desenvolvimento. Execute os comandos na raiz do repositório.

```sh
npm ci
cp apps/api/.env.example apps/api/.env
```

Configure `DATABASE_URL` e gere um `AUTH_SECRET` exclusivo com `openssl rand -hex 32`. Mantenha `WEB_ORIGIN=http://localhost:5173` para a configuração local padrão.

```sh
npm run db:migrate -w @uorqui/workplace-api
read -rs password
printf '%s\n' "$password" | npm run account:provision -w @uorqui/workplace-api -- voce@example.com "Seu Nome"
unset password
npm run dev
```

Também é possível criar uma conta diretamente na tela de entrada. Digite a senha da primeira conta após o comando `read`. Abra [localhost:5173](http://localhost:5173/), entre e crie uma equipe. Para convidar um cliente, crie um canal privado. O sistema gera um link para você enviar ao convidado.

Use `npm run typecheck`, `npm run build` e `npm test` para verificar o projeto. O teste de integração usa um PostgreSQL temporário via PGlite.

Veja a [publicação](docs/pt-BR/deployment.md), o [UI kit](docs/pt-BR/ui-kit.md) e as [notas de versão](CHANGELOG.pt-BR.md).
