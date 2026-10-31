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

O formulário **Criar conta** é sempre navegável, mas a API só autoriza novos usuários em produção depois da ativação explícita. A implementação de verificação de e-mail, recuperação de senha e desafio Turnstile já está versionada, porém exige validação dos fornecedores em produção. O Render faz auto deploy a partir da `main`, mas CI verde não substitui validação real.

Não conectar ao domínio `uorqui.app`, ao Worker `uorqui-chat` ou a bancos do mensageiro empresarial legado.

## Habilitar cadastro público (ainda pendente)

1. No [Resend](https://resend.com), verificar um domínio remetente e criar a chave de envio; definir `RESEND_API_KEY` e `AUTH_EMAIL_FROM` (por exemplo, `Uorqui <conta@dominio-verificado.example>`) **somente no Render → Environment**.
2. No [Cloudflare Turnstile](https://dash.cloudflare.com/), criar widget para o domínio real do front-end (`main.uorqui1.workers.dev`, enquanto não houver migração de domínio); definir `TURNSTILE_SITE_KEY` e `TURNSTILE_SECRET_KEY` **no Render**. A API valida os tokens com o serviço Turnstile, inclusive em chamadas diretamente ao endereço do Render.
3. Validar envio/entrega de verificação, link de confirmação, recuperação, reenvio, CAPTCHA e rejeição de tentativas inválidas usando contas de teste, sem copiar senhas/links de verificação para logs e chats.
4. Somente depois, definir `ENABLE_PUBLIC_SIGNUP=true` no Render e fazer deploy; verificar que `GET /api/v1/status` retorna `publicRegistration:true` e que o fluxo real de inscrição funciona.
5. Para suspender novas contas, definir `ENABLE_PUBLIC_SIGNUP=false` e publicar novamente. Isso não remove contas existentes.

O modo de desenvolvimento (`ENABLE_DEV_SIGNUP=true`) continua restrito a `NODE_ENV=development|test`; não libera produção. As senhas continuam com mínimo de 12 caracteres para preservar a política existente. A interface segue as regras globais relevantes: criação primeiro, login alternativo, inputs de 16px, senha visível sob demanda, spinner em ações e formulário preservado em erro. `uorqui.app` e `uorqui-chat` legados não são alterados.
