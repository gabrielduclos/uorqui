# Uorqui Workplace

[English](README.md) · 0.2.0-beta.11

Um espaço compacto para equipes conversarem em canais internos e colaborarem com clientes em canais privados. Responsáveis pelas equipes criam canais e geram links vinculados ao e-mail de cada convidado. Quem tem acesso ao canal pode enviar mensagens e organizar as respostas em tópicos. Conversas de equipes e diretas atualizam por SSE e oferecem anexos privados de mídia e arquivos.

Badges de não lidas atualizam equipes e conversas diretas por um SSE autenticado de caixa de entrada. O perfil inclui confirmação de e-mail e troca de senha; configure `RESEND_API_KEY` e `AUTH_EMAIL_FROM` na API para ativar o envio da confirmação.

Responsáveis também podem gerenciar membros e excluir equipes. Mensagens diretas conectam duas pessoas independentemente das equipes. Edite nome, identificação pública e biografia pelo botão de perfil e compartilhe o link do seu perfil público.

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
printf '%s\n' "$password" | npm run account:provision -w @uorqui/workplace-api -- voce@example.com "Seu Nome" seu_usuario
unset password
npm run dev
```

Também é possível criar uma conta diretamente na tela de entrada com @username único. Digite a senha da primeira conta após o comando `read`. Abra [localhost:5173](http://localhost:5173/), entre e crie uma equipe. Para convidar um cliente, crie um canal privado. O sistema gera um link para você enviar ao convidado.

Use `npm run typecheck`, `npm run build` e `npm test` para verificar o projeto. O teste de integração usa um PostgreSQL temporário via PGlite.

Veja a [publicação](docs/pt-BR/deployment.md), o [UI kit](docs/pt-BR/ui-kit.md) e as [notas de versão](CHANGELOG.pt-BR.md).
