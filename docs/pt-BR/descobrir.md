# Decisão de produto — Descobrir no lugar do feed

> Substituída em 5 de novembro de 2026: Descobrir saiu da navegação. O espaço reúne Mensagens, Comunidades e Email. A busca de comunidades públicas fica dentro de Comunidades. Consulte [interface do espaço](sprintrix-workspace-ui.md) e [email](email.md). O restante registra a decisão anterior.

[Português](descobrir.md) · [English](../en/discover.md)

**Decisão:** 2 de novembro de 2026. **Estado:** primeira implementação no código da branch `main`: Descobrir, recomendações, atividade autenticada, navegação e onboarding. **Publicação em produção e testes em aparelhos ainda não confirmados.** Feed e dados antigos foram preservados para compatibilidade.

## Proposta de valor

O Uorqui é uma plataforma social centrada em **comunidades, conversas individuais e participação em tempo real**. A navegação principal será **Descobrir · Mensagens · Comunidades**, com Perfil, busca, notificações e configurações acessíveis sem transformar o perfil em uma linha do tempo pública.

**Não haverá feed global de publicações**. Remover da experiência principal os filtros «Para você»/«Seguindo», criação/curtida/comentários de posts globais, galeria pública de posts no perfil e modo de vídeos curtos em rolagem infinita. Imagens, vídeos, links, áudio e arquivos continuam disponíveis **dentro das conversas e canais das comunidades**. Não confundir a remoção de posts globais com a remoção de mensagens ou mídias compartilhadas em canais.

## Tela inicial: Descobrir

1. **Acontecendo agora:** salas de voz com participantes ativos e atividades recentes dos canais **das comunidades das quais o usuário participa**. Mostrar nome da comunidade, canal, tipo de atividade e contagens reais quando autorizadas. Atalhos abrem o canal ou a sala; nunca entram no áudio sem ação explícita do usuário.
2. **Comunidades recomendadas:** comunidades públicas e descobríveis com nome, foto, descrição, categoria/interesses e dados reais de participação/atividade. Recomendações inicialmente simples e explicáveis, por categoria, idioma, interesses e popularidade; sem algoritmo opaco de engajamento. Comunidades privadas não aparecem sem autorização.
3. **Busca e exploração:** busca por nome/tema/categoria; visualização da página pública da comunidade e ações adequadas à regra de acesso: entrar, solicitar entrada ou aceitar convite.
4. **Estados novos e vazios:** quem ainda não participa de comunidades vê busca e comunidades públicas recomendadas. Não inventar presenças, mensagens nem contadores. Não depender de uma massa crítica de posts para a tela ter valor.

**Prioridade de exibição:** atividades das próprias comunidades primeiro quando existirem; recomendações e busca continuam visíveis. Não misturar conteúdo de canais privados ou de pessoas bloqueadas nos resultados. Notificações e badges direcionam ao canal específico sem marcar leitura prematuramente.

## Requisitos de experiência e segurança

- Atualizações por eventos em tempo real quando disponíveis, com fallback controlado e estados de carregamento; contagens e participantes derivam do servidor, não de dados simulados.
- Respeitar permissões de comunidade, canal e usuário no backend, inclusive para títulos, detalhes, prévias e contadores. Não vazar conteúdos privados em recomendações, busca nem atividade.
- Garantir layouts mobile-first e desktop, acessibilidade, estados vazios, Light/Dark e PT-BR/EN.
- Métrica de sucesso: descoberta de comunidades, entrada/participação real, retorno aos canais, participação em voz e início de conversas — **não tempo de rolagem ou visualizações de feed**.

## Transição a partir do beta com feed

O beta atual possui implementação de feed, posts, perfis com publicações, vídeos, seguidores e contratos de API. Esses recursos são **legado da proposta anterior**, não requisitos da nova navegação.

1. Implementar a tela Descobrir e a navegação, onboarding e links correspondentes sem interromper Mensagens, Comunidades, convites ou chamadas de voz.
2. Revisar telas, deep links de posts e notificações que hoje dependem do feed; definir comportamento de compatibilidade para links antigos.
3. Remover acesso/criação ao feed global e ao modo vídeos somente após migrar as jornadas dependentes.
4. Avaliar armazenamento, retenção e possível exportação de posts antigos; **não excluir tabelas, arquivos R2 nem dados de usuários automaticamente**. Toda remoção de schema exige migração versionada, revisão de privacidade e plano de rollback.
5. Validar a mudança com usuários e testes reais em desktop, Android e iOS/PWA. Atualizar documentação histórica e changelog quando o código for efetivamente publicado.

