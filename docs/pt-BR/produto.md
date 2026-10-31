# Requisitos do produto — versão inicial

[Português](produto.md) · [English](../en/product.md)

**Status:** planejamento. Este documento descreve requisitos, não funcionalidades já implementadas.

## Navegação

Áreas principais: **Feed**, **Conversas**, **Comunidades** e **Perfil**. Busca, notificações e configurações são globais. Versões mobile e desktop usam os mesmos conceitos, com layouts adaptados.

## 1. Mensageiro individual

- Exatamente dois participantes por conversa privada; **sem grupos tradicionais**.
- Recursos iniciais: texto, anexos com limites, respostas, reações, estados de entrega/leitura, notificações e histórico.
- Segurança: bloqueio, denúncia, solicitação de conversa, limites por usuário e permissões verificadas no servidor.
- Diferenciar enviado, entregue, lido e falhou; não prometer criptografia ponta a ponta sem implementação e revisão.

## 2. Feed híbrido

- **Rolagem vertical contínua** de publicações com alturas variáveis: texto, fotos, carrosséis e vídeos verticais/horizontais.
- Publicações públicas podem levar às comunidades públicas relacionadas; conteúdo restrito permanece restrito.
- Vídeos podem iniciar automaticamente **sem som** quando visíveis, somente um ativo por vez; pré-carregamento econômico.
- Preservar a posição do feed ao abrir publicação, perfil ou vídeo imersivo e retornar.
- Descoberta inicial: filtros **Para você** e **Seguindo**; classificação compreensível e simples antes de IA complexa.

## 3. Modo imersivo Vídeos

- Acesso **direto** por atalho/filtro do feed e **ao abrir um vídeo elegível**.
- A abertura a partir do feed começa pelo **vídeo selecionado**.
- Experiência em tela cheia, **exclusivamente de vídeos**, com navegação vertical de um vídeo por vez; só termina quando o usuário sair.
- Controles de compartilhamento, comentários, reações, perfil e comunidade autorizada.
- Ao sair, restaurar a posição original do feed; acesso direto tem retorno coerente próprio.
- **Vídeos é nome provisório. Não adotar “Reels” como nome oficial.**

## 4. Comunidades

- Pública/aberta, pública com aprovação ou privada por convite.
- Diversos **canais de texto** e **salas de voz**, cargos, permissões, convites, moderação e denúncias.
- Voz poderá continuar ao navegar conforme limitações de sistema/navegador. Outras mídias devem iniciar silenciadas durante a sessão.
- Usuários sem autorização nunca acessam canais, mídias, notificações nem resultados privados na busca.

## 5. Integração

Uma pessoa encontra uma publicação pública, conhece o autor/comunidade, entra num canal ou sala autorizada e depois pode conversar individualmente. Conteúdos podem ser compartilhados em conversas privadas ou canais permitidos.

## Aceite de segurança e qualidade

Sem vazamento de conteúdo privado; mensagens não podem desaparecer silenciosamente; limites claros de upload; reconexão testada no celular; bloqueio e denúncia; acessibilidade; monitoramento de custos de voz/vídeo.

## Fora do MVP inicial

Grupos tradicionais, lives em grande escala, pagamentos para criadores, marketplace, personalização prioritariamente por IA, federação completa, chamadas de vídeo 1:1 e mídia/voz gratuitas ilimitadas.

## Comunidades reais — etapa inicial

- O Uorqui permite criar comunidades **públicas** (entrada imediata), **por aprovação** (solicitação aceita por owner/admin) e **privadas** (visíveis apenas a membros e convidados). A criação registra automaticamente o proprietário, um canal de texto `#geral` e uma sala de voz `Sala de voz`.
- A lista de comunidades exibe espaços descobríveis e a participação da conta; espaços privados não aparecem para terceiros. Os administradores podem convidar por @usuário, aprovar solicitações de comunidades moderadas e criar até 50 canais de texto/voz.
- Mensagens de texto são persistidas no PostgreSQL, com autor, data, identificador idempotente e limite de 4.000 caracteres. Somente membros podem ler/escrever; atualização da conversa a cada cinco segundos enquanto o canal estiver ativo.
- A sala de voz é um canal **real de estrutura/metadados**, mas a entrada em áudio **ainda depende da etapa WebRTC/RTC**. A interface informa isso explicitamente e não simula chamadas. Anexos e moderação avançada dos canais são próximos incrementos, não funcionalidades prontas.
- Entrada, convites, solicitações e canais possuem autorizações aplicadas na API, sem depender de botões ocultos. Fotos/nomes de perfis privados e fotos bloqueadas nos canais respeitam as autorizações atuais.
- Migração Drizzle `0011_live_communities` acrescenta `communities.description`, `community_channels`, `community_messages` e `community_join_requests`, preservando as tabelas base `communities` e `community_members`.
