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

As contas podem ser criadas na tela de entrada com nome, @username único, e-mail e senha de 8 a 128 caracteres. Novas contas começam com a lista de comunidades vazia e podem criar uma comunidade ou aceitar um convite. O sistema gera links vinculados ao e-mail, com validade de 48 horas, para envio manual pelos responsáveis da comunidade. Confirmação de e-mail e troca de senha estão disponíveis no perfil. Recuperação sem a senha atual e envio automático de convites ficam fora deste beta. Conversas abertas de comunidades e mensagens diretas recebem invalidações por SSE em tempo real.


## Cache

O cache da aba mantém até 100 entradas por cinco minutos. Comunidades e listas de canais recentes são reutilizadas por 60 segundos, mensagens por oito segundos e páginas antigas do histórico por cinco minutos. Leituras simultâneas iguais compartilham uma requisição. Cancelar uma tela preserva a requisição de outra tela. Mudanças de autenticação limpam o cache, e eventos entre abas invalidam dados após alterações. Respostas privadas mantêm HTTP no-store.

Conversas abertas usam uma conexão SSE autenticada por canal, compartilhada pela conversa e seu tópico. Os eventos invalidam páginas de mensagens em cache; as leituras continuam verificando permissões. A conexão ativa suspende as consultas periódicas de mensagens. Quando o SSE está desconectado, uma consulta de contingência ocorre a cada trinta segundos. Telas ocultas fecham suas conexões e pausam consultas, atualizando ao retornar. Listas de canais e conversas diretas mantêm atualização a cada sessenta segundos. Gravações bem-sucedidas invalidam os dados afetados imediatamente.

A API possui cache de mensagens em memória do processo, válido por cinco segundos e limitado a 100 páginas. Toda requisição verifica sessão e permissões do canal antes de usá-lo. Envios bem-sucedidos invalidam todas as páginas daquele canal na instância que os processou. Outras instâncias expiram suas entradas em até cinco segundos. Reinicializações descartam o cache.

Arquivos JavaScript e CSS com hash usam cache imutável no navegador por um ano. O HTML inicial e os dados privados da API mantêm suas políticas próprias.

O campo de mensagem começa em uma linha e cresce até 160 px. Envios aparecem imediatamente com estado pendente e opção de nova tentativa. Envios pendentes e falhos persistem na navegação em memória da aba e são limpos nas mudanças de autenticação. O autor pode editar mensagens enviadas ou confirmar o cancelamento. O texto cancelado é apagado e substituído por indicação traduzida, preservando as respostas do tópico. Novas tentativas usam o mesmo identificador para evitar mensagens duplicadas. Aplicar a migração 0001 antes de publicar esta API. Mensagens existentes sem identificador de cliente permanecem compatíveis.


## Comunidades, mensagens diretas e perfis

Aplique a migração 0002 antes de iniciar esta versão. Ela adiciona `profile`, `direct_conversation`, permite `channel.team_id` nulo e inclui `team.deleted_at`. Os canais normais continuam vinculados às comunidades; canais diretos não possuem comunidade e são únicos por dupla ordenada de participantes.

O responsável pode renomear a comunidade e remover membros ou convidados de canais privados. A remoção também revoga seus convites existentes para a comunidade. O responsável não pode remover a si mesmo. A exclusão exige o nome atual da comunidade, registra a data de exclusão e bloqueia os acessos e convites da comunidade e seus canais. Os dados são mantidos por exclusão lógica. Conversas diretas permanecem independentes da participação em comunidades.

O botão de perfil permite editar nome, identificação pública única e biografia. A identificação aceita de 3 a 24 letras minúsculas, números ou sublinhado; a biografia permite 500 caracteres. Ao salvar uma identificação, nome, identificação e biografia ficam disponíveis em `/#profile=identificacao`, sem exigir login. O e-mail permanece privado. Uma pessoa conectada pode iniciar uma conversa direta pelo perfil, pelo autor de uma mensagem ou pela lista de mensagens diretas. Essas conversas reutilizam as permissões e o comportamento das mensagens dos canais.


## Tempo real e anexos privados

