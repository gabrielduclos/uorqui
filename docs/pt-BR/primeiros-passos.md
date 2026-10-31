# Primeiros passos (estrutura de desenvolvimento)

[Português](primeiros-passos.md) · [English](../en/getting-started.md)

> Este é um protótipo de desenvolvimento, **ainda não é uma rede social funcional**. O código de autenticação existe, mas exige configuração e a migração pendente. Voz, mensagens e feed não foram implementados.

## Requisitos

- Node.js 22 ou superior e npm.
- Banco PostgreSQL na Neon é **opcional para abrir a interface inicial e testar a API**. Será necessário para aplicar migrações e realizar consultas reais; gerar migrações não exige acesso ao banco.

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

## Conectar à Neon e à autenticação (somente desenvolvimento local)

O projeto Neon `uorqui` já tem **seis tabelas sociais** e a migração `0000` aplicadas na branch principal. As quatro tabelas do **Better Auth** (`user`, `session`, `account`, `verification`) estão na migração `0001`, **testada apenas numa branch temporária**. **Não aplicar manualmente a 0001 nem executar `db:migrate` em main** sem autorização e conferência, e não iniciar cadastros reais antes disso.

1. Copie `apps/api/.env.example` para `apps/api/.env`.
2. Informe `DATABASE_URL` usando a conexão privada do painel Neon. Nunca publique em código, logs ou issues.
3. Gere `AUTH_SECRET` com `openssl rand -base64 48`, mantenha em segredo e configure `AUTH_BASE_URL=http://localhost:3001` e `WEB_ORIGIN=http://localhost:5173`.
4. **Depois de a migração 0001 ser aprovada e confirmada em main**, use `ENABLE_DEV_SIGNUP=true` apenas no desenvolvimento local e execute `npm run dev`.
5. Acesse `http://localhost:5173`; teste cadastro, login, sessão, nome de usuário e saída. Antes, confirme `http://localhost:3001/health/db` com resposta `connected`.

Endpoints de autenticação sem configuração retornam 503. O cadastro vem desabilitado por padrão e **fica sempre bloqueado quando `NODE_ENV=production`**. Este protótipo **ainda não envia/verifica e-mails nem recupera senha**, funcionalidades obrigatórias antes de liberar usuários publicamente. O Better Auth cuida das senhas e cookies, e a API exige sessão antes de criar perfis.

`GET /health` verifica o processo da API; `GET /health/db` verifica PostgreSQL; `GET /api/v1/me` exige sessão; `POST /api/v1/onboarding` cria o perfil social associado à conta autenticada.

Para futuras alterações, gere uma nova migração com `npm run db:generate`, revise e versione os arquivos, teste em uma branch temporária e aplique com `npm run db:migrate` somente no ambiente autorizado. Não cole manualmente migrações já aplicadas.

## Verificações

```sh
npm run typecheck
npm run build
```

A API Node e a interface Vite são workspaces npm separados. Versões e hospedagem poderão ser atualizadas conforme o desenvolvimento.

## Segurança

Não envie `.env` ao Git nem compartilhe `DATABASE_URL` em issues ou conversas. Ao implantar, usar o gerenciador de segredos do provedor. Não conectar esta aplicação ao banco de produção do Uorqui legado.
