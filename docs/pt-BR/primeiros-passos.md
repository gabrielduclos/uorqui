# Primeiros passos (estrutura de desenvolvimento)

[Português](primeiros-passos.md) · [English](../en/getting-started.md)

> Esta base de desenvolvimento **ainda não é uma rede social funcional**. Autenticação, endpoints persistentes, voz e feed de conteúdos não foram implementados.

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

## Conectar ao banco Neon existente

1. No painel da Neon, abra o projeto `uorqui` já existente (região São Paulo); o PostgreSQL `uorqui` foi provisionado e testado com uma consulta SQL somente de leitura. As tabelas **ainda não foram criadas**.
2. Copie `apps/api/.env.example` para `apps/api/.env`.
3. Defina `DATABASE_URL` usando a URI completa de conexão fornecida pela Neon.
4. Revise a migração inicial **já gerada** em `apps/api/drizzle/0000_nice_machine_man.sql` e seus metadados em `apps/api/drizzle/meta/`. Use `npm run db:generate` somente quando o schema Drizzle mudar.
5. A migração passou no teste de criação de tabelas em **branch temporária da Neon**. O banco principal `main` continua vazio. **Não aplicar em main sem revisão e autorização explícita.**
6. Após aprovação, aplicar via `npm run db:migrate` com `DATABASE_URL` privada, preservando o histórico do Drizzle; não aplicar manualmente o mesmo SQL e depois rodar `db:migrate`.

Migrações **alteram a estrutura do banco**, e não são executadas automaticamente ao iniciar a aplicação. O schema atual descreve usuários, perfis, conversas individuais/mensagens, comunidades e membros, sem endpoints nem autenticação.

## Verificações

```sh
npm run typecheck
npm run build
```

A API Node e a interface Vite são workspaces npm separados. Versões e hospedagem poderão ser atualizadas conforme o desenvolvimento.

## Segurança

Não envie `.env` ao Git nem compartilhe `DATABASE_URL` em issues ou conversas. Ao implantar, usar o gerenciador de segredos do provedor. Não conectar esta aplicação ao banco de produção do Uorqui legado.
