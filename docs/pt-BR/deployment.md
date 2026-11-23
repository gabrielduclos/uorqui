# Publicação

[English](../en/deployment.md) · [README](../../README.pt-BR.md)

## Render e Neon

Crie um serviço web separado no Render para o Workplace. Configure a branch do Workplace e use a raiz do repositório como diretório do serviço. Use Node.js 22 ou superior.

| Configuração | Valor |
| --- | --- |
| Build | `npm ci && npm run build -w @uorqui/workplace-api` |
| Migração | `npm run db:migrate -w @uorqui/workplace-api` |
| Inicialização | `npm run start -w @uorqui/workplace-api` |
| Verificação de saúde | `/health/ready` |

Use variáveis privadas no Render para `DATABASE_URL` e `AUTH_SECRET`. Defina `WEB_ORIGIN` com a origem HTTPS exata do Worker do Workplace.

Valide a migração em uma branch de desenvolvimento isolada no Neon, no banco `uorqui`. A migração usa os esquemas `uorqui_workplace` e `uorqui_workplace_migrations`. Execute-a como comando de pré-publicação ou em uma operação avulsa antes de iniciar o serviço. A credencial de migração precisa poder criar os esquemas. Após a migração, provisione a primeira conta pela linha de comando.

## Cloudflare Workers Builds

Crie um Worker apontando para a branch do Workplace. Use `apps/web` como diretório raiz, `npm run build` como comando de build e `npx wrangler deploy` como comando de publicação. Defina a variável `API_ORIGIN` do Worker com a origem HTTPS do serviço no Render. O Worker serve os arquivos do Vite e encaminha `/api/*` na mesma origem da interface, incluindo os cookies de autenticação.

Use um endereço dedicado ao Workplace. Alterações no DNS de produção ou nos serviços existentes ficam fora da configuração desta branch.

## Escopo do beta

As contas podem ser criadas na tela de entrada com nome, e-mail e senha de 8 a 128 caracteres. Novas contas começam com a lista de equipes vazia e podem criar uma equipe ou aceitar um convite. O sistema gera links vinculados ao e-mail, com validade de 48 horas, para envio manual pelos responsáveis da equipe. Envio automático de e-mail, verificação da caixa postal, recuperação de senha e revogação administrativa ficam fora deste beta. Equipes e clientes recebem novas mensagens por consultas periódicas.
