# Notas de versão

[English](CHANGELOG.md)

## [Unreleased]

## [0.2.0-beta.15]

- Adiciona galeria de mídias com autorização e paginação nos canais e mensagens diretas, incluindo anexos de respostas e todo o histórico.
- Mantém skeletons de imagens, vídeos e áudios até cada mídia estar pronta; as reações aparecem e animam após todas as mídias da mensagem carregarem, inclusive ao voltar ao app. Reações são otimistas, com reversão em caso de falha, e respeitam a preferência de movimento reduzido.
- Troca equipe por comunidade na interface e permite editar nome, descrição e acesso do canal em um dialog com abas. A mudança vale para o histórico; tornar privado preserva convidados explícitos e quem editou.
- Permite ao responsável atribuir os níveis Moderador ou Membro. Moderadores criam/editam canais acessíveis e enviam convites; a API mantém gestão da comunidade e dos níveis restrita ao responsável. Inclui migração 0007 e índice para paginação da galeria.

## [0.2.0-beta.14]

- Adiciona fotos de usuário e equipe com compactação local para 512 × 512, upload validado no Worker/R2, remoção e autorização por equipe. Amplia compactação para PNG e imagens escolhidas como arquivo; mantém compactação local de vídeos e fallback ao original quando necessário. Inclui migração 0006.

## [0.2.0-beta.13]

- Corrige o dialog de anexos no mobile e adiciona reações persistidas com contadores, remoção individual e SSE em canais, conversas diretas e tópicos. Inclui migração 0005 e testes de autorização e invalidação de cache.

## [0.2.0-beta.12]

- Organiza configurações em dialogs com abas: Perfil, Segurança e Aparência; equipes usam Geral, Membros e Avançado. Preserva formulários ao alternar abas e oferece navegação por teclado, tema e idioma.

## [0.2.0-beta.11]

- Oculta nomes de arquivos em mensagens de áudio e melhora o contraste do botão de finalizar gravação nos dois temas.
- Adiciona leitura persistida por usuário, badges em equipes/canais/conversas diretas e SSE de caixa de entrada para conversas fechadas.
- Marca como lida apenas a conversa visível nas mensagens recentes. Conversas ocultas no mobile preservam os avisos; mensagens próprias e canceladas não entram na contagem.
- Adiciona confirmação e reenvio de e-mail e troca de senha no perfil, validando a senha atual e encerrando as outras sessões.
- Inclui migração 0004, índice para não lidas e verificações de segurança, SSE e interface PT/EN no desktop e mobile.
- O envio depende de RESEND_API_KEY e AUTH_EMAIL_FROM na API; sem configuração, apresenta erro traduzido de entrega.

## [0.2.0-beta.10]

- Aplica fonte global do sistema, referência de 16 px em textos e mensagens, navegação de 14 px com pesos normal/médio e campos acessíveis nos dois temas.

## [0.2.0-beta.9]

- Exige @username único e minúsculo no cadastro, armazena a identificação no usuário da autenticação e preserva identificações existentes pela migração 0003.
- Adiciona SSE autenticado nas conversas diretas e de equipes, LISTEN/NOTIFY do PostgreSQL entre instâncias, recuperação ao reconectar e consultas de contingência.
- Reutiliza o compositor de anexos da main com galeria em lote, câmera, marcação de imagens, Office/documentos, vídeo, gravação de áudio, emoji e localização atual.
- Adiciona uploads e downloads privados no R2 pelo preview do Worker main, com verificação de acesso, intervalos de bytes e bloqueio dos anexos ao cancelar uma mensagem.
- Valida permissões da API, SSE por HTTP, sessões revogadas, entrega entre instâncias e mídias no desktop e mobile.

## [0.2.0-beta.8]

- Adiciona gestão pelo responsável para renomear equipes, listar membros e convidados, remover acessos e confirmar a exclusão pelo nome. Equipes e canais excluídos ficam inacessíveis, mantendo os dados armazenados.
- Adiciona conversas privadas entre duas pessoas, únicas por dupla, com envio otimista, tópicos, edição e cancelamento de mensagens.
- Adiciona edição de nome, identificação pública única e biografia, perfil público compartilhável e acesso pelo nome do autor das mensagens. O e-mail permanece privado.
- Adiciona a migração 0002 para perfis, conversas diretas e exclusão lógica de equipes, com testes de autorização e concorrência.

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
