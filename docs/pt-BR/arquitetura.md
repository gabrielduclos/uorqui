# Arquitetura — implementação do beta técnico e próximas etapas

[Português](arquitetura.md) · [English](../en/architecture.md)

> **Versão `0.1.0-beta.1`.** O PWA e a API Fastify estão publicados para testes controlados na Cloudflare/Render com PostgreSQL Neon. Não é lançamento público estável; testes de e-mail e aparelhos reais continuam pendentes.

## Abordagem

Começar com um **monólito modular**: uma API implantada com módulos e limites claros. Separar as partes de mídia e voz em serviços específicos ou gerenciados apenas quando houver necessidade justificada.

## Stack principal aprovada — decisão de 30/10/2026

| Camada | Decisão | Função |
| --- | --- | --- |
| Web/PWA | **React + TypeScript + Tailwind CSS no Cloudflare Workers Static Assets** | SPA distribuída por CDN, interface responsiva e gateway de API no mesmo domínio |
| API | **Node.js + Fastify + TypeScript** | Endpoints HTTP, validação e autorização |
| Banco | **PostgreSQL hospedado na Neon** | Dados relacionais de usuários, publicações, comunidades, conversas e permissões |
| Acesso ao banco | **Drizzle ORM + Drizzle Kit** | Consultas SQL tipadas, schema e migrações versionadas |

Essas tecnologias estão **implementadas no beta técnico atual**. A troca do domínio oficial é uma operação separada, que deve ser confirmada antes de anunciar `uorqui.app` como migrado.

## Hospedagem web e fronteira com a API

O **React está configurado para Cloudflare Workers Static Assets** (`apps/web/wrangler.jsonc`), com fallback SPA e um pequeno Worker que encaminha `/api/*` e `/health*` à API Fastify. As chamadas continuam no mesmo domínio do front-end, facilitando cookies de sessão de primeira parte. A API Node.js/Fastify permanece separada, com conexão PostgreSQL Neon; o Worker não executa o servidor Fastify nem contém credenciais do banco.

O proxy exige `API_ORIGIN` antes de encaminhar chamadas. Sem ela, as rotas de API retornam 503, não o HTML da SPA. Para login real, `AUTH_BASE_URL` e `WEB_ORIGIN` devem coincidir com a origem pública do novo Worker. **O Worker `main` é publicado pelo Cloudflare Builds e a API Fastify está no Render (`uorqui-social-api`).** O domínio será migrado por procedimento reversível, mantendo os bancos antigos isolados. [Guia Workers](cloudflare-workers.md).

## Decisões de autenticação

**Escolhido:** Better Auth (e-mail/senha e sessões por cookies), integrado ao Fastify e ao Drizzle PostgreSQL. A autenticação usa tabelas próprias `user`, `account`, `session` e `verification`; o esquema social mantém `users`, `profiles`, conversas e comunidades. O ID UUID da conta autenticada passa a identificar o perfil social quando o onboarding protegido é concluído.

- As tabelas de autenticação estão versionadas na migração `0001`, **aplicada e verificada na Neon main**, com dois registros no histórico do Drizzle.
- A API usa pool PostgreSQL, origem confiável restrita, cookies de sessão, validação no servidor e mínimo de 8 caracteres para senhas.
- `AUTH_SECRET` e `DATABASE_URL` não entram no repositório público.
- O cadastro público em produção depende de ativação explícita e configurações de Resend e Turnstile; continuam pendentes os testes positivos de confirmação e recuperação com uma conta real.
- Cadastro, sessão, leitura protegida, onboarding, entradas inválidas, duplicidade e logout **passaram em teste de integração com PostgreSQL temporário no GitHub Actions**; a saúde da Neon principal e o acesso anônimo são verificados separadamente; o CI usa PostgreSQL descartável e não comprova confirmação real de e-mail.

### Componentes implementados e avaliações pendentes

