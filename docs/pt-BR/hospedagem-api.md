# Hospedagem da API Uorqui (Node.js + Fastify)

A interface React é implantada pelo **Cloudflare Builds** no Worker `main`, em https://main.uorqui1.workers.dev. A API Fastify exige um runtime Node.js independente. **API publicada no Render:** https://uorqui-social-api.onrender.com. Deploy e verificações de saúde reais foram confirmados em 31/10/2026; valide novamente após cada alteração.

## Blueprint ativo no Render

O arquivo `render.yaml` na raiz configura a API como serviço `uorqui-social-api`. O plano `free` é uma opção para desenvolvimento, sujeito à disponibilidade, limites e políticas de hibernação do Render. Não é uma recomendação de plano para produção com usuários reais. A criação do serviço e eventuais custos exigem aprovação da conta Render.

Após conectar o Render ao GitHub, importe o Blueprint para o repositório `gabrielduclos/uorqui`. A compilação ocorre na raiz para manter os workspaces npm:

- **Build:** `npm install --include=dev --no-audit --no-fund && npm run build -w @uorqui/api`
- **Start:** `node apps/api/dist/server.js`
- **Health:** `/health/ready` — exige configuração da autenticação e conexão Neon com as duas migrações. `/health/db` verifica somente o banco.
- **Node:** versão 22; `NODE_ENV=production`
- **Cadastro de desenvolvimento:** `ENABLE_DEV_SIGNUP=false` em produção. Cadastro público exige configuração de e-mail e antiabuso e habilitação explícita.

### Segredos e endereços

Configure `DATABASE_URL` **no painel privado do Render**, diretamente com a URI do projeto Neon `uorqui`. O Blueprint solicita o valor com `sync: false`, sem incluí-lo no GitHub. O Render pode gerar `AUTH_SECRET` aleatório no momento da criação, via `generateValue: true`. Nunca envie essas credenciais para commits, issues, logs ou chats.

A origem pública atual do front-end (`https://main.uorqui1.workers.dev`) está configurada como `AUTH_BASE_URL` e `WEB_ORIGIN` no Blueprint. Reavalie ambas se o endereço do site for alterado. O provedor da API gera seu próprio domínio HTTPS.

O Worker `main` já utiliza **`API_ORIGIN=https://uorqui-social-api.onrender.com`** (URL pública, sem segredo). Após cada deploy, confirme `GET /health/ready` e teste o fluxo pelo Worker. O Worker encaminhará `/api/*` à API e manterá a sessão no mesmo domínio público do front-end.

Os testes do GitHub Actions executam o Worker real por Wrangler, Fastify e PostgreSQL temporário para validar cookies, login, perfil e logout **sem usar dados da Neon principal**.

### Segurança de implantação

O Worker do front-end e o backend são dois serviços distintos. A API não deve carregar arquivos `.env` públicos; o `HOST` padrão em produção é `0.0.0.0` para que o provedor consiga acessá-la. Em desenvolvimento, o Fastify permanece restrito a `127.0.0.1`.

O formulário **Criar conta** é sempre navegável e a API recebeu autorização explícita de cadastro em produção em 31/10/2026; verificação humana e entrega de e-mail ainda precisam de teste real. A implementação de verificação de e-mail, recuperação de senha e desafio Turnstile já está versionada, porém exige validação dos fornecedores em produção. O Render faz auto deploy a partir da `main`, mas CI verde não substitui validação real.

Não conectar ao domínio `uorqui.app`, ao Worker `uorqui-chat` ou a bancos do mensageiro empresarial legado.

## Cadastro público habilitado — validação humana pendente

