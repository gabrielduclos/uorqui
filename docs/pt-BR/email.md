# Email via Gmail e Outlook

[English](../en/email.md) · [Português](email.md)

O módulo Email integra Gmail API e Microsoft Graph por OAuth 2.0 com PKCE. Não usa a senha do usuário e não altera o login Better Auth. Uma conta de cada provedor pode ser conectada por usuário; uma nova autorização substitui a conexão anterior desse provedor.

## Configuração

1. Validar a migração Drizzle `0035_cooing_shard.sql` em uma branch Neon de desenvolvimento antes de solicitar aprovação para produção. O snapshot `0034_snapshot.json` registra as migrações manuais 0022–0034, sem repetir suas alterações.
2. Criar um cliente OAuth web no Google Cloud, habilitar Gmail API e configurar consentimento. Solicitar `gmail.readonly` e `gmail.send`. O escopo de leitura é restrito: a liberação pública depende da verificação do Google e dos requisitos de segurança aplicáveis. Durante testes, usar usuários de teste autorizados.
3. Registrar um aplicativo web no Microsoft Entra com contas organizacionais e pessoais e permissões delegadas `User.Read`, `Mail.Read`, `Mail.Send` e `offline_access`. Organizações podem exigir consentimento administrativo.
4. Cadastrar callbacks exatos no domínio canônico de `WEB_ORIGIN`: `/api/v1/mail/oauth/gmail/callback` e `/api/v1/mail/oauth/outlook/callback`. Passam pelo proxy existente do Worker até o Fastify; a sessão deve estar ativa no mesmo domínio.
5. Configurar **somente no Render**, como variáveis privadas: `MAIL_GOOGLE_CLIENT_ID`, `MAIL_GOOGLE_CLIENT_SECRET`, `MAIL_MICROSOFT_CLIENT_ID`, `MAIL_MICROSOFT_CLIENT_SECRET` e `MAIL_TOKEN_KEY`. A chave é independente de `AUTH_SECRET`: 32 bytes aleatórios codificados em base64. Não rotacionar sem um plano para recriptografar ou reconectar contas existentes.
6. Conferir `/health/ready`, então testar autorização, retorno, leitura, envio, expiração e desconexão com contas controladas dos dois provedores. Credenciais não estão no repositório. Sem configuração, a interface explica a indisponibilidade e desabilita a conexão.

## Comportamento

- Rotas sob `/api/v1/mail`: listar contas, iniciar OAuth, callback, listar/ler emails, enviar e desconectar. Exigem sessão; mutações exigem Origin autorizado. Conexões são limitadas ao usuário autenticado.
- Estado OAuth de uso único, dez minutos de validade, vínculo com usuário/provedor e PKCE. Tokens e verificadores são criptografados com AES-256-GCM. Logs de requisição do Fastify omitem códigos e estado do callback.
- Renovação de tokens no servidor, serializada por conexão. Tokens nunca vão para o frontend. Conteúdo buscado sob demanda, sem persistência no banco. Respostas privadas e não armazenáveis em cache.
- Entrada e Enviados; filtros Todos, Não lidos e Favoritos; paginação; busca local nos emails carregados. Leitura não marca mensagens como lidas nem altera favoritos. Exibição em texto, sem executar HTML nem carregar imagens remotas; mensagens apenas em HTML podem mostrar somente o resumo do Gmail.
- Envio de texto para um destinatário. Anexos, rascunhos persistentes, CC/BCC e sincronização em tempo real não fazem parte desta etapa. Em caso de resultado incerto, conferir Enviados antes de repetir.
- Desconectar remove os tokens locais e preserva os emails no provedor. Revogar a autorização separadamente nas configurações de segurança Google/Microsoft.

## Validação

`mail.integration.test.mjs` usa PostgreSQL temporário e respostas simuladas dos provedores. Valida isolamento, Origin, PKCE, replay/expiração do estado, criptografia, renovação, envio e paginação restrita. Não envia emails reais. A validação ao vivo depende dos clientes e contas configurados acima.

Referências: [Google OAuth](https://developers.google.com/identity/protocols/oauth2/web-server), [escopos Gmail](https://developers.google.com/workspace/gmail/api/auth/scopes), [Microsoft OAuth](https://learn.microsoft.com/en-us/entra/identity-platform/v2-oauth2-auth-code-flow), [Graph mail](https://learn.microsoft.com/en-us/graph/api/resources/mail-api-overview).

## Diagnóstico de OAuth

- A API informa `webOrigin` em `/api/v1/mail/accounts`; ao conectar, o frontend confere que o domínio atual coincide com `WEB_ORIGIN` para impedir que cookies de sessão de `workers.dev` sejam perdidos no retorno ao domínio canônico. Caso divergam, apresenta link para a origem oficial, sem iniciar o OAuth.
- O callback nunca envia tokens, código OAuth, estado ou mensagens brutas do provedor ao navegador. Em falhas, adiciona somente uma categoria fixa `mail_reason` ao redirecionamento (`session`, `state`, `denied`, `invalid_return`, `token`, `mailbox`, `storage`). A UI apresenta orientações específicas; os parâmetros de retorno são removidos do endereço após leitura.
- `session`: ausência de login na origem canônica; `state`: autorização expirada, incorreta ou reutilizada; `denied`: consentimento negado/testador não permitido; `token`: troca de token recusada (ID, segredo, redirect URI ou escopos); `mailbox`: Gmail API/permissões; `storage`: erro ao salvar no Neon. Sem sucesso real no Google, o frontend não promete conexão.
