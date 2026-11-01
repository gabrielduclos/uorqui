# Primeiros passos — beta técnico

[Português](primeiros-passos.md) · [English](../en/getting-started.md)

> **Beta técnico `0.1.0-beta.1`:** mensageiro individual, feed, comunidades, salas de voz e autenticação estão implementados e publicados. Ainda faltam testes de ponta a ponta em celulares reais, e-mail e push. Este guia é para desenvolvimento local; não utilize os segredos ou o banco de produção.

## Requisitos

- Node.js 22 ou superior e npm.
- PostgreSQL local ou uma **branch de desenvolvimento isolada na Neon** para autenticação, feed, mensagens e demais fluxos persistentes. É opcional somente para abrir a interface ou verificar o processo da API.

## Executar localmente

```sh
git clone https://github.com/gabrielduclos/uorqui.git
cd uorqui
npm install
npm run dev
```

- Interface: http://localhost:5173
- API: http://127.0.0.1:3001/health
- Estado da API: http://127.0.0.1:3001/api/v1/status

O endpoint `/health` confirma **somente o processo da API**, não a conexão do banco.

## Configurar banco e autenticação (somente desenvolvimento local)

O repositório contém migrações versionadas, incluindo tabelas sociais e as tabelas `user`, `session`, `account` e `verification` do Better Auth. O banco de produção já tem histórico de migrações. **Para desenvolvimento, use um banco isolado**, aplique as migrações pendentes pelo Drizzle e nunca execute SQL manualmente sobre a Neon principal.

1. Copie `apps/api/.env.example` para `apps/api/.env`.
2. Informe `DATABASE_URL` da **branch de testes** da Neon (ou PostgreSQL local), nunca da produção. Não publique credenciais em código, logs ou issues.
3. Gere `AUTH_SECRET` com `openssl rand -base64 48`, mantenha em segredo e configure `AUTH_BASE_URL=http://localhost:3001` e `WEB_ORIGIN=http://localhost:5173`.
4. Aplique no banco **de testes** somente migrações pendentes com `npm run db:migrate`. Para cadastro local, configure `ENABLE_DEV_SIGNUP=true` e `NODE_ENV=development`; não exponha o servidor à internet.
5. Acesse `http://localhost:5173`; teste cadastro, login, sessão, nome de usuário e saída. Antes, confirme `http://localhost:3001/health/db` com resposta `connected`.

Sem segredos ou esquema do banco prontos, endpoints protegidos podem retornar 503. O cadastro local de desenvolvimento é separado de `ENABLE_PUBLIC_SIGNUP`, que pode habilitar cadastro em produção **somente com** configuração explícita de Resend/Turnstile e controles do servidor. Verificação por e-mail e recuperação de senha estão implementadas, mas seu funcionamento real ponta a ponta ainda exige validação. O Better Auth cuida das senhas e cookies; a API exige sessão antes de criar perfis.

`GET /health` verifica o processo da API; `GET /health/db` verifica PostgreSQL; `GET /api/v1/me` exige sessão; `POST /api/v1/onboarding` cria o perfil social associado à conta autenticada.

Para futuras alterações, gere uma nova migração com `npm run db:generate`, revise e versione os arquivos, teste em uma branch temporária e aplique com `npm run db:migrate` somente no ambiente autorizado. Não cole manualmente migrações já aplicadas.

## Teste automático de integração

O GitHub Actions usa **PostgreSQL temporário**, aplica as migrações versionadas e testa autenticação, onboarding, mensageiro, comunidades, feed e integração Worker → API, sem usar dados da Neon de produção. Veja [integração de autenticação](https://github.com/gabrielduclos/uorqui/actions/workflows/auth-integration.yml).

## Prévia no Cloudflare Workers

O servidor Vite permanece disponível para desenvolvimento local. O front-end também possui configuração para build e prévia no Worker; veja [Cloudflare Workers](cloudflare-workers.md). O Worker do front-end e a API Fastify são serviços separados.

## Verificações

```sh
npm run typecheck
npm run build
```

A API Node e a interface Vite são workspaces npm separados. Versões e hospedagem poderão ser atualizadas conforme o desenvolvimento.

## Segurança

Não envie `.env` ao Git nem compartilhe `DATABASE_URL` em issues ou conversas. Ao implantar, usar o gerenciador de segredos do provedor. Não conectar esta aplicação ao banco de produção do Uorqui legado.
