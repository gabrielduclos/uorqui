# Hospedagem da API Uorqui (Node.js + Fastify)

A interface React é implantada pelo **Cloudflare Builds** no Worker `main`, em https://main.uorqui1.workers.dev. A API Fastify exige um runtime Node.js independente. **Nenhum backend online foi implantado ainda.**

## Blueprint opcional para Render

O arquivo `render.yaml` na raiz prepara apenas a API como serviço `uorqui-social-api`. O plano `free` é uma opção para desenvolvimento, sujeito à disponibilidade, limites e políticas de hibernação do Render. Não é uma recomendação de plano para produção com usuários reais. A criação do serviço e eventuais custos exigem aprovação da conta Render.

Após conectar o Render ao GitHub, importe o Blueprint para o repositório `gabrielduclos/uorqui`. A compilação ocorre na raiz para manter os workspaces npm:

- **Build:** `npm install --include=dev --no-audit --no-fund && npm run build -w @uorqui/api`
- **Start:** `node apps/api/dist/server.js`
- **Health:** `/health/ready` — exige configuração da autenticação e conexão Neon com as duas migrações. `/health/db` verifica somente o banco.
- **Node:** versão 22; `NODE_ENV=production`
- **Cadastro público:** `ENABLE_DEV_SIGNUP=false`, também bloqueado no código em produção

### Segredos e endereços

Configure `DATABASE_URL` **no painel privado do Render**, diretamente com a URI do projeto Neon `uorqui`. O Blueprint solicita o valor com `sync: false`, sem incluí-lo no GitHub. O Render pode gerar `AUTH_SECRET` aleatório no momento da criação, via `generateValue: true`. Nunca envie essas credenciais para commits, issues, logs ou chats.

A origem pública atual do front-end (`https://main.uorqui1.workers.dev`) está configurada como `AUTH_BASE_URL` e `WEB_ORIGIN` no Blueprint. Reavalie ambas se o endereço do site for alterado. O provedor da API gera seu próprio domínio HTTPS.

Depois que o backend estiver publicado e `GET /health/ready` retornar 200, configure **`API_ORIGIN` como variável de runtime** no Worker `main`, com a **origem HTTPS da API** (sem caminho, query ou barra extra). O Worker encaminhará `/api/*` à API e manterá a sessão no mesmo domínio público do front-end.

Os testes do GitHub Actions executam o Worker real por Wrangler, Fastify e PostgreSQL temporário para validar cookies, login, perfil e logout **sem usar dados da Neon principal**.

### Segurança de implantação

O Worker do front-end e o backend são dois serviços distintos. A API não deve carregar arquivos `.env` públicos; o `HOST` padrão em produção é `0.0.0.0` para que o provedor consiga acessá-la. Em desenvolvimento, o Fastify permanece restrito a `127.0.0.1`.

Não habilite criação de contas pública: falta confirmação de e-mail, recuperação de senha, proteção contra abuso e uma revisão de produção. O Render pode fazer o deploy automaticamente ao receber alterações na `main` depois da vinculação, **mas isso não significa que a API já está hospedada**.

Não conectar ao domínio `uorqui.app`, ao Worker `uorqui-chat` ou a bancos do mensageiro empresarial legado.
