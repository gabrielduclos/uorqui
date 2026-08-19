# Uorqui — arquitetura v1.0.0 com Cloudflare Pages

## Componentes

### Cloudflare Pages
Hospeda exclusivamente o frontend/PWA. Não possui Service Account, token de R2 ou segredo administrativo.

### Firebase Authentication
A conta Uorqui pertence à pessoa. O navegador obtém um Firebase ID Token e o envia como `Authorization: Bearer ...` para a API.

### Cloudflare Worker API
É a fronteira de segurança e regra de negócio. Valida o ID Token, checa vínculo com empresa/comunidade e então acessa Firestore/R2.

### Firestore
Fonte de verdade para dados estruturados: usuários, empresas, membros, comunidades, convites, posts, comentários, notificações e metadados de mídia.

### Cloudflare R2
Armazena imagens e anexos. O bucket permanece privado. O acesso passa pelo Worker.

### Cron Trigger
Executa manutenção de convites e lembretes.

## Fluxo de requisição

```text
Pages (uorqui.com.br)
  │
  ├── Firebase Auth ──> Firebase
  │
  └── Bearer ID Token
          │
          ▼
API Worker (api.uorqui.com.br)
  ├── verifica token Firebase
  ├── verifica autorização Uorqui
  ├── Firestore REST
  └── R2 privado
```

## CORS

Como Pages e Worker ficam em origins diferentes, o Worker aceita somente origens listadas em `ALLOWED_ORIGINS`. Em produção, deixe apenas os domínios reais do frontend e os origins locais necessários ao desenvolvimento.

## Convites

`APP_ORIGIN` aponta para o Pages. Por isso um convite de empresa gera:

```text
https://uorqui.com.br/?invite=<token>
```

e nunca um link para o domínio da API.

## Escopos de publicação

- `world`: qualquer usuário Uorqui autenticado.
- `company`: membros ativos da empresa.
- `community`: membros da comunidade.

## Entrada em empresas

1. Admin convida um e-mail.
2. Worker cria token aleatório e armazena somente SHA-256.
3. Usuário existente vê o convite na Central de Notificações.
4. Usuário inexistente abre o link no Pages e cria sua conta.
5. Após autenticação, o token é enviado ao Worker e aceito.
6. O usuário entra na empresa e nas comunidades padrão.

## Entrada em comunidades

Não existe join público na v1. O administrador convida alguém que já pertence à empresa.

## Separação de deploy

O frontend pode receber novos deploys no Pages sem republicar a API. O Worker pode evoluir de forma independente. Essa separação também permite previews do Pages sem expor secrets de backend.
