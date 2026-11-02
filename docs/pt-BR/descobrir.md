# Decisão de produto — Descobrir no lugar do feed

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
