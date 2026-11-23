# Notas de versão

[English](CHANGELOG.md)

## [Unreleased]

## [0.2.0-beta.7]

- Adiciona campo de uma linha que cresce com o texto e mensagens otimistas imediatas, incluindo tópicos.
- Preserva envios pendentes e falhos na navegação da sessão e usa identificador estável nas tentativas para evitar duplicações.
- Permite ao autor editar ou cancelar mensagens já enviadas. O cancelamento mantém uma indicação e preserva respostas do tópico.
- Adiciona migração 0001 com identificador do cliente, datas de edição e cancelamento e restrição de unicidade por autor.

## [0.2.0-beta.6]

- Mostra spinner compartilhado nos botões que aguardam o backend, preserva os rótulos, bloqueia cliques repetidos e encerra o estado pendente no sucesso ou erro.

## [0.2.0-beta.5]

- Reaproveita dados na aba e agrupa requisições repetidas, com caches limitados e invalidação após alterações e mudanças de autenticação.
- Atualiza mensagens a cada 10 segundos e canais a cada 60 segundos em primeiro plano, com atualização ao retornar.
- Mantém consultas de mensagens em cache na API por 5 segundos após autenticação e autorização, invalidando ao enviar mensagens.
- Armazena arquivos estáticos versionados por um ano e testa isolamento e concorrência do cache.

## [0.2.0-beta.4]

- Preserva a estrutura estática durante o carregamento e adiciona skeletons compartilhados nos campos de dados, com estados acessíveis e suporte a movimento reduzido.

## [0.2.0-beta.3]

- Aplica o UI kit monocromático nos dois temas e adiciona barra vertical de equipes com iniciais, nomes, seleção e criação de equipe.
- Posiciona os canais ao lado da barra de equipes no desktop e adapta a navegação ao mobile.
- Documenta tokens, componentes, espaçamentos e estados acessíveis nos dois idiomas.

## [0.2.0-beta.2]

- Libera a criação de contas na tela de entrada em português e inglês.
- Preserva convites vinculados ao e-mail e limita novas contas às equipes e canais que criarem ou ingressarem.
- Valida cadastro, tamanho da senha, sessões e isolamento de acesso nos testes de integração.

## [0.2.0-beta.1]

- Inicia a branch independente Workplace com um espaço de trabalho em React e uma API Fastify.
- Adiciona equipes, canais internos, canais privados por convite, tópicos e histórico paginado.
- Adiciona cadastro por convite, links vinculados ao e-mail e acesso de convidados limitado ao canal.
- Adiciona a primeira migração Drizzle em um esquema isolado e testes de integração para permissões e mensagens em tópicos.