Aplique a migração 0003 antes de iniciar esta versão. Ela adiciona `user.handle` único, copia identificações públicas existentes, adiciona localização estruturada às mensagens e cria a tabela de metadados dos anexos. O cadastro passa a exigir `handle`; a autenticação o salva com o novo usuário. A ferramenta de provisionamento recebe e-mail, nome e identificação como argumentos. Contas antigas sem identificação podem defini-la no perfil.

Defina `REALTIME_DATABASE_URL` no Render com uma conexão direta, sem pooler, para o mesmo banco e usuário do Neon. O listener usa uma conexão dedicada enquanto houver clientes SSE e a encerra quando o último sair. Gravações de mensagens publicam invalidações no PostgreSQL para as outras instâncias da API. As conexões enviam um heartbeat a cada vinte segundos, verificam permissões do canal e validade da sessão nas atualizações e pelo menos uma vez por minuto, encerrando ao expirar ou perder acesso. Ao reconectar, todas as páginas de mensagens já abertas são atualizadas. Durante uma falha do listener do banco, a entrega local e a atualização periódica de recuperação continuam disponíveis.

O preview vincula `FILES` ao bucket privado R2 `uorqui-workplace-files` em `previews.r2_buckets`. Configure o mesmo `FILES_SECRET`, gerado de forma independente, no Render e no preview existente do Worker. Para configuração manual, use `wrangler preview secret put FILES_SECRET --name feat/enterprise-channels`. Preserve os vínculos e a publicação de produção.

O compositor (+) foi trazido da main, incluindo edição de imagem e compactação local de mídia. Ele oferece até dez fotos da galeria, câmera, imagens, vídeo, gravação de áudio, PDF/texto/ZIP/Office, emoji e localização atual estruturada. Cada anexo aceita até 50 MB após a compactação opcional; vídeos da galeria de até 300 MB podem ser processados localmente. Aplicam-se as permissões e os codecs disponíveis no navegador. Esta versão não integra uma galeria de GIFs de provedor; arquivos GIF podem ser anexados.

O envio primeiro reserva metadados na API. O Worker autoriza a requisição, transmite os bytes com tamanho exato ao R2 e confirma o upload por um endpoint interno autenticado. Somente o autor pode enviar um arquivo reservado. A publicação da mensagem vincula os arquivos prontos em uma transação. O download exige acesso à conversa e uma mensagem entregue e não cancelada; intervalos de bytes permitem reprodução de mídia. Cancelar a mensagem bloqueia downloads posteriores dos seus anexos. Os arquivos permanecem armazenados. Bytes de uploads não publicados são mantidos, com autorização de upload pendente limitada a 24 horas; a limpeza automática de órfãos fica fora desta versão. Respostas de mídia usam private no-store e cabeçalhos seguros de download. O bucket não possui endereço público de entrega.

Operações de arquivos exigem o Worker e seu vínculo R2; o proxy padrão de desenvolvimento do Vite direto para a API não fornece armazenamento de arquivos. A validação completa de mídia usou Worker/R2 locais e PostgreSQL 17, incluindo notificações entre duas instâncias da API, além dos testes de regressão via PGlite.