| Camada | Candidato | Situação |
| --- | --- | --- |
| Eventos em tempo real | **Server-Sent Events (SSE)** | Implementado para atualizações de conversas e canais; validar reconexão em celulares |
| Salas de voz | **WebRTC P2P (malha)** | Implementado para salas pequenas; TURN e segundo plano precisam de testes reais |
| Mídias/vídeos | **Cloudflare R2** | Uploads protegidos implementados; validar transcodificação, cotas e custos |
| Presença e distribuição de eventos | Redis | Opcional, quando houver necessidade |
| Hospedagem do front-end | **Cloudflare Worker `main` (publicado)** | Beta em `main.uorqui1.workers.dev`, migração de domínio verificada em separado |
| Hospedagem da API Fastify | **Render `uorqui-social-api` (publicado)** | Runtime Node.js separado, acessado pelo proxy do Worker |

PostgreSQL e Drizzle armazenam **dados estruturados**, não os arquivos originais de fotos/vídeos. Mídias terão armazenamento próprio, com referências e permissões no PostgreSQL. As cotas e possíveis cobranças da hospedagem devem ser acompanhadas durante a evolução do projeto.

### Desenvolvimento local e configuração

- Versionar migrações com Drizzle Kit; executá-las por processo documentado, sem alterações automáticas no startup.
- Separar bancos/branches de desenvolvimento, teste e produção quando disponíveis.
- Manter `DATABASE_URL` e credenciais em variáveis de ambiente; adicionar somente um `.env.example` seguro quando existir código.
- Usar queries parametrizadas e autorização nos serviços Fastify, nunca apenas no cliente React.
- Priorizar SQL e índices bem definidos antes de adicionar cache ou fila. Medir desempenho de consultas e conexões.


## Módulos e limites

**Identidade e perfis:** contas, autenticação e relacionamentos. **Mensagens individuais:** conversas de duas pessoas e recibos. **Comunidades:** membros, papéis, canais e convites. **Feed:** posts, seguidores, classificação e permissões. **Mídia:** uploads, processamento, cotas e acesso assinado. **Voz:** salas, participantes e moderação. **Confiança e segurança:** denúncias, bloqueios, limites e auditoria. **Notificações:** estado de entrega e conteúdo adequado à privacidade.

## Entidades iniciais (rascunho)

user, profile, follow, direct_conversation, direct_message, community, member, role, channel, channel_message, voice_room, presence, post, media_asset, comment, reaction, notification, report, moderation_action.

## Segurança obrigatória

- Toda autorização de conteúdo e participação deve ser conferida **no servidor**, não apenas ocultada pela interface.
- Nunca expor comunidades privadas por recomendação, miniatura, URL compartilhada de mídia, busca ou push.
- Aplicar rate limits, validação de arquivos, estratégia de verificação de conteúdo, segredos seguros e auditoria.
- Adotar URLs de mídia com duração curta quando necessário; credenciais e dados reais não entram no Git.
- Definir retenção, exclusão/exportação, backups, testes de restauração e migrações.
- Não alegar criptografia ponta a ponta antes de implementação revisada.
- Implementar denúncias e ferramentas de moderação antes da abertura pública.

## Confiabilidade e custos

Definir estados de entrega/leitura, paginação, envios idempotentes, reprodução de eventos após reconexão, regras de push e funcionamento offline antes de programar. Medir armazenamento/transferência e participantes-minuto de voz desde o início. A continuidade de áudio em PWA varia entre sistemas; testar em aparelhos reais antes de garantir suporte.

## Desenvolvimento e implantação

Migrações versionadas; lint e testes unitários, de integração e E2E; CI em PRs; instruções de desenvolvimento local quando existir código; notas de versão e rollback. Alterações de decisões devem manter os documentos em inglês e português alinhados.

## Separação do legado

O mensageiro empresarial anterior funciona separadamente. **Não conectar** este projeto a bases, credenciais, Workers ou domínio da aplicação antiga sem migração futura explicitamente aprovada.
