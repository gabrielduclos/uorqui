# Primeiros passos (estrutura de desenvolvimento)

[Português](primeiros-passos.md) · [English](../en/getting-started.md)

> Esta base de desenvolvimento **ainda não é uma rede social funcional**. Autenticação, endpoints persistentes, voz e feed de conteúdos não foram implementados.

## Requisitos

- Node.js 22 ou superior e npm.
- Banco PostgreSQL na Neon é **opcional para abrir a interface inicial e testar a API**. Será necessário para migrações e operações reais de dados.

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

## Configurar a Neon depois

1. Crie um projeto gratuito `uorqui` na sua conta Neon; nunca compartilhe a senha ou a URL de conexão publicamente.
2. Copie `apps/api/.env.example` para `apps/api/.env`.
3. Defina `DATABASE_URL` usando a URI completa de conexão fornecida pela Neon.
4. Gere uma migração local **para revisão**: `npm run db:generate`.
5. Revise o SQL gerado antes de executar `npm run db:migrate` no banco correto.

Migrações **alteram a estrutura do banco**, e não são executadas automaticamente ao iniciar a aplicação. O schema atual descreve usuários, perfis, conversas individuais/mensagens, comunidades e membros, sem endpoints nem autenticação.

## Verificações

```sh
npm run typecheck
npm run build
```

A API Node e a interface Vite são workspaces npm separados. Versões e hospedagem poderão ser atualizadas conforme o desenvolvimento.

## Segurança

Não envie `.env` ao Git nem compartilhe `DATABASE_URL` em issues ou conversas. Ao implantar, usar o gerenciador de segredos do provedor. Não conectar esta aplicação ao banco de produção do Uorqui legado.