Referências: [pool de conexões do Neon](https://neon.com/docs/connect/connection-pooling), [configuração do preview](https://developers.cloudflare.com/workers/previews/configuration/) e [API R2 para Workers](https://developers.cloudflare.com/r2/api/workers/workers-api-reference/).


## Segurança da conta e mensagens não lidas

Aplique a migração 0004 antes desta versão. Ela adiciona um cursor de leitura por usuário/canal e um índice por canal/cursor nas mensagens. `/health/ready` verifica essa tabela e informa `emailConfigured`, sem expor credenciais.

Configure `RESEND_API_KEY` e `AUTH_EMAIL_FROM` no serviço da API. O remetente/domínio precisa estar verificado no Resend. Com a configuração ativa, o cadastro envia um link de confirmação válido por uma hora; contas existentes podem solicitar outro no perfil. O servidor fixa a origem de retorno e mostra o resultado de confirmação ou link inválido/expirado. Falhas não são exibidas como sucesso. A ausência da configuração não bloqueia contas existentes nem a troca de senha. O aceite do Resend não garante entrega na caixa de entrada. A confirmação registra o estado do e-mail, sem impedir o login de contas ainda não confirmadas.

A troca exige a senha atual e uma nova senha de 8–128 caracteres, confirmada no formulário. O servidor renova o cookie da sessão atual e encerra todas as sessões anteriores, sem devolver o token ao JavaScript da aplicação. Os campos são limpos após sucesso. Recuperação sem a senha atual ainda não está implementada.

A contagem inclui mensagens não canceladas de outros autores, inclusive respostas em tópicos, apenas em canais acessíveis. O cursor avança sem regredir até a fotografia de dados retornada com a página de mensagens. Abrir as mensagens recentes reconhece a atividade do canal, incluindo seus tópicos. A conversa precisa estar visível, em foco e no fim da rolagem. Conversas ocultas no mobile e abas em segundo plano não marcam leitura. Mensagens recebidas depois daquela consulta permanecem não lidas.

Um SSE autenticado de caixa de entrada invalida as contagens e a lista de conversas diretas nos canais permitidos, inclusive os fechados. Ele pausa quando a aba fica oculta, atualiza ao reconectar, verifica a sessão nos eventos e a cada minuto e usa consulta a cada trinta segundos durante desconexão. As consultas compartilham o cache de oito segundos e o isolamento entre contas. O reconhecimento de leitura publica uma invalidação para outros dispositivos. O SSE de caixa de entrada não transmite corpos de mensagens nem identificadores de canais privados.


## Reações

A versão 0.2.0-beta.13 exige migração 0005. Reações são únicas por mensagem, usuário e emoji; o endpoint autenticado recebe o estado desejado para permitir tentativas idempotentes. A autorização do canal é verificada antes de ler ou alterar reações. As alterações invalidam o cache e publicam SSE. Canceladas não exibem nem aceitam reações.


## Fotos e mídia

A versão 0.2.0-beta.14 exige migração 0006. Perfil e comunidade oferecem alterar/remover foto. A imagem é recortada no centro para 512 × 512 e reencodificada no aparelho antes do upload (máximo final 1 MB). O Worker verifica assinatura e tamanho. Fotos de perfil acompanham a visibilidade pública do perfil; fotos de comunidades exigem acesso como membro ou convidado. URLs novas evitam cache antigo. Objetos substituídos ficam inacessíveis; limpeza física fica fora deste beta. Fotos JPEG/PNG/WebP/HEIC decodificáveis acima de 300 KB usam WebP de até 2048 px se reduzir ao menos 10%; GIF mantém animação. Vídeos acima de 8 MB usam o compactador local existente, com fallback ao original se o navegador não suportar ou não houver economia. O limite final é 50 MB.


## Galeria, carregamento de mídias e permissões da comunidade

A versão 0.2.0-beta.15 exige migração 0007. A galeria usa `/api/channels/:channelId/media`, com 48 itens por página e cursor `(ID da mensagem, ID do anexo)`, do mais novo ao mais antigo. Retorna somente anexos concluídos de mensagens não canceladas, incluindo respostas; cada página verifica o acesso atual ao canal. Um índice parcial evita varrer uploads de outras conversas. O download privado pelo Worker continua verificando autorização separadamente.

Cada imagem, vídeo ou áudio mantém skeleton até o elemento estar pronto. Ao restaurar página ou visibilidade, o estado do elemento em cache é conferido sem forçar novo download. As reações aguardam todas as mídias da mensagem; mensagens só de texto reagem imediatamente. O estado otimista altera apenas a reação do próprio usuário e reverte falhas, preservando as reações dos demais. Animações de entrada e contagem respeitam movimento reduzido.

A interface passa a usar comunidade; nomes de tabelas e URLs da API permanecem. O responsável atribui Membro ou Moderador, sem rebaixar/remover responsáveis. Moderadores criam canais, editam canais da comunidade aos quais têm acesso e enviam convites, mas não renomeiam/apagam a comunidade, alteram sua foto, removem pessoas ou atribuem níveis. Conversas diretas não podem ser editadas pelas rotas de comunidades. Ajustes do canal usam abas Geral e Acesso. A mudança vale para o histórico: tornar privado preserva convidados explícitos e dá acesso a quem editou; abrir à comunidade libera o histórico aos membros. O formulário explica isso antes de salvar.