**Implementado no código:** tela `DiscoverHome`, endpoint `GET /api/v1/communities/discover/activity`, navegação a comunidades/canais, novo onboarding e retirada da galeria pública de posts e controles de seguir do perfil. **Pendente:** validação de produção, migração completa de notificações/links antigos, revisão de retenção e descontinuação técnica dos endpoints e dados de posts.

## Limpeza técnica (2 de novembro de 2026)

Foram removidos os componentes de chat de demonstração não importados (`DemoChatBubble`, `DemoChatMedia`, `DemoImageEditor`, `DemoMessageComposer`) e a galeria antiga não utilizada (`PublicProfilePosts`). A página pública inicial agora apresenta **Descobrir**, não Feed. A tela Descobrir recebeu contenção de largura e cards responsivos para mobile.

**Banco principal Neon — levantamento sem exclusão:** `feed_posts` (5 registros), `feed_media` (4), `feed_comments` (2), `feed_likes` (8), `feed_follows` (2); há também 8 notificações legadas de post/seguidor e nenhuma denúncia de publicação. Esses dados não foram apagados. A implementação de feed permanece acessível por links antigos e precisa de retirada coordenada de rotas, mídia R2, notificações, testes e schema antes de qualquer migração destrutiva. Fazer backup/exportação e testar em uma branch isolada do Neon antes de aprovar a remoção em produção.

**Descontinuação da interface antiga:** o componente `LiveFeed` e o cache exclusivo de sessões do feed foram removidos da interface. Notificações históricas de posts encaminham para o perfil do autor, não para a tela de publicações. Os endpoints e dados históricos de feed permanecem temporariamente no servidor para preservar a possibilidade de exportação e permitir uma migração segura, sem apagamento automático.

## Aposentadoria do feed — migração técnica

O feed global antigo foi removido da navegação. A branch `chore/retire-feed-database-2026-11-02` remove também a API legada, os endpoints de mídia, seguidores, comentários, curtidas e a interface de suas notificações. Uma migração versionada (`0029_retire_global_feed.sql`) apaga somente as cinco tabelas do feed, as notificações históricas relacionadas e três configurações push extintas. A migração preserva identidades, amizades, comunidades, mensagens diretas, denúncias de mensagens, assinaturas push e dados de voz.

**Recuperação:** Neon branch `backup/pre-retire-feed-2026-11-02` (`br-red-star-b6uqrqe4`) contém um snapshot de pré-migração. Os arquivos R2 de feed são mantidos temporariamente no storage; a migração SQL não os exclui. A exclusão R2 deverá ser inventariada e testada separadamente. Nunca restaurar o backup inteiro sobre dados mais recentes sem plano de merge.

## Estado final em produção — 2 de novembro de 2026

A descontinuação foi **concluída**, substituindo os planos e levantamentos históricos acima: PR [#60](https://github.com/gabrielduclos/uorqui/pull/60) integrado à `main`; rotas de feed removidas da API Fastify e do Worker; migração versionada `0029_retire_global_feed.sql` aplicada ao Neon de produção e registrada na tabela `drizzle.__drizzle_migrations` (ID 30). A migração eliminou `feed_posts`, `feed_media`, `feed_comments`, `feed_likes` e `feed_follows`, 8 eventos históricos e três campos antigos de preferências push. Verificações após a migração confirmaram as 67 mensagens privadas, 5 mensagens de comunidades, 4 contas e 2 comunidades existentes, sem alterações nas respectivas tabelas. O teste smoke de produção verificou Render, Cloudflare, Neon, autenticação e resposta 404 para as rotas antigas do feed.

**Backups preservados:** `backup/pre-retire-feed-2026-11-02` (`br-red-star-b6uqrqe4`) e `backup/pre-feed-drop-prod-2026-11-02` (`br-jolly-cell-b601kly8`). Quatro objetos antigos de mídia no bucket R2 `uorqui-dm-attachments`, sob o prefixo `feed/`, continuam preservados. A exclusão física desses objetos é uma tarefa separada e deve ocorrer apenas após cópia verificada dos arquivos. Testes reais do PWA em iOS e Android seguem pendentes.
