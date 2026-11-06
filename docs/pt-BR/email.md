# E-mail: Gmail e Outlook OAuth, com IMAP/SMTP manual

[English](../en/email.md) · [Português](email.md)

O Uorqui conecta Gmail e Outlook.com/Microsoft 365 via OAuth, além de servidores IMAP/SMTP manuais. Permite vários endereços por provedor; os tokens OAuth e as credenciais manuais são criptografados com AES-256-GCM. O login do Uorqui (Better Auth) é separado da conexão de e-mail.

## Ativar Outlook OAuth no Microsoft Entra — `v0.1.0-beta.3`

1. Abra [Microsoft Entra](https://entra.microsoft.com) → **Identidade → Aplicativos → Registros de aplicativo → Novo registro**. Selecione **Contas em qualquer diretório organizacional e contas Microsoft pessoais** para aceitar Outlook.com/Hotmail e Microsoft 365.
2. Em **Autenticação → Adicionar plataforma → Web**, registre **exatamente** `https://uorqui.app/api/v1/mail/oauth/outlook/callback`. O callback passa pelo Cloudflare Worker até a API Fastify do Render; não crie uma plataforma SPA para esse retorno.
3. Em **Permissões de API → Adicionar permissão → Microsoft Graph → Permissões delegadas**, habilite `User.Read`, `Mail.ReadWrite` e `Mail.Send`. O fluxo também solicita `offline_access`. Ambientes corporativos podem exigir consentimento do administrador; não use permissões de aplicativo (Application) para esse fluxo.
4. Copie o **ID do aplicativo (cliente)**. Em **Certificados e segredos → Segredos do cliente → Novo segredo**, crie um segredo e copie o campo **Valor** uma única vez (não o ID do segredo). Acompanhe sua expiração.
5. Em **Render → serviço `uorqui-social-api` → Environment**, configure `MAIL_MICROSOFT_CLIENT_ID` = ID do aplicativo e `MAIL_MICROSOFT_CLIENT_SECRET` = Valor do segredo. Preserve `MAIL_TOKEN_KEY` existente; não rotacione a chave ou invalidará as conexões criptografadas de Gmail e outros provedores.
6. Após o deploy, no **Uorqui → E-mail → Conectar e-mail → Outlook** (ou **+ Conectar novo e-mail → Outlook**), autorize o acesso no site Microsoft e teste caixa de entrada, marcar lido, enviar, responder, Spam e Lixeira. A conexão permanece desabilitada enquanto faltar alguma variável de servidor.

**Importante:** trata-se de vincular a caixa de e-mail, **não** de entrar no Uorqui via Microsoft SSO. O Render faz as requisições HTTPS ao Microsoft Graph, sem depender de uma porta SMTP.

## Configuração

1. Validar a migração Drizzle `0035_cooing_shard.sql` em uma branch Neon de desenvolvimento antes de solicitar aprovação para produção. O snapshot `0034_snapshot.json` registra as migrações manuais 0022–0034, sem repetir suas alterações.
2. Criar um cliente OAuth web no Google Cloud, habilitar Gmail API e configurar consentimento. Solicitar `gmail.modify` e `gmail.send` para permitir sincronizar a leitura de mensagens. O escopo `gmail.modify` é restrito: a liberação pública depende da verificação do Google e dos requisitos de segurança aplicáveis. Durante testes, usar usuários de teste autorizados.
3. Para servidor manual, informe usuário/senha de aplicativo, host IMAP TLS (porta 993) e host SMTP TLS (465), STARTTLS (587 ou 2525). Outlook.com/Microsoft 365 exigem OAuth2 e não funcionam com senha manual comum.
4. Cadastre os callbacks exatos no domínio `WEB_ORIGIN`: `/api/v1/mail/oauth/gmail/callback` e `/api/v1/mail/oauth/outlook/callback`.
5. Configurar **somente no Render**, como variáveis privadas: `MAIL_GOOGLE_CLIENT_ID`, `MAIL_GOOGLE_CLIENT_SECRET`, `MAIL_MICROSOFT_CLIENT_ID`, `MAIL_MICROSOFT_CLIENT_SECRET` e `MAIL_TOKEN_KEY`. A chave é independente de `AUTH_SECRET`: 32 bytes aleatórios codificados em base64. Não rotacionar sem um plano para recriptografar ou reconectar contas existentes.
6. Conferir `/health/ready`, então testar autorização, retorno, leitura, envio, expiração e desconexão com contas controladas dos dois provedores. Credenciais não estão no repositório. Sem configuração, a interface explica a indisponibilidade e desabilita a conexão.

## Comportamento

- Rotas sob `/api/v1/mail`: listar contas, iniciar OAuth, callback, listar/ler emails, enviar e desconectar. Exigem sessão; mutações exigem Origin autorizado. Conexões são limitadas ao usuário autenticado.
- Estado OAuth de uso único, dez minutos de validade, vínculo com usuário/provedor e PKCE. Tokens e verificadores são criptografados com AES-256-GCM. Logs de requisição do Fastify omitem códigos e estado do callback.
- Renovação de tokens no servidor, serializada por conexão. Tokens nunca vão para o frontend. Conteúdo buscado sob demanda, sem persistência no banco. Respostas privadas e não armazenáveis em cache.
- Entrada, Enviados, Spam e Lixeira; filtros Todos, Não lidos e Favoritos; paginação e busca local nos emails carregados. Abrir mensagem sincroniza automaticamente o status lido com o provedor (Gmail `messages.modify` remove `UNREAD`, Outlook PATCH `isRead`).
- Renderização de HTML em iframe isolado, sem scripts, formulários ou acesso ao DOM do Uorqui. Imagens inline por CID do Gmail são incorporadas com limite de tamanho; imagens remotas `https:` somente após clicar em **Carregar imagens externas**. A opção é específica da mensagem, evitando carregamento automático de pixels de rastreamento.
- **Responder** preserva a conversa existente: Gmail usa `threadId`, `In-Reply-To`, `References` e remetente apurado no servidor; Outlook usa Graph `/reply`. O destinatário não pode ser alterado via payload da resposta.
- Envio de texto e resposta em sequência para um destinatário. Anexos, rascunhos persistentes, CC/BCC e sincronização em tempo real não fazem parte desta etapa. Em caso de resultado incerto, conferir Enviados antes de repetir.
- Desconectar remove os tokens locais e preserva os emails no provedor. Revogar a autorização separadamente nas configurações de segurança Google/Microsoft.

## Validação

`mail.integration.test.mjs` usa PostgreSQL temporário e respostas simuladas dos provedores. Valida isolamento, Origin, PKCE, replay/expiração do estado, criptografia, renovação, envio e paginação restrita. Não envia emails reais. A validação ao vivo depende dos clientes e contas configurados acima.

Referências: [Google OAuth](https://developers.google.com/identity/protocols/oauth2/web-server), [escopos Gmail](https://developers.google.com/workspace/gmail/api/auth/scopes), [Microsoft OAuth](https://learn.microsoft.com/en-us/entra/identity-platform/v2-oauth2-auth-code-flow), [Graph mail](https://learn.microsoft.com/en-us/graph/api/resources/mail-api-overview).

## Diagnóstico de OAuth

- A API informa `webOrigin` em `/api/v1/mail/accounts`; ao conectar, o frontend confere que o domínio atual coincide com `WEB_ORIGIN` para impedir que cookies de sessão de `workers.dev` sejam perdidos no retorno ao domínio canônico. Caso divergam, apresenta link para a origem oficial, sem iniciar o OAuth.
- O callback nunca envia tokens, código OAuth, estado ou mensagens brutas do provedor ao navegador. Em falhas, adiciona somente uma categoria fixa `mail_reason` e o rótulo público `mail_provider` ao redirecionamento (`session`, `state`, `denied`, `invalid_return`, `token`, `mailbox`, `storage`). A UI apresenta orientações específicas; os parâmetros de retorno são removidos do endereço após leitura.
- `session`: ausência de login na origem canônica; `state`: autorização expirada, incorreta ou reutilizada; `denied`: consentimento negado/testador não permitido; `token`: troca de token recusada (ID, segredo, redirect URI ou escopos); `mailbox`: Gmail API/permissões; `storage`: erro ao salvar no Neon. Sem sucesso real no Google, o frontend não promete conexão.

## Domínio do Render

O Blueprint `render.yaml` usa `AUTH_BASE_URL=https://uorqui.app` e `WEB_ORIGIN=https://uorqui.app`, o mesmo domínio da sessão no navegador e dos callbacks OAuth. Alterações feitas diretamente no painel do Render podem prevalecer sobre o arquivo; conferir ambos os valores no ambiente ativo após sincronizar o Blueprint. Os callbacks devem ser exatamente `https://uorqui.app/api/v1/mail/oauth/gmail/callback` e `https://uorqui.app/api/v1/mail/oauth/outlook/callback`. Não usar `workers.dev` para a integração no domínio oficial.

## Reautorização após liberar marcação de leitura

Como o escopo Gmail mudou de `gmail.readonly` para `gmail.modify` e o Outlook de `Mail.Read` para `Mail.ReadWrite`, **contas previamente conectadas precisam reconectar o provedor pelo botão Gmail/Outlook** para conceder a nova permissão. Os escopos precisam constar no consentimento configurado no Google Cloud / Microsoft Entra. Nenhuma senha ou chave precisa ser gerada novamente; as conexões existentes não são excluídas pelo deploy. Um erro 409 `MAIL_RECONNECT` após tentativa de gravação indica que a permissão ainda não foi concedida.

## Contas, seleção e servidores manuais

- O seletor de contas contém **+ Conectar novo e-mail**; oferece Gmail OAuth, Outlook OAuth e **Servidor manual (IMAP/SMTP)**. Botões permanentes de provedores são removidos depois que uma conta está conectada.
- A migração `0036_mail_multiple_accounts.sql` permite vários endereços do mesmo provedor e o tipo `manual`, preservando contas existentes. Aplicá-la antes da publicação da API.
- Selecione até **100 mensagens** e mova para **Spam** ou **Lixeira**, sem exclusão permanente. A API usa Gmail `batchModify`, Graph `/move` para contas Microsoft e IMAP MOVE para servidores manuais.
- Imagens externas HTTPS são carregadas automaticamente no iframe isolado, com scripts e formulários bloqueados. Isso pode revelar ao remetente a abertura do e-mail por pixels de rastreamento.
- Credenciais de servidores manuais são armazenadas criptografadas, nunca são retornadas na listagem de contas, e cada conexão valida o destino DNS contra redes privadas e locais. Só IMAP TLS 993 e SMTP seguro 465, 587 e 2525 são aceitos. Conexão SMTP não é testada durante o cadastro.
- **Render gratuito bloqueia SMTP nas portas 25, 465 e 587**. Para enviar por SMTP convencional nessas portas, é preciso hospedar a API em serviço com egress liberado ou usar outra solução de envio. A porta 2525 funciona somente se o provedor oferecer SMTP STARTTLS nela.
- Outlook.com e Microsoft 365 requerem OAuth2 e não aceitam senha manual como substituta. Novas conexões Outlook OAuth estão disponíveis quando as variáveis Microsoft no Render estão configuradas; conexões existentes são preservadas.

## Push de novos e-mails

Após conectar Gmail, Outlook ou um servidor IMAP, o backend Render verifica a caixa de entrada periodicamente (padrão: a cada 120 segundos; `MAIL_POLL_INTERVAL_MS` ajustável entre 60 segundos e 1 hora). A integração Outlook usa Microsoft Graph e também recebe verificação periódica. O primeiro ciclo estabelece uma referência **sem notificar mensagens antigas**; IDs já vistos ficam em `mail_seen_messages`, resistentes a reinicializações e reimplantações. A tabela `mail_inbox_state` mantém os contadores consultados pelo menu.

Somente e-mails que chegam após a referência inicial geram push. O payload informa remetente e assunto (sem corpo completo), com destinatário autenticado, verificação de acesso à conta ainda conectada antes de exibir e abertura direta da mensagem na conta correta. O usuário pode desabilitar **Novos e-mails** em Ajustes de notificações. Com a API suspensa ou indisponível, o monitoramento atrasa; o push é de melhor esforço e não substitui o provedor de e-mail. Alguns contadores do Gmail são estimados pela API do Google.

A migração `0037_mail_push.sql` cria as tabelas de varredura e a preferência `email_message`. **Aplicá-la ao Neon correto antes de publicar a API**, sem modificar dados das conexões existentes. A cada leitura ou movimentação, o backend atualiza o contador de entrada; os demais clientes sincronizam no próximo ciclo. O menu mobile usa gaveta lateral (sem barra inferior), igual aos módulos do desktop.

## Imagens no leitor de e-mail

O leitor ajusta **o iframe e o layout HTML completo do e-mail** à largura disponível no mobile, inclusive mensagens promocionais que usam tabelas fixas de 600–800 px. A altura do iframe acompanha o conteúdo para que a rolagem principal do e-mail continue natural. As imagens preservam seu tamanho e proporção dentro do layout original, sem limite artificial de miniatura; ao tocar ou pressionar Enter sobre uma imagem, ela é ampliada em primeiro plano. O conteúdo continua isolado em iframe sem scripts ou formulários. O ajuste de escala se recalcula ao carregar imagens e mudar a largura da tela.

## Formulário de servidor manual com conta conectada

Quando já existe uma conta vinculada, escolher **+ Conectar novo e-mail → Servidor manual** abre os campos IMAP/SMTP na área rolável da lista de e-mails, e não mais no cabeçalho fixo. Assim todos os campos, incluindo senha SMTP opcional e **Salvar conta**, permanecem acessíveis no mobile sem alterar as contas existentes.

## Modal de configuração de contas

A configuração de novos e-mails fica em um **dialog centralizado com rolagem própria**, tanto no primeiro acesso quanto ao selecionar **+ Conectar novo e-mail** em uma caixa já vinculada. O modal reúne Gmail OAuth, Outlook OAuth e o formulário IMAP/SMTP, com cabeçalho fixo, fechamento por X, Escape ou clique no fundo (exceto enquanto salva), rolagem dos campos no mobile e retorno do foco ao controle anterior. A lista de e-mails permanece independente do formulário.

## Links externos no HTML do e-mail

Os links HTTP(S) dentro do corpo HTML do e-mail — inclusive banners e imagens com links — abrem **no navegador, em uma nova aba/janela**, sem navegar dentro do iframe nem substituir o Uorqui. O clique é capturado pelo leitor principal com ação direta do usuário, mantendo o iframe isolado (`sandbox=allow-same-origin`, sem scripts nem formulários). Imagens sem link ainda podem ser ampliadas. URLs relativas (sem origem confiável no e-mail) e esquemas inseguros como `javascript:` e `data:` não são abertos. O site externo não recebe o referrer do Uorqui (`noopener,noreferrer`).

## Abertura nativa dos links e montagem do HTML

Os links absolutos HTTP(S) no HTML do e-mail agora são normalizados para `target="_blank"` com `rel="noopener noreferrer"` e abertos **pelo navegador**, sem depender de `window.open` invocado pelo pai do iframe (que pode ser bloqueado no PWA do iOS). O iframe permanece sem scripts, formulários ou permissão de navegar no topo e recebe somente `allow-popups` e `allow-popups-to-escape-sandbox` para links externos. Links relativos ou com esquemas inseguros têm o `href` removido. Banners clicáveis seguem o link; só imagens não vinculadas abrem o zoom. O esqueleto do leitor só desaparece depois que o documento, fontes, imagens e duas etapas de medição/layout são processados; imagens remotas travadas não bloqueiam indefinidamente o leitor (limite de segurança de 15 s), e seu carregamento tardio continua reajustando a altura do frame.
