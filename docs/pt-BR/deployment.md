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

Valide a migração em uma branch de desenvolvimento isolada no Neon, no banco `workplace`. A migração usa os esquemas `uorqui_workplace` e `uorqui_workplace_migrations`. Execute-a como comando de pré-publicação ou em uma operação avulsa antes de iniciar o serviço. A credencial de migração precisa poder criar os esquemas. Após a migração, provisione a primeira conta pela linha de comando.

## Cloudflare Workers Builds

Use o Worker existente `main` e seu preview nativo para `feat/enterprise-channels`. Use `apps/web` como diretório raiz, `npm run build` como comando de build e `npx wrangler preview` como comando de preview. Defina `previews.vars.API_ORIGIN` com a origem HTTPS do serviço no Render. O Worker serve os arquivos do Vite e encaminha `/api/*` na mesma origem da interface, incluindo os cookies de autenticação.

O preview fica em https://feat-enterprise-channels-main.uorqui1.workers.dev/. Preserve a publicação de produção. O serviço Render se chama `uorqui-workplace-api` e mantém o endereço original `uorqui-workplace-preview-api.onrender.com`.

## Escopo do beta

As contas podem ser criadas na tela de entrada com nome, e-mail e senha de 8 a 128 caracteres. Novas contas começam com a lista de equipes vazia e podem criar uma equipe ou aceitar um convite. O sistema gera links vinculados ao e-mail, com validade de 48 horas, para envio manual pelos responsáveis da equipe. Envio automático de e-mail, verificação da caixa postal, recuperação de senha ficam fora deste beta. Equipes e clientes recebem novas mensagens por consultas periódicas.


## Cache

O cache da aba mantém até 100 entradas por cinco minutos. Equipes e listas de canais recentes são reutilizadas por 60 segundos, mensagens por oito segundos e páginas antigas do histórico por cinco minutos. Leituras simultâneas iguais compartilham uma requisição. Cancelar uma tela preserva a requisição de outra tela. Mudanças de autenticação limpam o cache, e eventos entre abas invalidam dados após alterações. Respostas privadas mantêm HTTP no-store.

Conversas visíveis atualizam a cada dez segundos e listas de canais a cada sessenta segundos. Telas ocultas pausam consultas periódicas. Foco e visibilidade atualizam os dados através do cache. Uma gravação bem-sucedida invalida os dados afetados imediatamente. No funcionamento periódico normal, mensagens recebidas podem levar até dez segundos para aparecer.

A API possui cache de mensagens em memória do processo, válido por cinco segundos e limitado a 100 páginas. Toda requisição verifica sessão e permissões do canal antes de usá-lo. Envios bem-sucedidos invalidam todas as páginas daquele canal na instância que os processou. Outras instâncias expiram suas entradas em até cinco segundos. Reinicializações descartam o cache.

Arquivos JavaScript e CSS com hash usam cache imutável no navegador por um ano. O HTML inicial e os dados privados da API mantêm suas políticas próprias.

O campo de mensagem começa em uma linha e cresce até 160 px. Envios aparecem imediatamente com estado pendente e opção de nova tentativa. Envios pendentes e falhos persistem na navegação em memória da aba e são limpos nas mudanças de autenticação. O autor pode editar mensagens enviadas ou confirmar o cancelamento. O texto cancelado é apagado e substituído por indicação traduzida, preservando as respostas do tópico. Novas tentativas usam o mesmo identificador para evitar mensagens duplicadas. Aplicar a migração 0001 antes de publicar esta API. Mensagens existentes sem identificador de cliente permanecem compatíveis.


## Equipes, mensagens diretas e perfis

Aplique a migração 0002 antes de iniciar esta versão. Ela adiciona `profile`, `direct_conversation`, permite `channel.team_id` nulo e inclui `team.deleted_at`. Os canais normais continuam vinculados às equipes; canais diretos não possuem equipe e são únicos por dupla ordenada de participantes.

O responsável pode renomear a equipe e remover membros ou convidados de canais privados. A remoção também revoga seus convites existentes para a equipe. O responsável não pode remover a si mesmo. A exclusão exige o nome atual da equipe, registra a data de exclusão e bloqueia os acessos e convites da equipe e seus canais. Os dados são mantidos por exclusão lógica. Conversas diretas permanecem independentes da participação em equipes.

O botão de perfil permite editar nome, identificação pública única e biografia. A identificação aceita de 3 a 24 letras minúsculas, números ou sublinhado; a biografia permite 500 caracteres. Ao salvar uma identificação, nome, identificação e biografia ficam disponíveis em `/#profile=identificacao`, sem exigir login. O e-mail permanece privado. Uma pessoa conectada pode iniciar uma conversa direta pelo perfil, pelo autor de uma mensagem ou pela lista de mensagens diretas. Essas conversas reutilizam as permissões e o comportamento das mensagens dos canais.
