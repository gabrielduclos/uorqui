# Arquitetura — proposta, ainda não implementada

[Português](arquitetura.md) · [English](../en/architecture.md)

> Ainda não existe estrutura executável ou arquitetura em produção neste repositório.

## Abordagem

Começar com um **monólito modular**: uma API implantada com módulos e limites claros. Separar as partes de mídia e voz em serviços específicos ou gerenciados apenas quando houver necessidade justificada.

## Stack candidata (decisão pendente)

| Camada | Candidato | Motivo para avaliação |
| --- | --- | --- |
| Web/PWA | React, TypeScript | Cliente responsivo e acessível; ecossistema consolidado |
| API | Node.js, Fastify | Schemas tipados e autorização controlada |
| Dados | PostgreSQL com Drizzle | Permissões relacionais e migrações |
| Tempo real | WebSocket | Eventos de conversas e canais |
| Estado temporário/presença | Redis (se necessário) | Reconexão e distribuição de eventos |
| Voz | WebRTC + LiveKit ou equivalente | Salas e controles por participante |
| Vídeos/mídias | Armazenamento de objetos, transcodificação, CDN | Entrega controlada de imagens e vídeos |

Estas são **opções**, não tecnologias aprovadas nem instruções de instalação.

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