1. No [Resend](https://resend.com), verificar um domínio remetente e criar a chave de envio; definir `RESEND_API_KEY` e `AUTH_EMAIL_FROM` (por exemplo, `Uorqui <conta@dominio-verificado.example>`) **somente no Render → Environment**.
2. No [Cloudflare Turnstile](https://dash.cloudflare.com/), criar widget para o domínio real do front-end (`main.uorqui1.workers.dev`, enquanto não houver migração de domínio); definir `TURNSTILE_SITE_KEY` e `TURNSTILE_SECRET_KEY` **no Render**. A API valida os tokens com o serviço Turnstile, inclusive em chamadas diretamente ao endereço do Render.
3. Validar envio/entrega de verificação, link de confirmação, recuperação, reenvio, CAPTCHA e rejeição de tentativas inválidas usando contas de teste, sem copiar senhas/links de verificação para logs e chats.
4. **Aplicado em 31/10/2026:** `ENABLE_PUBLIC_SIGNUP=true` no Render, com `publicRegistration:true` confirmado pelo Worker. Falta validar o fluxo de uma pessoa real (Turnstile aprovado, e-mail entregue e confirmado).
5. Para suspender novas contas, definir `ENABLE_PUBLIC_SIGNUP=false` e publicar novamente. Isso não remove contas existentes.

O modo de desenvolvimento (`ENABLE_DEV_SIGNUP=true`) continua restrito a `NODE_ENV=development|test`; não libera produção. As senhas continuam com mínimo de 12 caracteres para preservar a política existente. A interface segue as regras globais relevantes: criação primeiro, login alternativo, inputs de 16px, senha visível sob demanda, spinner em ações e formulário preservado em erro. `uorqui.app` e `uorqui-chat` legados não são alterados.

### Evidência de ativação (31/10/2026)

- GitHub Actions [smoke de produção 41205954207](https://github.com/gabrielduclos/uorqui/actions/runs/41205954207): três testes aprovados, incluindo health Worker/Render/Neon, perfil anônimo 401, `publicRegistration:true` com e-mail e recuperação habilitados, e rejeição HTTP 403 de tokens Turnstile inválidos para cadastro, recuperação, reenvio e acesso direto ao Render.
- **Atenção:** este teste não executa um desafio humano real e não verifica a entrega de uma mensagem do Resend. Antes de divulgar o cadastro, realizar teste manual com conta própria e verificar inbox/spam, confirmação e login. Se a inscrição falhar, desabilitar imediatamente `ENABLE_PUBLIC_SIGNUP` e investigar os logs sem expor tokens.

## Salas de voz — integração opcional Cloudflare Realtime TURN

O backend valida a presença e as mensagens de sinalização WebRTC para membros de canais de voz. A mídia (áudio) trafega diretamente pelo WebRTC; a API não hospeda um servidor de áudio.

A configuração básica usa apenas `stun:stun.cloudflare.com:3478`; nessa modalidade, algumas redes corporativas e CGNAT/firewalls podem impedir áudio. Para habilitar TURN, crie uma chave no Cloudflare Realtime TURN (pode haver cobrança por tráfego) e configure **somente no serviço Render da API**:

- `CLOUDFLARE_TURN_KEY_ID`: identificador da chave do serviço TURN.
- `CLOUDFLARE_TURN_API_TOKEN`: token secreto de autenticação do endpoint REST do Cloudflare Realtime.

Na entrada autenticada de uma sala, a API chama `POST https://rtc.live.cloudflare.com/v1/turn/keys/{keyId}/credentials/generate-ice-servers` com `{"ttl":3600}`. Ela envia ao navegador **apenas** credenciais ICE efêmeras, nunca as credenciais da chave principal. Se a geração falhar, o servidor usa STUN apenas e o frontend sinaliza essa limitação.

Limites e operação: até 6 participantes conectados simultaneamente por sala; sessão expira após 45 s sem heartbeat; sinais de negociação expiram após 3 min. A migração `0012_voice_signaling` adiciona `community_voice_sessions` e `community_voice_signals` (sem gravações), com controle de sessão, permissões, taxa e origem.

**Sequência de publicação:** validar CI e migração Drizzle; aplicar `0012` ao Neon; depois integrar/deploy da API e frontend. Antes de divulgar como pronta para uso amplo, testar dois dispositivos e TURN em redes diferentes.


## Moderação da plataforma (beta)

A moderação de conteúdo é separada dos cargos de comunidade: proprietários, administradores e moderadores de comunidade **não** recebem acesso às denúncias privadas. O painel é ocultado por padrão e o backend aplica autorização em todas as leituras e escritas.

- Configure `PLATFORM_MODERATOR_USER_IDS` **somente no ambiente privado do Render**, com os UUIDs exatos das contas Uorqui da equipe, separados por vírgula. Sem a variável, ninguém tem acesso administrativo.
- Obtenha o UUID da conta autorizada na resposta autenticada de `GET /api/v1/me` (campo `user.id`); não use e-mail, handle ou ID de GitHub.
- Depois de ajustar a variável, reinicie/republique a API e confirme em `GET /api/v1/moderation/access` que somente as contas permitidas retornam `moderator:true`.
- A área **Moderação** aparece no menu desktop e no perfil mobile apenas para a conta autorizada.
- O endpoint `POST /api/v1/reports` registra denúncias de post, mensagem privada ou de canal, sem ocultar conteúdo automaticamente.
- O painel lista evidências privadas, autores e denunciantes; oferece filtros por tipo/status, histórico de decisões e as ações **Em análise**, **Resolver sem remover**, **Descartar** e **Remover conteúdo** (esta exige nota interna).
- A alteração de status e a trilha de auditoria são transacionadas com a remoção do conteúdo. Remoções de mensagens disparam eventos de sincronização sem expor dados da denúncia.
- Não são enviados alertas ou dados da denúncia à pessoa denunciada. É preciso definir uma política de retenção e regras de acesso antes de abrir amplamente a plataforma.

**Ordem de implantação:** aplicar a migração `0023_content_reports` à Neon, verificar `content_reports` e `moderation_report_actions`, depois publicar API e interface. Executar testes em ambiente isolado antes de configurar moderadores reais. Não apontar o projeto novo para o banco do mensageiro empresarial legado.

## PWA e notificações Web Push (novo Uorqui)

A implementação é independente do Uorqui empresarial antigo. O frontend no Cloudflare Worker publica `/manifest.webmanifest`, `/sw.js` e ícones 192/512. O service worker mantém somente assets estáticos versionados em cache; **não** armazena API, sessão, mensagens, mídia nem o HTML de entrada. O convite para instalar aparece, no máximo, uma vez ao dia por conta/dispositivo quando ainda não estiver em modo standalone.

**Configurando Render:**

1. Aplique a migração `0025_push_subscriptions.sql` na Neon, antes de atualizar a API.
2. Configure no serviço Render da API `VAPID_PUBLIC_KEY` e `VAPID_PRIVATE_KEY` para uma chave EC P-256 própria deste projeto, codificada em Base64 URL sem preenchimento. Opcional: `VAPID_SUBJECT=mailto:<contato real>`. Não copie as chaves do mensageiro empresarial.
3. Confira `GET /api/v1/push/config`: `enabled:true`, sem expor a chave privada.
4. Em duas contas diferentes, ative as notificações por ação explícita no perfil, envie mensagem privada entre elas e confira `deliveredAt` após o service worker do destinatário confirmar. **A resposta HTTP 201/202 do serviço de push não é confirmação de entrega.**
5. Em iPhone/iPad, instale o PWA na tela de início primeiro e permita notificações nele; navegadores de abas iOS não oferecem o mesmo fluxo.
6. Teste outra conta no mesmo navegador: um push antigo jamais deve aparecer para a nova conta. Ao sair, o frontend revoga a inscrição *antes* de expirar a sessão.

**Segurança:** apenas endpoints conhecidos de provedores HTTPS são aceitos; os registros Web Push são vinculados à conta e limitados por usuário. O aviso é genérico e não transmite texto privado da conversa pelo push. O service worker verifica a sessão atual antes de mostrar o aviso e então manda um recibo HMAC assinado e autenticado; o servidor confirma a versão exata da mensagem. O recibo marca `delivered_at`, jamais `read_at`. As regras existentes de leitura e recebimento pelo aplicativo aberto continuam ativas.

**Escopo atual:** DM nova, editada e encaminhada; mensagens de canais de texto para membros inscritos (limite de 200 endpoints por mensagem). Reações, convites, notificações de comunidades com alto volume, preferências granulares por canal, tentativas persistentes em fila e badges do sistema operacional podem ser evoluídos separadamente. Envio remoto em segundo plano é best-effort nesta etapa; não há garantia contratual de entrega. O frontend deve ser validado em Android, iOS Home Screen e desktop antes do beta aberto.
