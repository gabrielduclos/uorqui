# Notas de versão

O novo Uorqui utiliza [versionamento semântico](https://semver.org/lang/pt-BR/) nos manifestos da aplicação. O sufixo `-beta.N` indica **pré-lançamento** e não uma versão estável ou liberada para todos.

## [Unreleased]

Mudanças posteriores ao marco exigem aumento de versão nos três manifestos npm e atualização dos changelogs. Ver [política de versões](docs/pt-BR/versoes.md).

## [0.1.0-beta.46] — 11/11/2026

- **Menções sem @ no nome:** ao confirmar uma pessoa, o símbolo @ deixa de aparecer no texto do editor e na mensagem publicada. O nome continua clicável e abre o perfil correto.
- **Identidade preservada:** antes do envio, a aplicação converte o nome selecionado para o @username verdadeiro. A dica do link e o texto acessível continuam mostrando o username; notificações e permissões existentes não mudam.
- **Testes:** inserção sem @, preservação da frase, cursor, serialização para o username e link renderizado.
- **Migração:** nenhuma; ajuste exclusivo de interface.

## [0.1.0-beta.45] — 11/11/2026

- **Menções pelo nome:** ao selecionar alguém na lista do canal, o editor passa a exibir o primeiro e o último nome (por exemplo, `@Jessica Pigari`) em vez do username. A associação com o `@username` correto continua preservada internamente, mesmo que existam nomes iguais.
- **Link no nome após o envio:** na mensagem publicada, o nome fica clicável e abre o perfil. O `@username` aparece na dica ao passar o mouse e na descrição acessível do link. Pessoas sem autorização no canal não são transformadas em links, e nomes privados seguem as regras atuais.
- **Notificações preservadas:** texto, legendas de fotos/arquivos e localização são enviados com o `@username` canônico para manter as notificações e permissões atuais. É possível editar o restante da frase; alterações dentro do nome removem o vínculo para impedir notificação indevida.
- **Testes:** nome na escrita, várias menções com nomes repetidos, alterações no texto, legendas e links renderizados.
- **Migração:** nenhuma; formato de armazenamento e API mantidos.

## [0.1.0-beta.44] — 11/11/2026

- **Filtro direto na divisão de datas:** a linha com Hoje, Ontem ou Semana passada fica imediatamente antes da primeira mensagem daquele dia e acompanha a rolagem, sem grudar no topo. Tocar no rótulo abre as opções de período no próprio separador.
- **Pesquisa pelo cabeçalho:** a lupa junto ao nome do canal abre a barra de busca logo abaixo do cabeçalho. Tocar novamente na lupa ou no botão de fechar oculta a barra e limpa o texto. A faixa permanente de pesquisa e filtros foi removida.
- **Saída dos filtros:** quando a pesquisa não encontra mensagens, é possível limpar o filtro de período ou o texto pesquisado. Mudar de canal fecha a busca e reinicia seus controles; as permissões existentes do servidor permanecem inalteradas.
- **Testes:** validação estrutural do separador na posição correta e da pesquisa acionada pela lupa.
- **Migração:** nenhuma; refinamento somente da interface.

## [0.1.0-beta.43] — 11/11/2026

- **Menções autorizadas por canal:** o autocompletar de @usuário mostra só quem pode acessar o canal atual. Canais restritos exigem concessão; canais com senha, desbloqueio (exceto proprietário/admin). Usuários bloqueados ou banidos ficam de fora. A lista atualiza quando as permissões mudam, e menções sem autorização não viram links de perfil. O servidor continua verificando o acesso antes de notificar.
- **Pesquisa e filtros no histórico:** separadores por dia como Hoje, Ontem e Semana passada, campo de pesquisa e seletor de período. A busca ocorre no servidor, inclusive em mensagens anteriores às 100 mais recentes, com paginação. Os filtros consideram o calendário local.
- **Links na descrição:** URLs HTTP/HTTPS válidas ficam clicáveis na descrição fixa do canal, com as regras de navegação e segurança existentes.
- **Testes:** concessão, desbloqueio, revogação e segurança das menções, busca no servidor e agrupamento por data local.
- **Migração:** nenhuma.

## [0.1.0-beta.42] — 11/11/2026

- **Menções no meio de frases:** corrigido o autocompletar de @usuário nos canais depois de espaços ou pontuação, inclusive em trechos já escritos (ex.: `Bom dia @ana`).
- **Cursor e texto preservados:** selecionar um membro substitui apenas a menção ativa sem apagar o restante da frase, preserva o cursor e usa espaço separador quando necessário. A lista também acompanha a mudança de posição do cursor; endereços de e-mail não ativam menções.
- **Exibição e notificações:** links de menções em mensagens passam a reconhecer também letras maiúsculas. As regras existentes de destinatário, permissão e notificação no servidor não foram alteradas.
- **Testes:** cenários de espaços, pontuação, endereços de e-mail, edição no meio do @ e espaçamento. Ainda é importante validar a digitação em aparelhos reais.
- **Migração:** não há; correção somente de interface.

## [0.1.0-beta.41] — 11/11/2026

- **Reorganização de canais:** responsáveis e administradores podem arrastar os canais ou usar botões acessíveis de subir/descer na aba Moderação → Canais. A edição separa canais de texto, voz e reunião e inclui Salvar ordem.
- **Ordem compartilhada e persistente:** nova rota PUT autenticada exige a lista completa, permite alterações somente a responsáveis/administradores e salva as posições em uma transação. A API entrega a ordem salva a todos os membros e avisa os clientes conectados por SSE. Canais novos entram no final.
- **Migração:** aplicar `0047_community_channel_order` antes de publicar a API. A ordem anterior por criação é preservada para os canais existentes. Para reverter, voltar o código da API antes de remover a coluna adicionada.
- **Prévia no Cloudflare:** configura um bloco `previews` vazio no Wrangler para permitir builds de branches sem herdar credenciais nem buckets R2 de produção. Para utilizar API e mídia na prévia, configurar recursos separados de homologação.
- **Testes:** integração cobre permissões, dados duplicados/desatualizados, persistência, visualização por membros e inclusão de novos canais; teste da interface cobre movimentação dentro da categoria. Validar arrastar/soltar em dispositivos reais e a migração no deploy.

## [0.1.0-beta.40] — 10/11/2026

- **Lista de canais mais limpa:** removidos os dois cards redundantes “Mensagens não lidas” da navegação de comunidades e canais, inclusive o painel destacado acima da lista de canais.
- **Indicadores mantidos:** os badges individuais de cada comunidade e canal, o sino, a central de notificações e o indicador no ícone PWA permanecem como estavam. Nenhuma mudança na contagem de não lidas, banco, API ou push.
- **Teste de regressão:** confirma que os cards desapareceram sem eliminar os contadores dos canais; incluído no CI da interface.

## [0.1.0-beta.39] — 10/11/2026

- **Troca de @usuário a cada 15 dias:** cada conta pode alterar o identificador uma vez a cada 15 dias corridos. A escolha inicial no cadastro não consome a troca, e salvar outros campos ou manter o mesmo @ não reinicia o prazo. O servidor usa atualização atômica, devolve HTTP 423 com a próxima data permitida e o formulário desabilita o campo durante a espera.
- **Migração de banco:** `0046_username_change_cooldown` adiciona um campo de data opcional a `users`, preservando os cadastros atuais e permitindo a primeira troca. Executar a migração antes do deploy da nova API; para reverter, voltar o código antes de remover a coluna. Os outros dados do perfil continuam editáveis durante o bloqueio.

- **Padronização dos nomes:** fora da página de perfil, o Uorqui apresenta apenas o primeiro e o último nome (ex.: "Gabriel Axel Fernando de Oliveira Duclos" vira "Gabriel Duclos"). O nome completo continua no perfil público e na edição de perfil.
- **Abrangência:** conversas privadas e suas prévias, canais e respostas, sugestões de menção, contatos, contas bloqueadas, moderação, notificações, menus e participantes de chamadas/reuniões adotam uma função de exibição compartilhada. Títulos de notificações push e nomes de remetentes em convites também seguem a regra no servidor.
- **Sem migração de dados:** nome completo armazenado, identificador @usuário, busca pelo nome original, respostas da API e registros do usuário permanecem intactos. A alteração afeta apenas a apresentação (frontend e texto do push), incluindo títulos e descrições acessíveis; não altera o banco nem os contratos da API.
- **Testes:** novos casos para nomes longos, simples, espaços, acentos e ausência de nome no CI da interface. Validação de ponta a ponta em dispositivos e PWA continua pendente.

## [0.1.0-beta.38] — 10/11/2026

- **Equilíbrio entre produto e portfólio:** READMEs em português e inglês reorganizados como apresentação do produto, com recursos, jornada de uso, arquitetura, execução local, situação operacional e link específico para o portfólio, sem colocar a narrativa de currículo em primeiro plano.
- **Navegação da documentação:** novos índices em português/inglês organizam módulos do produto, desenvolvimento, segurança/operação, versões e estudo de caso separado. Há caminhos distintos para usuários, colaboradores, operações e recrutadores.
- **Portfólio preservado e sem repetição:** o estudo de caso técnico anterior continua disponível com evidências, compromissos de engenharia e transparência sobre ferramentas de IA. O README passa a priorizar o Uorqui como produto.
- **Coerência de versões:** atualização dos três manifestos npm e referências da versão atual nos guias principais e estudo de caso.
- **Impacto:** somente documentação e metadados de versão; nenhum comportamento de execução, banco, API, autorização, Cloudflare ou deploy alterado. Revisar links e navegação nos dois idiomas; validações reais continuam pendentes.

## [0.1.0-beta.37] — 10/11/2026

- **Documentação voltada ao portfólio:** READMEs em português e inglês reorganizados para apresentar problema, recursos atuais, arquitetura, evidências e limites do beta; detalhes técnicos aprofundados em um novo [estudo de caso bilíngue](docs/pt-BR/portfolio.md).
- **Narrativa técnica verificável:** links para módulos reais de frontend/backend, migrações Drizzle, testes, workflows e decisões de arquitetura. Transparência sobre uso de IA no desenvolvimento; métricas de escala, adoção e estabilidade não são afirmadas sem evidências; pendências de validação identificadas.
- **Situação operacional corrigida:** regra ampla de rate limit por IP criada na Cloudflare em 10/11 **desativada no mesmo dia**; proteções DDoS/gerenciadas e autenticação no backend preservadas. A origem inicial dos erros 429 segue sem confirmação.
- **Correções de precisão:** links de reunião separados dos convites de canal fechado e limite de 60 minutos **por sessão**; remoção da afirmação de que o feed global ainda existe; cabeçalhos de versões antigas atualizados nos guias principais.
- **Escopo:** apenas documentação e versões nos manifestos. Nenhuma mudança de código de execução, contrato de API, migração, banco ou deploy. Links e textos em ambos os idiomas devem ser revisados; testes reais e validação de produção ainda pendem.

## [0.1.0-beta.36] — 10/11/2026

- **Consultas de conta deduplicadas:** `App` e `AuthPanel` agora usam um único transporte para `GET /api/v1/me`, evitando requisições simultâneas durante a inicialização e no StrictMode. Respostas 200 podem ser reaproveitadas na mesma aba por até 8 segundos; 401, por apenas 2 segundos. Respostas 429/5xx e erros de rede **nunca** entram no cache. Cada consumidor recebe uma cópia própria da resposta.
- **Sessão preservada e invalidada corretamente:** login concluído e onboarding forçam leitura nova, e logout, exclusão de conta e alteração do perfil invalidam qualquer cópia local. Se um consumidor abortar a espera, a consulta compartilhada continua disponível para os demais; o servidor permanece responsável por autorizar todas as rotas.
- **Diagnóstico por aba sem dados pessoais:** no console do navegador, `window.__uorquiAuthDiagnostics()` mostra quantas chamadas de `/api/v1/me` partiram daquela aba nos últimos 60 segundos, número de consultas evitadas, respostas 429 e último status. **Não** mede outras rotas, outras abas nem usuários no Wi-Fi e não contém cookies, endereços IP ou e-mails.
- **Análise de produção (Render):** nos registros retornados para 10/11/2026 das 11h30 às 12h30 BRT, identificamos quatro entradas `GET /api/v1/me` e nenhum `GET /api/auth/get-session`. Não se confirmou um 429 na API nesse recorte. **A regra WAF da Cloudflare foi criada após os primeiros erros 429 e não pode ser a causa original.** Ela pode bloquear rajadas posteriores de diferentes usuários do mesmo IP, mas o 429 anterior permanece sem origem confirmada.
- **Métrica por conta no Render:** o backend contabiliza chamadas a `/api/v1/me` em janelas de ~60 segundos e escreve uma linha `Account probe volume` com total, contas distintas, máximo/média por conta e até cinco maiores contagens identificadas apenas por chaves HMAC pseudonimizadas. Sem armazenar e-mails, tokens ou IPs nesse contador. Reseta a cada reinicialização.
- **Render Free pode gerar 429 diretamente:** a documentação oficial do Render (`https://render.com/docs/troubleshooting-deploys`) confirma limites de tráfego de entrada significativamente menores para serviços Free e que sua camada de proteção pode emitir HTTP 429 sem a requisição alcançar a aplicação. Portanto, o Render é uma hipótese concreta para os erros originais, sem conclusão definitiva pelos logs atuais.
- **Diagnóstico de 429 por rota:** o Fastify marca 429 próprios com `x-uorqui-rate-limit-scope: application`; Better Auth usa `better-auth`. O frontend registra até 20 respostas 429 da API no navegador; `window.__uorquiRateLimitDiagnostics()` retorna a rota sem identificadores privados, quando ocorreu e se houve `x-uorqui-upstream-429: 1` (API/Render) ou não (borda/origem indeterminada). O identificador da Cloudflare não é suficiente para atribuir origem à regra WAF. Nenhum IP, cookie, query string ou corpo de requisição é retido.
- **Verificação:** suíte automatizada para requisições simultâneas, respostas 401/429/503, transições de autenticação, cancelamento de consumidores e métricas integrada à CI. Nenhuma migração e nenhum aumento adicional nos limites de requisições.

## [0.1.0-beta.35] — 10/11/2026

- **429 e identificação do IP:** auditoria da cadeia Cloudflare Worker → Render → Better Auth identificou dependência direta do cabeçalho `CF-Connecting-IP` no backend, sem prova de origem, e `request.ip` do Fastify representando a conexão com o proxy. Não é possível comprovar a distribuição real dos IPs sem logs do Render.
- **IP verificado sem permitir falsificação:** o Worker assina o IP recebido na borda Cloudflare com HMAC-SHA256 e o segredo compartilhado já utilizado nos anexos (`DM_ATTACHMENT_PROOF_SECRET`), incluindo método, caminho e timestamp. O backend valida assinatura, formato do endereço e validade de 120 segundos; remove cabeçalhos controlados pelo visitante antes de chamar o Better Auth. Chamadas diretas ao Render usam somente o IP da conexão de transporte, não cabeçalhos encaminhados arbitrários.
- **Menos colisões para usuários em uma mesma empresa:** consultas de sessão (`/get-session`) passam a aceitar até 240 chamadas por minuto por endereço de rede. O limite geral de 60/min e as proteções específicas de login, cadastro e recuperação permanecem ativados. Usuários no mesmo Wi-Fi podem continuar compartilhando o mesmo **IP público verdadeiro** (NAT).
- **Diagnóstico sem revelar IPs:** respostas de `/api/auth/*` trazem `x-uorqui-ip-source` (`verified-cloudflare`, `transport` ou `unavailable`). Se houver 429 do Better Auth, também trazem `x-uorqui-rate-limit-scope: better-auth`. O Worker já distingue 429 recebido da API com `x-uorqui-upstream-429: 1`. Logs de 429 na API incluem somente um identificador HMAC abreviado, nunca o IP real.
- **Regressão e implantação:** novo teste valida dois IPs distintos, IPv6, cabeçalhos falsificados, assinatura vencida, rota/método alterados e ausência de segredo. CI incorpora a suíte. Sem alteração de esquema do banco. **Confirmar o header `verified-cloudflare` após atualizar o Worker e a API no ambiente de produção.**

## [0.1.0-beta.34] — 10/11/2026

- **Link reutilizável da reunião separado do convite:** a tela da reunião passa a compartilhar `/?community=<id>&channel=<id>&meeting=1`. Várias pessoas já autorizadas podem abrir o mesmo endereço, sem gerar/consumir token de convite, entrar automaticamente na comunidade ou receber permissão. Login, participação, canal fechado/senha e aprovação da reunião continuam validados pelo servidor. Abrir o link mostra a sala, mas não liga câmera ou microfone automaticamente.
- **Reunião limitada a 1 hora:** o primeiro participante autorizado inicia um prazo único em PostgreSQL (`meeting_expires_at`). Pessoas que entram depois ou reconectam não renovam o tempo. Ao expirar, o servidor bloqueia sinais WebRTC, heartbeat, leitura da sessão e presença. Depois que todos saem, a próxima reunião recebe um novo período de 1 hora.
- **Cronômetro regressivo:** `60:00` no modo normal e minimizado, alerta visual nos últimos cinco minutos e encerramento automático da conexão/mídia local ao zerar, mesmo após retorno do PWA do segundo plano.
- **Migração e testes:** `0045_meeting_one_hour_deadline.sql`, snapshot/journal Drizzle e regressões para link, cronômetro, prazo e permissões. **Migração 0045 aplicada e verificada no Neon principal do Uorqui em 10/11/2026.** Testes em dispositivos reais com vários participantes ainda necessários.

## [0.1.0-beta.33] — 10/11/2026

- **Canal Geral inicia na última mensagem:** no desktop, a primeira sala já visível ao entrar na comunidade agora participa da rolagem inicial automática; a posição continua respeitada quando o usuário navega manualmente no histórico.
- **Convites seguros para canais fechados:** apenas dono/admin ou moderador com acesso ao canal pode criar link de uso único com 24h de validade. Aceitar concede automaticamente participação na comunidade e acesso apenas ao canal convidado, sem dispensar senha ou aprovação de reunião.
- **Links individuais por @usuário:** convite enviado por DM recebe um token próprio vinculado ao ID daquela conta; links copiados são de uso único e podem ser revogados pelo emissor.
- **Segurança:** segredo criptograficamente aleatório de 256 bits, armazenado como SHA-256; enviado em fragmento da URL, confirmado após login, validado no servidor (origem, cargo, destinatário, banimento e expiração). Resgate transacional com bloqueio de linha impede consumo duplicado. Limite de 10 convites pendentes por emissor/canal.
- **Banco e testes:** migração aditiva `0044_restricted_channel_invites.sql` aplicada ao Neon principal e registrada em Drizzle; regressões incluídas no CI. Consulte [modelo de convites de canais fechados](docs/pt-BR/convites-canais-fechados.md). Validação real de login/convite no PWA continua necessária.

## [0.1.0-beta.32] — 10/11/2026

- **Rate limiting Cloudflare Free ativado em produção:** 1 regra WAF `http_ratelimit` da zona protege `/api/*` contra rajadas acima de **120 requisições por IP/ponto de presença da Cloudflare em 10 segundos**, com bloqueio por **10 segundos**. Sem contratar plano pago.
- **Preservação do chat:** `/api/v1/dm/events`, `/api/v1/communities/events` (SSE) e o status público `/api/v1/status` ficam fora da regra. Rotas de saúde não correspondem a `/api/*`. Sem mudanças no contrato de API, R2 ou banco de dados.
- **Operação/reversão:** expressão, IDs, diagnóstico, limites para empresas com IP compartilhado e rollback pela Cloudflare documentados em [Rate limiting da Cloudflare](docs/pt-BR/cloudflare-rate-limiting.md). Reverter Git não remove a regra aplicada na Cloudflare.
- **Limitação:** protege contra rajadas anormais, mas não remove erros HTTP 429 causados por cotas ou limites da infraestrutura Render.

## [0.1.0-beta.31] — 10/11/2026

- **Proteção contra HTTP 429:** autenticação consulta status, prontidão e sessão em sequência, evitando rajadas simultâneas. Ao receber 429, respeita `Retry-After` limitado a 30–180 segundos e informa o problema sem manter o carregamento infinito.
- **Menos chamadas ao backend:** o Worker da Cloudflare guarda somente respostas públicas bem-sucedidas de `/api/v1/status` e `/health/ready` por 15 segundos em cada localidade. Sessão (`/api/v1/me`), mensagens e e-mails não entram no cache. Respostas de erro não são armazenadas.
- **Diagnóstico:** respostas 429 encaminhadas do servidor recebem o cabeçalho `x-uorqui-upstream-429: 1`; respostas das rotas públicas recebem `x-uorqui-probe-cache: HIT|MISS`. Assim, o painel Network diferencia bloqueio do servidor de origem de bloqueio antes do Worker.
- **Limites de infraestrutura:** o Fastify e o proxy não geram 429 nessas rotas; o plano/provedor de hospedagem pode limitar conexões de entrada. Reduzir chamadas não remove um limite imposto pelo provedor. Sem migração no banco.
- **Testes:** adicionada cobertura para espera após 429 e cache dos endpoints públicos no CI. Validar o ambiente da Cloudflare e do Render depois da publicação.

## [0.1.0-beta.30] — 10/11/2026

- **Foto na mensagem otimista dos canais:** o componente recebe nome, @ e avatar da conta autenticada e apresenta a foto do autor ainda durante o envio, inclusive em mensagens com anexo.
- **Somente e-mails realmente pendentes nas notificações:** listagens "Todas" e "E-mail" excluem avisos lidos. Marcar e-mails como lidos ou movê-los sincroniza o aviso persistente no banco; a consulta periódica reconcilia leituras recentes realizadas fora do Uorqui. Novos avisos/push são criados apenas para e-mails não lidos. Testes de regressão no frontend e API incluídos.
- **Contador unificado no sino:** soma mensagens privadas não lidas, mensagens de canais, convites de comunidades, notificações de atividade e e-mails não lidos das contas conectadas. O badge do ícone PWA utiliza a mesma soma nos navegadores que permitem; o cabeçalho mostra `99+` acima de 99.
- **Compactação de fotos antes do envio:** imagens de Galeria, Câmera ou coladas no compositor utilizam processamento local compartilhado. Fotos JPEG/WebP/HEIC decodificáveis são redimensionadas até 2048 px no maior lado e convertidas em WebP com qualidade 85%, somente com economia mínima de 10%. GIFs, capturas PNG e imagens enviadas pela opção Arquivo preservam o original.
- **Envio seguro:** progresso e cancelamento antes do upload; nomes, tipos de arquivo, fila offline e endpoints atuais de chat privado/canais preservados. Navegadores sem conversão compatível enviam o original.
- **Validação:** testes de conversão, preservação, fallback e cancelamento; CI passa a checar tipos e build do frontend. Sem migração no banco. Validação em câmera mobile/PWA instalado ainda pendente.

## [0.1.0-beta.29] — 09/11/2026

- **Data e hora nas mensagens ao virar o dia:** mensagens de **hoje**, conforme o calendário local do dispositivo, exibem somente a hora (ex.: `18:40`). Mensagens de dias anteriores exibem **data + hora** (ex.: `08/11 18:40`); mensagens de outro ano também apresentam o ano. O horário original permanece salvo no atributo HTML `datetime`.
- **Comportamento padronizado:** aplicado aos balões do chat privado, horário da última atividade na lista de conversas, recibos de leitura e mensagens dos canais de texto/voz/reunião. As mensagens de hoje nos canais deixam de exibir data desnecessariamente.
- **Atualização automática:** um relógio por lista de mensagens atualiza a apresentação na virada do dia, considerando fuso local e retorno do aplicativo após ficar em segundo plano no PWA. Não é necessário reiniciar nem criar timers por balão. Formatação respeita idioma e fuso do usuário.
- **Testes:** nova suíte de regressão cobrindo mesma data, meia-noite local, troca de ano, datas UTC vs. locais, timestamps inválidos e agendamento da atualização. Executada no CI frontend, sem interferir no build Cloudflare. Apenas frontend; sem alterações na API, SQL ou migração.

## [0.1.0-beta.28] — 09/11/2026

- **Header mobile seguindo o tema escuro:** revertida a regra exclusiva do tema claro da beta.27 que pintava indevidamente o cabeçalho superior com o cinza do menu. Assim como no tema escuro, o header usa a superfície do painel de conteúdo (`--kit-panel: #ffffff` no tema claro). O cabeçalho desktop não muda.
- **Menu separado do conteúdo:** a gaveta do menu hambúrguer continua com `--kit-sidebar: #ededed`, e o fundo externo permanece cinza. Painéis de leitura e lista de canais continuam brancos; o tema escuro segue inalterado.
- **Teste e escopo:** regressão de CSS atualizada para impedir regras mobile de cabeçalho que sobrescrevam o painel e verificar a separação do menu. Apenas frontend CSS e documentação; sem alterações na API, banco ou migração. Validar navegador e PWA instalado após publicação Cloudflare.

## [0.1.0-beta.27] — 09/11/2026

- **Contraste da navegação no mobile claro:** o cabeçalho superior do celular (menu hambúrguer, logotipo e notificações) agora usa `--kit-sidebar: #ededed`, igual ao menu lateral e ao fundo externo. Antes, o cabeçalho era forçado a `--kit-panel: #ffffff` e continuava branco mesmo com o tema claro cinza.
- **Menu lateral mobile:** substituída a classe genérica `bg-background` pelo token semântico `bg-[var(--kit-sidebar)]`, compartilhado com o menu desktop e o UI Kit. Painéis, lista de canais e mensagens continuam brancos (`--kit-panel`) no tema claro.
- **Preservação e testes:** a alteração do cabeçalho é exclusiva do **tema claro no mobile**. Tema escuro e cabeçalho do desktop mantêm as cores anteriores. Testes de CSS verificam o token do menu superior e lateral, além do painel branco. Apenas frontend/tema/documentação; sem API, banco ou migração. Verificar PWA Android/iOS após o deploy Cloudflare.

## [0.1.0-beta.26] — 09/11/2026

- **Fundo claro completo uniformizado:** na beta.25, o menu estava cinza (`#ededed`), mas o canvas externo e as faixas ao redor ainda usavam `--background: #fafafa`. Agora, no tema claro logado, `--background: #ededed` e `--workspace-rail: #ededed` acompanham o `--kit-sidebar: #ededed`, aplicando a cor a todo o fundo, inclusive atrás do menu, nas bordas e quando o menu desktop está recolhido.
- **Painéis brancos preservados:** superfície de trabalho, lista de canais e área de mensagens mantêm `--kit-panel: #ffffff` para contraste com todo o fundo externo. O tema escuro não muda, sem sobrescritas de CSS individuais ou alteração da paleta global para páginas públicas.
- **Testes e escopo:** regressão de CSS atualizada para verificar os tokens iguais de fundo/menu/trilho no tema claro, painéis brancos e cores escuras intactas. Apenas CSS do UI Kit e documentação; sem API, banco, migração ou mudança nas sessões. Validar desktop expandido/recolhido e mobile nos dois temas.

## [0.1.0-beta.25] — 09/11/2026

- **Contraste do menu principal no tema claro:** fundo da barra lateral desktop alterado de `#fafafa` para o cinza neutro `--kit-sidebar: #ededed`, um pouco mais escuro para distinguir a navegação do painel de conteúdo branco. O menu principal mobile usa o mesmo token.
- **Outras superfícies preservadas:** tema escuro permanece em `--kit-sidebar: #181818`; a lista de canais, a barra de comunidades e o painel de leitura mantêm seus fundos próprios. Estados de seleção, hover e texto não foram alterados.
- **Testes e escopo:** ampliação dos testes de regressão CSS do frontend para validar token claro, menu mobile e painel branco. Apenas CSS e documentação; sem alterações na API, autenticação, banco ou migração. Conferir desktop/mobile nos temas claro/escuro.

## [0.1.0-beta.24] — 09/11/2026

- **Fundo da lista de canais realmente unificado:** removida a regra de maior especificidade de `apps/web/src/styles.css` que ainda aplicava `--background` quando o menu desktop estava expandido, ignorando o ajuste da beta.23 em `--kit-panel`. A lista com canais de texto, voz, reunião, criação e moderação agora usa a mesma superfície do cabeçalho e do restante do painel em tema escuro e claro, inclusive ao expandir/recolher o menu.
- **Fonte única de cor:** a regra existente no UI Kit em `apps/web/src/ui-kit/sprintrix.css` controla o fundo da lista em todos os tamanhos de tela; o CSS global mantém somente a largura da coluna desktop. Menu principal e trilho de comunidades sem alterações.
- **Teste de regressão:** novo teste Node sem dependências no CI do frontend impede que a declaração conflitante retorne e valida o uso de `--kit-panel`. Versões, READMEs, changelogs e UI Kit PT/EN atualizados. Mudança somente de CSS/testes/docs, sem alteração de API ou migração.

## [0.1.0-beta.23] — 09/11/2026

- **Fundo da lista de canais:** a área com Canais de texto, Salas de voz, Salas de reunião, Novo canal e Moderação passa a usar `--kit-panel`, a mesma cor da superfície de trabalho ao redor, nos temas escuro e claro. Antes, uma regra específica do desktop forçava `--background`, destacando a coluna de maneira indevida.
- **Menu principal preservado:** a barra de navegação principal mantém seu fundo `--kit-sidebar` / `--background`, sem mudanças em seleção, hover, textos ou divisórias. Ajuste centralizado no CSS do UI Kit, sem cores fixadas na página.
- **Escopo e validação:** alteração somente visual, sem API, autenticação, banco nem migração. Conferir desktop/mobile/PWA e alternância de tema. CI com typecheck/build frontend, Worker, API e integração PostgreSQL.

## [0.1.0-beta.22] — 09/11/2026

- **Canais abrem na mensagem mais recente:** a primeira entrada no canal de texto (ou a expansão do chat de sala de voz/reunião) fixa o histórico no final. Mesmo com cache imediato, busca de mensagens atualizada ou imagens/GIFs/anexos que mudam de tamanho depois, eventos automáticos de rolagem não interrompem a posição inicial.
- **Leitura do histórico respeitada:** somente ações reais do usuário (roda do mouse, toque, mouse, teclado ou clique para abrir uma mensagem original) encerram a fixação inicial. Ao subir para ler mensagens antigas, novas mensagens ou mídia não forçam a rolagem de volta; ao retornar ao fim, o acompanhamento é reativado e o indicador de novas mensagens desaparece.
- **Por canal:** fechar/reabrir o canal, alternar canais ou recolher/expandir chat de voz reinicia a posição de abertura sem reutilizar a rolagem do canal anterior.
- **Testes:** `ChannelScrollBehavior` possui testes de rolagem programática durante abertura, crescimento de mídia, navegação manual, retorno ao final e troca de canal. Executados separadamente no CI Web UI com workspaces completos; build do Cloudflare permanece apenas TypeScript + Vite. Sem alteração de API, banco nem migração. Testes manuais em desktop/mobile/PWA ainda recomendados.

## [0.1.0-beta.21] — 09/11/2026

- **Build de produção Cloudflare corrigido:** o comando `build` do frontend agora executa apenas TypeScript e Vite. Os testes Node de identidade utilizavam `tsx`, indisponível na instalação parcial da Cloudflare via Bun; agora rodam no workflow Web UI do GitHub Actions, que instala todas as dependências dos workspaces. Isso desbloqueia a publicação da identidade persistente do navegador/PWA introduzida na beta.20.
- **Atualização da mesma aba:** a validação exclusiva por Web Locks aguarda até dois segundos pela liberação da página anterior durante o recarregamento, atrás da tela inicial. Não interpreta um atraso curto no fechamento como outra sessão, mas mantém o bloqueio de uma segunda aba realmente aberta quando o prazo termina.
- **Testes:** cenários novos de liberação retardada do bloqueio na atualização, segunda aba ainda aberta e navegação cancelada antes da aquisição. Sem alteração de login, API, banco, notificações ou categorias desktop/mobile. **Sem migração.**
- **Validação:** pipelines GitHub de versionamento, testes e build web, API e integração PostgreSQL; conferir separadamente o deploy Cloudflare depois do merge. O CI verde da beta.20 não garantia publicação, porque o Cloudflare não encontrou `tsx`.

## [0.1.0-beta.20] — 09/11/2026

- **Identidade persistente do navegador/PWA:** o identificador da instância fica salvo localmente por conta e categoria desktop/mobile. Reabrir o mesmo navegador ou PWA instalado e recarregar a página não gera outro ID para a reserva existente de 60 segundos, evitando o falso aviso “Uorqui já está aberto”.
- **Uma aba realmente ativa:** um Web Lock exclusivo por origem/conta/categoria impede que duas páginas abertas compartilhem a identidade. A segunda aba fica bloqueada; **Usar nesta aba** assume explicitamente o bloqueio local e a vaga do servidor. Cada documento tem um ID temporário diferente para as notificações de transferência pelo BroadcastChannel. Sem Web Locks, há uma verificação de presença pelo BroadcastChannel.
- **Fechar, reabrir e evitar corridas:** recarregar/fechar libera o bloqueio local e preserva o identificador. `pagehide` não apaga a reserva no servidor para evitar corridas na reabertura imediata; `pageshow` verifica novamente a posse. Eventos de foco não duplicam a verificação inicial. Somente a aba ativa libera sua vaga no logout; outra aba bloqueada não pode apagar a reserva da primeira. Sem mudança de autenticação, OAuth, push, API ou banco.
- **Testes:** novos testes Node no CI frontend cobrem persistência, isolamento entre contas/categorias, falhas de armazenamento, segunda aba, transferência, liberação antiga e fallback por BroadcastChannel. Na primeira abertura após atualizar da beta.19, ainda pode haver uma última reserva antiga de até 60 segundos; caso ocorra, usar **Usar nesta aba** uma vez.

## [0.1.0-beta.19] — 09/11/2026

- **Verificação de instância em segundo plano:** ao recuperar a conta autenticada, a checagem da vaga desktop/mobile acontece sob a tela inicial de carregamento do Uorqui, que permanece montada até o resultado. A interface deixa de exibir a tela separada **Verificando instância ativa…** e evita a troca intermediária de layout.
- **Resultados diretos:** vaga livre abre o aplicativo; conflito abre **Uorqui já está aberto** com **Usar nesta aba**; erro de rede/servidor mantém **Tentar novamente** com o aplicativo suspenso. Permanecem as mesmas sessões, transferência, SSE e verificação a cada 15 segundos.
- **Escopo e testes:** ajuste somente de interface na inicialização/bloqueio, sem migração SQL nem alterações na API. Validar abertura autenticada/recarregamento, segunda aba e troca de controle, retomada do segundo plano, falhas de rede, desktop/mobile/PWA e typecheck/build web.

## [0.1.0-beta.18] — 09/11/2026

- **Uma instância por categoria:** uma aba/janela desktop e uma instância mobile/PWA por conta autenticada, inclusive entre navegadores distintos. A segunda aba fica bloqueada, sem sair da conta; **Usar nesta aba** assume explicitamente a vaga e suspende a anterior (desmonta chats, SSE e mídias), preservando o login.
- **Controle atômico no servidor:** a migração `0043_app_instance_leases.sql` cria uma vaga por conta e categoria no PostgreSQL. A rota `POST /api/v1/instances/claim` adquire/renova a vaga ou devolve `409 INSTANCE_IN_USE`; somente `takeover:true` substitui a instância viva. Após 60 segundos sem renovação, a vaga expira; `/release` encerra somente a posse da instância certa. Requisições exigem autenticação e Origin válido. Se a migração ainda não foi aplicada durante o deploy escalonado, o serviço mantém o acesso normal, sem bloquear todas as contas; para efetivar o limite em produção, aplicar a migração antes de considerar o recurso ativo.
- **Transferência rápida:** BroadcastChannel bloqueia a aba anterior no mesmo navegador; evento SSE `instance-lease` avisa outros navegadores quando houver transferência, com consulta a cada 15 segundos como fallback. Falhas persistentes de rede suspendem temporariamente a interface; não encerram a sessão. Mobile é detectado pelo agente do navegador (incluindo iPadOS), sem depender da largura da janela. O bloqueio limita as interfaces abertas, não substitui autorização de API contra clientes maliciosos.
- **Escopo e testes:** integração com PostgreSQL temporário cobre isolamento por usuário/categoria, validação de origem, troca de controle, expiração e tentativa de liberação pela aba antiga. Validar abas duplicadas, PWA iOS/Android, desktop e celular simultâneos, encerramento de chamada de voz e retomada após queda de rede. Migração SQL aditiva; nenhuma revogação de login ou alteração das permissões de push.

## [0.1.0-beta.17] — 09/11/2026

- **Contagem de e-mails não lidos:** o Gmail passa a consultar o valor `messagesUnread` do marcador `INBOX`, no lugar da estimativa `messages.list.resultSizeEstimate`. Outlook/IMAP mantêm seus totais do provedor. A interface ignora respostas antigas recebidas após marcar como lido/mover, sincroniza o badge no botão Atualizar e ao mover mensagens e não desconta e-mails de Spam/Enviados/Lixeira da Caixa de entrada.
- **Corrida no monitoramento:** a API registra o horário de atualização após leitura individual, leitura em lote e movimentação. Uma varredura iniciada antes dessas operações não sobrescreve o total mais recente.
- **Notificação com app aberto:** ao tocar uma notificação do sistema com a aba Uorqui visível, o service worker envia a rota diretamente para o React, sem depender de uma navegação que pode reaproveitar a página sem reabrir a tela. Instâncias ocultas/congeladas/fechadas continuam usando URL de destino; o aplicativo também processa links no retorno de foco e navegação.
- **Validação:** conferir leitura individual/em lote, múltiplas contas, atualização de provedores, totais do Gmail, notificações com aba visível/oculta e PWA fechado. Sem migração de banco, mudança de login, R2 ou conexões de e-mail.

## [0.1.0-beta.16] — 09/11/2026

- **Convites no idioma correto:** o diálogo de entrada após autenticação, botões, rótulos acessíveis, título alternativo e avisos de erro (convite inválido, banimento e falha) passam a seguir o idioma ativo do aplicativo. O idioma inicial vem de `navigator.language`; caso o usuário já tenha escolhido outro idioma, a preferência salva continua valendo. Não há textos misturados em PT/EN; a entrada depende sempre de aceite explícito.
- **Sem nova oferta quando o desktop já permite push:** `PwaFirstRun` só oferece a autorização diária enquanto a permissão do navegador estiver como `default` (pendente). Com permissão concedida, falhas ou ausência de inscrição no serviço não exibem **Ativar notificações** novamente. A reconexão continua disponível em **Notificações → Ajustes → Permissão neste dispositivo**. O aviso de instalação do PWA permanece independente.
- **Escopo e validação:** somente frontend; sem migração de banco, API, esquema push ou alteração de permissões. Conferir convites em PT/EN, troca de idioma com diálogo aberto e permissões concedida/negada/pendente no desktop, além da reconexão manual. Executar build/typecheck do web e CI de API/integração antes do merge.

## [0.1.0-beta.15] — 09/11/2026

- **Compactação de vídeo aprimorada:** preparação no navegador com resolução máxima de 1280×720, cerca de 1,3 Mbps de vídeo e 96 kbps de áudio, preservando o arquivo original quando a compactação não for suportada ou não oferecer redução significativa. O limite de envio final permanece **50 MB**; não aumenta a capacidade permitida no R2.
- **Preparação visível e cancelável:** o compositor de conversas e canais mostra tamanho original, percentual de progresso e botão **Cancelar** durante a compactação. Após converter, exibe os tamanhos anterior e final. O cancelamento interrompe antes do upload e libera os recursos locais; inicialização e carregamento agora respeitam cancelamento sem aguardar todos os timeouts.
- **Energia:** tenta manter a tela ligada durante a compactação local por Screen Wake Lock e libera a solicitação ao concluir. Navegador e sistema podem negar o recurso.
- **Limites e validação:** vídeo original até 300 MB e compactação em tempo real para clipes de até 180 segundos. É preciso conferir áudio e qualidade no Safari/PWA iOS e Android/PWA; CI valida build e compatibilidade com API, não mídia real. Sem mudanças no banco/backend.

## [0.1.0-beta.14] — 09/11/2026

- **Gravação de áudio:** o compositor compartilhado de conversas e canais solicita Screen Wake Lock durante gravação ou pausa e libera ao finalizar, descartar ou sair. Reativa ao voltar para a tela, quando o navegador/sistema permitir.
- **Editar canal no header:** proprietários e administradores recebem Editar ao lado de Convidar no cabeçalho do canal; o atalho abre Moderação → Canais diretamente no canal selecionado, preservando permissões da API.
- **Compactação de vídeos da Galeria:** Galeria passa a aceitar fotos e vídeos MP4/WebM/MOV; o vídeo da Câmera usa a mesma preparação. Vídeos originais de até 300 MB podem ser compactados localmente com canvas/MediaRecorder antes do envio. O limite final para o R2 **permanece em 50 MB**, e um original só é preservado se couber quando a compactação for indisponível ou ineficaz. A interface mostra o progresso e o aviso de fallback. Fotos continuam em lote; vídeos são selecionados individualmente.
- **Riscos/testes:** verificar compatibilidade, preservação do áudio, duração da conversão, uso de memória e qualidade em dispositivos reais, sobretudo Safari/PWA iOS. A compressão em tempo real atualmente cobre clipes de até 3 minutos; os demais usam o original caso caibam. Sem mudança na API, banco ou limite do R2.

## [0.1.0-beta.13] — 08/11/2026

- **Onboarding responsivo:** o guia mede a própria altura, escolhe espaço acima ou abaixo do item destacado na navegação mobile conforme o viewport e permite rolagem interna em telas baixas. No desktop, mantém a posição lateral.
- **Escuro como padrão:** usuários sem tema salvo agora iniciam em Dark; preferências Light/Dark anteriores continuam respeitadas e podem ser alteradas a qualquer momento.
- **Escopo e validação:** frontend e UI Kit bilíngue, sem migração de API ou banco. Validar Comunidades, Mensagens e E-mail no PWA iOS/Android, telas estreitas, rotação, PT/EN e ambos os temas.

## [0.1.0-beta.12] — 07/11/2026

- **Abertura de e-mails Outlook:** detalhes, marcação como lido e resposta agora usam rotas POST curtas com o ID opaco da mensagem em JSON validado, evitando falhas HTTP 414 relacionadas ao tamanho do caminho da URL.
- **Caixa unificada:** opção Todas as contas reúne Gmail, Outlook e IMAP conectado com ordenação cronológica, identificação da conta, paginação independente e filtro por caixa individual. Ao escrever pela lista unificada, o remetente é selecionável.
- **Marcar como lido em lote:** seleção múltipla permite marcar mensagens como lidas, além de mover para Spam/Lixeira, inclusive entre contas, com tratamento de falhas parciais e atualização dos contadores. Cada seleção combina conta e ID para evitar colisões.
- **Compatibilidade e segurança:** rotas antigas continuam disponíveis; as novas preservam sessão, titularidade da conta, verificação de origem e validação dos IDs. Sem migração de banco nem novas permissões.
- **Validação:** executar typecheck/build da API e do frontend; após deploy, testar a abertura, marcação de leitura e resposta de e-mails Outlook com IDs longos no PWA atualizado. A origem exata do 414 em produção ainda não foi verificada.

## [0.1.0-beta.11] — 06/11/2026

- **Sem prévia duplicada para GIFs nas mensagens privadas:** GIFs reconhecidos do GIPHY continuam aparecendo como animação no chat, mas não montam o cartão externo `LinkPreview` nem consultam seus metadados. Links normais continuam com prévia.
- **Escopo:** condição visual apenas no frontend; sem mudanças de API, banco, mídia, SSE ou migração. Testar GIFs e links normais no celular e desktop, nos temas claro/escuro.

## [0.1.0-beta.10] — 06/11/2026

- **Largura dos balões privados:** cada mensagem reserva os 36 px do botão de três pontos e os 6 px de espaçamento, inclusive antes de concluir o envio otimista, evitando rolagem horizontal e mudança de largura quando o menu aparecer.
- **Respostas padronizadas com canais:** mensagens privadas usam a seta de retorno, referência compacta em uma linha **autor: trecho**, reticências e clique para localizar a original, além da mesma prévia de uma linha no editor com botão de cancelar.
- **Respostas antigas:** citações embutidas em texto recebem a mesma aparência compacta, sem falso clique porque não possuem ID da mensagem original.
- **Escopo e validação:** somente interface e documentação; sem mudanças de API, banco, armazenamento ou SSE. Conferir telas estreitas, textos/anexos longos, envio otimista, temas claro/escuro e navegação à mensagem original.

## [0.1.0-beta.9] — 06/11/2026

- **Seta nas respostas dos canais:** referência e prévia no editor recebem uma seta de retorno à direita, mantendo autor e trecho compactos em uma única linha (inclusive no editor), com reticências em textos longos e clique para visualizar a mensagem original, sem expansão multilinha nem botão Ler mais.
- **Chat privado restaurado:** respostas individuais voltam ao cartão de citação e à prévia do editor anteriores, com contraste próprio para os temas claro e escuro.
- **Sem agrupamento nos canais:** toda mensagem da comunidade exibe foto, nome, username e horário, inclusive quando o mesmo usuário envia várias mensagens seguidas.
- **Escopo:** alteração somente visual no frontend. Sem migração, ajustes de API, banco, permissões, SSE ou histórico de mensagens. Revisar mobile/desktop e temas Light/Dark.

## [0.1.0-beta.8] — 06/11/2026

- **Referência de resposta na mesma linha:** nome de quem escreveu e trecho da mensagem citada aparecem juntos, como **Sandra: belezinha**, em canais e conversas privadas, sem quebra forçada entre os dois.
- **Prévia do editor:** mostra igualmente autor e trecho na mesma linha, mantendo o botão de cancelar e a opção de expansão.
- **Textos longos:** o limite visual passa a abranger autor e citação como um único texto, permitindo até quatro linhas nas mensagens e três no editor. **Ler mais / Mostrar menos** continua revelando a mensagem inteira e o clique na referência localiza a original.
- **Identificação:** nos canais, prefere o nome de exibição do autor quando a mensagem original está carregada; caso contrário, utiliza o username. CSS global preserva responsividade e contraste nos temas claro e escuro. Apenas frontend, sem migração ou alteração na API.

## [0.1.0-beta.7] — 06/11/2026

- **Ordem de leitura das respostas:** nos canais, o nome e horário de quem respondeu voltam a aparecer **antes** da mensagem citada, seguidos do conteúdo da nova resposta. Nas mensagens privadas, a citação também permanece antes do texto respondido.
- **Prévia da mensagem original:** removido o corte fixo de 180 caracteres. A citação pode ocupar **quatro linhas** nas mensagens e **três linhas** acima do editor, com **Ler mais / Mostrar menos** para visualizar todo o texto sem perder o atalho para localizar o original.
- **Mobile:** balões com resposta ganham largura suficiente para não espremer a citação; a prévia expande sem rolagem horizontal. Respostas antigas continuam legíveis.
- **Tema e navegação:** CSS global para Light/Dark e preservação dos vínculos, mensagens otimistas e salto à mensagem original. Apenas frontend; sem migração do banco ou alteração de API.

## [0.1.0-beta.6] — 06/11/2026

- **Respostas no estilo Discord:** canais e conversas privadas agora usam uma referência compacta, com conector curvo, nome do autor e trecho da mensagem original, sem balão de citação dentro de outro balão.
- **Posicionamento:** nos canais, a referência aparece antes do cabeçalho e conteúdo da resposta; no mensageiro privado, antes do texto da resposta. Ambas mantêm o clique para localizar a mensagem original.
- **Editor:** prévia em uma única linha acima do campo de digitação, com cancelamento, truncamento responsivo e resumo para GIFs, mensagens excluídas e anexos.
- **Visual:** componente React compartilhado e CSS global com contraste nos temas claro/escuro, foco por teclado e largura adequada no mobile. Respostas antigas continuam legíveis. Não há alteração de API nem migração de banco.

## [0.1.0-beta.5] — 06/11/2026

- **Abas na central de notificações:** **Todas, Mensagens, Menções, E-mail, Convites e Contatos**, com rolagem horizontal responsiva, navegação por teclado e contadores por categoria. Todas reúne as categorias sem excluir atividades antigas.
- **Mensagens:** a aba apresenta conversas privadas e canais de comunidades com mensagens não lidas e abre o destino correto.
- **Menções:** cada `@usuário` válido gera uma notificação persistente mesmo sem push ativado; acesso de membro, canais restritos/protegidos, bans e bloqueios são respeitados na criação e consulta. Cada aviso abre seu canal.
- **E-mail:** novos e-mails detectados pelo monitoramento entram no histórico com remetente/assunto e acesso ao leitor. Existe também um atalho com o total de não lidos de todas as contas. O primeiro monitoramento continua silencioso e não simula notificações históricas.
- **Ações:** marcar aviso como lido ou dispensá-lo, marcar atividades como lidas em Todas; desconectar o e-mail ou apagar a conta remove os registros relacionados.
- **Banco de dados:** migração aditiva `0042_notification_inbox_events`; aplicar antes da API/Worker. Testes abrangem isolamento por usuário, permissões, leitura/exclusão, segurança de origem, autoria e desconexão.

## [0.1.0-beta.4] — 06/11/2026

- **Notificações no desktop:** o convite diário para ativar o push passa a ter prioridade sobre a oferta de instalar o PWA. Antes, o aviso de instalação surgia primeiro e cancelava o lembrete de notificações.
- **Sem sobreposição:** a instalação poderá ser oferecida em outro acesso, sem interromper a permissão de notificações já apresentada durante a visita.
- **Permissão do navegador:** o pedido nativo continua acontecendo somente após clicar em **Ativar notificações**. Em caso de bloqueio, o usuário recebe orientação para alterar a permissão nas configurações do site.
- **Mobile preservado:** no iOS o push continua exigindo PWA instalado; avisos móveis e limite de uma oferta por conta/dia não mudam. A ativação manual permanece em Notificações → Ajustes.

## [0.1.0-beta.3] — 06/11/2026

- **Outlook OAuth restaurado:** a conexão de novas contas Outlook.com, Hotmail e Microsoft 365 volta a ser aceita por Microsoft Entra e Graph, com PKCE, estado de uso único, renovação de tokens e armazenamento criptografado. Contas já conectadas permanecem preservadas.
- **Interface de e-mail:** botão Outlook volta ao modal de configuração, junto com Gmail e Servidor manual. Fica indisponível até que as credenciais Microsoft estejam presentes no Render; sem afetar outros provedores.
- **Erros de conexão:** o callback devolve apenas o identificador público do provedor (sem códigos, tokens ou estado) e a interface apresenta instruções específicas para permissões e erros Microsoft.
- **Configuração:** criar aplicativo Entra para contas organizacionais e pessoais, plataforma Web, redirect exato `https://uorqui.app/api/v1/mail/oauth/outlook/callback`, permissões delegadas `User.Read`, `Mail.ReadWrite`, `Mail.Send` e `offline_access`. Configurar `MAIL_MICROSOFT_CLIENT_ID` e `MAIL_MICROSOFT_CLIENT_SECRET` **somente no Render**, preservando `MAIL_TOKEN_KEY`.
- **Testes:** fluxo Microsoft de autorização, escopos, PKCE, callback com isolamento por usuário/provedor, proteção contra replay e ausência de segredos, e bloqueio seguro quando as credenciais não estiverem configuradas. Sem migração do banco.

## [0.1.0-beta.2] — 06/11/2026

- **Canais:** removido o botão Editar do cabeçalho; nome, descrição/regras, acesso e senha são administrados em **Moderação → Canais**.
- **Descrição fixa:** criação e edição de textos de até 4.000 caracteres, exibidos permanentemente abaixo do cabeçalho, com **Ler mais / Mostrar menos** para textos longos. Disponível em canais de texto, voz e reunião.
- **Nomes sugeridos:** novas salas recebem nomes numerados por tipo (**Sala de texto 1**, **Sala de voz 1**, **Sala de reunião 1**); a numeração evita nomes duplicados no mesmo tipo e pode ser alterada antes de salvar. A restrição única no PostgreSQL permanece.
- **Convites:** removidas as ações independentes de convidar/compartilhar a comunidade. Cada canal fornece um link único que aceita a entrada na comunidade e abre o canal de destino. O link pode ser copiado ou enviado por mensagem direta; reunião e canal usam o mesmo modal/link.
- **Descobrir:** a lupa na barra das comunidades foi substituída pelo ícone e nome **Descobrir**, mantendo o acesso à lista de comunidades públicas.
- **Segurança:** convite não contorna senha de canal, permissão de canal restrito nem aprovação de reunião. Link temporário existente é reutilizado; administradores podem gerar o primeiro link se não existir.
- **Migração:** `0039_channel_descriptions`, aditiva, acrescenta a coluna opcional `community_channels.description` sem apagar dados. Exige migração do banco antes do deploy da nova API.
- **Segurança de ingresso:** após login/cadastro, o convite apresenta o nome da comunidade e exige **Entrar na comunidade** ou **Agora não**; cadastro e autenticação nunca resgatam convites automaticamente.
- **Mensagens dos canais:** resposta com referência à mensagem original (também para anexos), envio otimista, menções `@usuário` com autocompletar e destaque, e lista de pessoas que reagiram ao tocar na contagem. Acesso restrito é respeitado; push destaca quando a pessoa foi mencionada.
- **GIFs:** seletor compartilhado nos canais e nas mensagens privadas, com envio/visualização como mídia animada e preservação do rascunho. Suporte a catálogo expansível via GIPHY Trending/Busca com paginação quando configurado `VITE_GIPHY_API_KEY`; sem chave, mantém catálogo local limitado.
- **Exclusão da conta:** em Perfil, confirmação de senha e texto `EXCLUIR`; apaga dados pessoais, sessões, mensagens e vínculos do banco, transferindo comunidades com outros membros. Objetos R2 são removidos por fila persistente e tarefa agendada, com tentativas posteriores. A exclusão de conversas privadas compartilhadas impacta o outro participante. Backups do provedor seguem a política de retenção.
- **Migrações adicionais:** `0040_community_message_replies` e `0041_account_media_cleanup`; aplicá-las antes de publicar a nova API. Testes de integração cobrem exclusão e os fluxos de respostas/reações. Testar exclusão e GC do R2 com dados de teste em ambiente real antes de liberar a opção em produção.
- **Testes:** casos de integração para persistência, autorização, limite e remoção de descrição; compilação de frontend e backend/CI. Testar convite com conta nova, link expirado e PWAs reais após implantação.

## [0.1.0-beta.1] — 06/11/2026

**Marco oficial do beta técnico.** Consolida a interface React, os tokens CSS, a API Fastify e a documentação sob uma única versão no GitHub. Testes automáticos e deploy não certificam todos os fluxos em aparelhos reais.

### Implementação consolidada (04–06 de novembro)

- **Interface:** layout compacto e responsivo de Mensagens/Contatos/Comunidades/E-mail, melhor contraste de respostas nos temas e superfícies globais. UI Kit passa a descrever a **paleta cinza real do workspace**, não as propostas roxas/azuis anteriores. Um par global de tokens Dark/Light substitui declarações duplicadas.
- **Mensageiro:** SSE e horários de entrega/leitura, texto e respostas otimistas, anexos, galeria paginada de todas as mídias/arquivos, uma mensagem fixada compartilhada por conversa, cache e placeholders responsivos.
- **Comunidades:** canais, permissões, confirmação de exclusão sempre visível, reuniões de áudio/vídeo, chat mobile e carregamento inteligente de mídias privadas em memória.
- **E-mail:** OAuth Gmail e IMAP/SMTP manual, pastas entrada/enviados/spam/lixeira, leitura/resposta/movimentação, visualizador HTML isolado com links externos nativos e skeleton até a montagem do layout/imagens (com limite para serviços remotos travados).
- **PWA/notificações:** categorias configuráveis de push para atividade, comunidades, DMs e e-mail; badge nativo de não lidos onde suportado e service worker seguro.
- **Código consolidado:** transporte JSON reutilizável em `apps/web/src/lib/apiClient.ts`, sem alterar erros existentes; validação estrita da origem de escrita compartilhada em `apps/api/src/request-origin.ts`. **Sem mudanças nas rotas, autenticação ou schema nesta consolidação.**
- **Governança:** workflow `Version policy` exige versão SemVer superior e changelogs PT/EN nos próximos PRs; `Publish tagged beta releases` cria tags/Releases imutáveis `v...` na `main` (dependente das permissões do GitHub).

### Evolução de produto de 02–03/11 incluída neste beta

As mudanças abaixo precederam o marco formal de 06/11 e integram esta versão.

### Produto e comunidades
- Removido o **Explorar comunidades** interno da aba Comunidades (ícone bússola, pesquisa e lista pública). A área agora mostra apenas comunidades participadas, convites pendentes e criação; a descoberta de novas comunidades fica exclusivamente na aba **Descobrir**.
- Links de convite para canais enviados nos chats e prévias abrem a comunidade e o canal por **navegação interna**, sem nova aba ou recarregamento. Convites por token usam o fluxo existente de entrada no próprio app; tocar no push do convite direto também abre o canal.
- O seletor **Convidar para o canal** agora mostra exclusivamente outros participantes da comunidade atual, excluindo contas bloqueadas e respeitando a privacidade de nomes/fotos; o convite usa link direto sem gerar convite geral da comunidade.
- Migração `0034_channel_names_per_kind` aplicada no Neon de produção (3 nov. 2026), com verificação do novo índice exclusivo por comunidade, tipo e nome; backups existentes preservados, mas limite do Neon impediu criar um novo snapshot/branch.
- Push de convite apenas ao destinatário: mensagens privadas de convite usam o push normal do chat com texto específico, e convites de entrada na comunidade notificam somente a pessoa convidada.
- Cabeçalho dos canais com **Convidar**: lista contatos/amigos e envia DM com link direto para texto, voz ou reunião; convites válidos da comunidade são aproveitados quando disponíveis, mantendo senha e permissão de canal.
- **Descobrir** agora resume atividade com autor e tipo: GIF, foto, vídeo, áudio, arquivo, link, emoji, mensagem ou reação, sem mostrar URL de GIF nem nomes de arquivos.
- Canais de tipos diferentes podem usar **o mesmo nome**; nomes continuam únicos dentro da mesma comunidade e tipo. Migração versionada `0034_channel_names_per_kind` e índice de recência para reações, já aplicados ao banco de produção.
- Lista de conversas privadas agora tem divisórias **sutis e recuadas** entre os itens, sem afetar a separação entre áudio/vídeo e chat nas salas.
- Notificações agora têm botão **X** para exclusão individual e persistente, com atualização imediata da lista e do badge; a exclusão não cancela pedidos de amizade/entrada. Em salas de voz e reuniões, uma divisória explícita separa áudio/vídeo do chat quando ambos estão abertos (vertical no desktop, horizontal no celular); retiradas as divisórias indevidas entre conversas privadas.
- Notificações de solicitações de entrada em comunidade/reunião agora identificam a comunidade (e a reunião, se aplicável) no app e no push. Na moderação, avatar, nome e @usuário formam uma área clicável para abrir o perfil público; esse perfil aparece acima do dialog. Nomes da lista principal de participantes das comunidades permanecem texto simples, com links apenas nos canais e na moderação.
- Divisórias de conversas no desktop reforçadas com separadores contínuos de contraste visível entre as linhas.
- **Comunidades** agora é a entrada principal e primeira aba da navegação; logo volta a Comunidades e onboarding apresenta essa área primeiro. O app retoma a última comunidade acessada apenas se a conta continuar participando; quem ainda não participa encontra convite para explorar.
- Nomes de participantes e autores nas comunidades (mensagens, voz e moderação) abrem o perfil público; o mini-player flutuante de reunião mostra a própria câmera e a câmera/avatar de quem está falando, com destaque de atividade.
- Lista de conversas com divisórias discretas no desktop; controles e botões do compositor alinhados em 48 px nas salas de voz e reuniões no layout desktop, preservando tamanhos compactos no celular.
- Menu principal lateral do desktop com fonte e ícones ligeiramente maiores, além de mais altura nos itens; lista de conversas no celular com retorno visual de toque (pressão e destaque) ao abrir chats.
- Moderação da comunidade organizada em abas no dialog: **Membros** (inclui acesso aos canais fechados), **Banimentos**, **Canais**, **Configurações** e **Exclusão** (exclusiva ao proprietário), com navegação adaptada ao celular.
- A moderação da comunidade agora abre em **dialog responsivo**: tela completa no celular e janela centralizada no desktop, com foco controlado, rolagem interna e fechamento sem interromper ações pendentes.
- O feed global e o modo de vídeos antigo deram lugar a **Descobrir**, com recomendações, busca e atividades autorizadas; aposentadoria e snapshots de recuperação foram documentados.
- Reuniões com áudio/vídeo, links ou convites via mensagem individual, controle de entrada, compartilhamento de tela, destaque de quem fala e tela cheia com câmera própria em miniatura.
- O painel de texto das salas de voz e reuniões inicia **recolhido**, com expansão sem desconectar.
- Aprovação de solicitação de comunidade envia evento SSE direcionado ao solicitante e atualiza a participação sem recarregar a página.
- Proprietário/admins editam nome, senha e acesso **aberto/fechado** pelo cabeçalho de canais de texto/voz/reunião; exclusão continua na moderação.
- **Permissões individuais de canais fechados** em Moderação → Membros; API filtra mensagens, Descobrir, notificações, mídia, presença e WebRTC. Revogação encerra a chamada. Migração `0033_restricted_channel_members` versionada; aplicar e verificar no banco de destino antes de liberar o recurso.

### Manutenção
- Auditoria de traduções: excluídas 38 chaves sem uso de feed/demonstrações; texto do cadastro e tradução inglesa atualizados para Descobrir.
- Termos e Privacidade revisados em PT/EN para a experiência atual; aceite de **novos cadastros** usa versão `2026-11-03`, sem alterar registros de usuários anteriores. Política de Cookies permanece `2026-11-01`. Reaceite de contas antigas não foi imposto.
- Retirados controles de compartilhamento de posts do feed já desativado; links antigos recebidos em DMs exibem aviso em vez de navegação quebrada.
- Removidos dois componentes shadcn sem importações (Sheet/Tabs). Mantidos históricos de migração e mídias de recuperação.
- Revisada a documentação bilíngue, com [auditoria de código de 03/11](docs/pt-BR/auditoria-manutencao.md).

**Pendências:** testes reais de reunião e apresentação entre aparelhos, PWA iOS/Android, push/e-mail de ponta a ponta e confirmação independente do deploy em produção.

### Escopo inicial (registros históricos do preview)

**Primeiro beta técnico para testes controlados.** Este documento descreve código implementado e testes automatizados, **não** uma certificação em todos os navegadores e dispositivos.

### Incluído

- Nova rede social open source em React/TypeScript, com interface inspirada no UIKit, temas claro e escuro e selo Beta consistente junto ao logo no header.
- Autenticação Better Auth com e-mail/senha, perfis, privacidade e bloqueios; cadastro público com proteção Turnstile e integração de e-mail.
- Mensageiro individual 1:1 com persistência, anexos, respostas, reações, estados de mensagens, atualizações SSE e suporte a Web Push.
- Descoberta de comunidades em substituição ao feed global removido; rotas e tabelas legadas foram desativadas durante a evolução do beta.
- Comunidades com convites, cargos, canais de texto, moderação e salas WebRTC, incluindo chamada minimizável.
- Frontend Cloudflare Worker/R2; API Fastify no Render; PostgreSQL Neon; testes automáticos de interface, API e integração.
- Preparação para migração de domínio, lista de origens autorizadas e substituição do service worker em PWAs instalados.

### Pendências e limitações

- Validar **com uma conta real** envio/recebimento de e-mail, confirmação e recuperação de senha.
- A substituição do PWA, notificações e ícone **não está garantida** para todos os aparelhos, especialmente iPhone.
- Voz entre redes diferentes pode precisar de TURN; iOS limita execução e microfone em segundo plano.
- Em 01/11/2026, a Cloudflare confirmou `uorqui.app` habilitado no Worker `main` em produção. Ainda faltam conferir caches dos PWAs instalados, particularidades de dispositivos e fluxos de recuperação.
- Não há migração automática das contas, mensagens, push ou dados do Uorqui Chat empresarial.
- Antes de ampliar o beta: monitoramento, backups e restauração, testes de acessibilidade/segurança, operação de moderação e custos.

### Deploy e reversão

Siga o [procedimento de migração do domínio](docs/pt-BR/migracao-dominio-uorqui-app.md). A versão exige build e testes GitHub Actions. Não reutilizar credenciais ou dados do mensageiro empresarial legado.

> Alterar a versão e criar estas notas **não publica automaticamente** uma tag nem uma GitHub Release. A prerelease pode ser publicada depois de selecionar um commit validado.
