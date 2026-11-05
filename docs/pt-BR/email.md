# Email via Gmail e Outlook

[English](../en/email.md) · [Português](email.md)

O módulo Email integra Gmail API e Microsoft Graph por OAuth 2.0 com PKCE. Não usa a senha do usuário e não altera o login Better Auth. Uma conta de cada provedor pode ser conectada por usuário; uma nova autorização substitui a conexão anterior desse provedor.

## Configuração

1. Validar a migração Drizzle `0035_cooing_shard.sql` em uma branch Neon de desenvolvimento antes de solicitar aprovação para produção. O snapshot `0034_snapshot.json` registra as migrações manuais 0022–0034, sem repetir suas alterações.
2. Criar um cliente OAuth web no Google Cloud, habilitar Gmail API e configurar consentimento. Solicitar `gmail.modify` e `gmail.send` para permitir sincronizar a leitura de mensagens. O escopo `gmail.modify` é restrito: O escopo de leitura é restrito: a liberação pública depende da verificação do Google e dos requisitos de segurança aplicáveis. Durante testes, usar usuários de teste autorizados.
3. Registrar um aplicativo web no Microsoft Entra com contas organizacionais e pessoais e permissões delegadas `User.Read`, `Mail.ReadWrite`, `Mail.Send` e `offline_access`. Organizações podem exigir consentimento administrativo.
4. Cadastrar callbacks exatos no domínio canônico de `WEB_ORIGIN`: `/api/v1/mail/oauth/gmail/callback` e `/api/v1/mail/oauth/outlook/callback`. Passam pelo proxy existente do Worker até o Fastify; a sessão deve estar ativa no mesmo domínio.
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
- O callback nunca envia tokens, código OAuth, estado ou mensagens brutas do provedor ao navegador. Em falhas, adiciona somente uma categoria fixa `mail_reason` ao redirecionamento (`session`, `state`, `denied`, `invalid_return`, `token`, `mailbox`, `storage`). A UI apresenta orientações específicas; os parâmetros de retorno são removidos do endereço após leitura.
- `session`: ausência de login na origem canônica; `state`: autorização expirada, incorreta ou reutilizada; `denied`: consentimento negado/testador não permitido; `token`: troca de token recusada (ID, segredo, redirect URI ou escopos); `mailbox`: Gmail API/permissões; `storage`: erro ao salvar no Neon. Sem sucesso real no Google, o frontend não promete conexão.

## Domínio do Render

O Blueprint `render.yaml` usa `AUTH_BASE_URL=https://uorqui.app` e `WEB_ORIGIN=https://uorqui.app`, o mesmo domínio da sessão no navegador e dos callbacks OAuth. Alterações feitas diretamente no painel do Render podem prevalecer sobre o arquivo; conferir ambos os valores no ambiente ativo após sincronizar o Blueprint. O callback Gmail deve ser exatamente `https://uorqui.app/api/v1/mail/oauth/gmail/callback`. Não usar `workers.dev` para a integração no domínio oficial.

## Reautorização após liberar marcação de leitura

Como o escopo Gmail mudou de `gmail.readonly` para `gmail.modify` e o Outlook de `Mail.Read` para `Mail.ReadWrite`, **contas previamente conectadas precisam reconectar o provedor pelo botão Gmail/Outlook** para conceder a nova permissão. Os escopos precisam constar no consentimento configurado no Google Cloud / Microsoft Entra. Nenhuma senha ou chave precisa ser gerada novamente; as conexões existentes não são excluídas pelo deploy. Um erro 409 `MAIL_RECONNECT` após tentativa de gravação indica que a permissão ainda não foi concedida.
