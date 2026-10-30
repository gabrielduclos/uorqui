# Arquitetura — stack principal aprovada e integrações propostas

[Português](arquitetura.md) · [English](../en/architecture.md)

> Existe uma estrutura local inicial React/Fastify e um schema Drizzle. **PostgreSQL provisionado e testado na Neon; não existem tabelas/migrações nem aplicação publicada.**

## Abordagem

Começar com um **monólito modular**: uma API implantada com módulos e limites claros. Separar as partes de mídia e voz em serviços específicos ou gerenciados apenas quando houver necessidade justificada.

## Stack principal aprovada — decisão de 30/10/2026

| Camada | Decisão | Função |
| --- | --- | --- |
| Web/PWA | **React + TypeScript + Tailwind CSS** | Interface responsiva, acessível, componentes e estilização |
| API | **Node.js + Fastify + TypeScript** | Endpoints HTTP, validação e autorização |
| Banco | **PostgreSQL hospedado na Neon** | Dados relacionais de usuários, publicações, comunidades, conversas e permissões |
| Acesso ao banco | **Drizzle ORM + Drizzle Kit** | Consultas SQL tipadas, schema e migrações versionadas |

Essas escolhas estão **aprovadas para o novo Uorqui**, mas **o projeto Neon e o scaffold já foram criados; migrações e deploy de produção ainda não foram executados**.

### Integrações ainda em avaliação

| Camada | Candidato | Situação |
| --- | --- | --- |
| Eventos em tempo real | WebSocket | Proposta; definir infraestrutura e semântica de entrega |
| Salas de voz | WebRTC + LiveKit ou equivalente | Proposta; validar custos, hospedagem e suporte mobile |
| Mídias/vídeos | Armazenamento de objetos, transcodificação e CDN | Proposta; escolher fornecedores e cotas |
| Presença e distribuição de eventos | Redis | Opcional, quando houver necessidade |
| Hospedagem | A definir | Deve ficar separada da produção do Uorqui legado |

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
