# Uorqui Premium — integração Asaas (Pix + cartão)

## Modelo

O plano pertence à **empresa**, não ao usuário. Uma mesma conta Uorqui pode participar, por exemplo, de uma empresa Free e outra Premium.

### Free
- Funcionalidades completas.
- Até **5 membros ativos** por empresa.
- Até **2 comunidades** por empresa.

### Premium
- Remove os dois limites acima.
- Preço inicial configurável: **R$ 49,90/mês por empresa**.

O Worker valida os limites no backend. Não dependa de bloqueios apenas no React.

## Por que Asaas

O Uorqui usa o **Asaas Checkout hospedado**. Assim, cartão/CVV e a jornada Pix ficam no ambiente do provedor; o frontend Uorqui não armazena dados de cartão. O checkout é criado com `PIX` e `CREDIT_CARD` e cobrança `RECURRENT`.

## 1. Comece no Sandbox

Crie/acesse uma conta Sandbox do Asaas e gere uma chave de API de Sandbox. Não coloque essa chave no Git nem envie em conversa.

No Worker `uorqui-api`, configure os Secrets:

```bash
npx wrangler secret put ASAAS_API_KEY
npx wrangler secret put ASAAS_WEBHOOK_TOKEN
```

Use um `ASAAS_WEBHOOK_TOKEN` forte e diferente da API Key.

O `wrangler.jsonc` desta versão inicia com:

```jsonc
"ASAAS_ENV": "sandbox",
"PREMIUM_MONTHLY_PRICE_BRL": "49.90"
```

## 2. Webhook

No painel/API do Asaas, crie um webhook apontando para:

```text
https://SEU-DOMINIO/api/webhooks/asaas
```

Configure o token de autenticação do webhook com **exatamente o mesmo valor** de `ASAAS_WEBHOOK_TOKEN`. O Worker valida o header `asaas-access-token`.

Eventos que o Uorqui já processa:

```text
CHECKOUT_PAID
CHECKOUT_CANCELED
CHECKOUT_EXPIRED
PAYMENT_CONFIRMED
PAYMENT_RECEIVED
PAYMENT_OVERDUE
PAYMENT_REFUNDED
PAYMENT_DELETED
PAYMENT_CHARGEBACK_REQUESTED
SUBSCRIPTION_CREATED
SUBSCRIPTION_UPDATED
SUBSCRIPTION_INACTIVATED
SUBSCRIPTION_DELETED
```

Os eventos são salvos em `billingWebhookEvents` para idempotência. O redirecionamento do checkout **não ativa** Premium; quem ativa é o webhook confirmado pelo Asaas.

## 3. Teste

1. Entre como Proprietário de uma empresa Free.
2. Abra **Empresas**.
3. Clique em **Ativar Premium**.
4. Faça um pagamento de teste no Checkout Sandbox.
5. Confirme que o webhook chegou.
6. Volte ao Uorqui e confira o badge Premium.
7. Teste criar a terceira comunidade e convidar o sexto membro.

Sem `ASAAS_API_KEY` e `ASAAS_WEBHOOK_TOKEN`, o botão de cobrança fica desabilitado.

## 4. Produção

Depois de validar Sandbox:

1. troque o Secret `ASAAS_API_KEY` pela chave de produção;
2. mantenha um token próprio de webhook;
3. altere `ASAAS_ENV` para `production`;
4. configure o webhook de produção;
5. faça uma cobrança real de baixo valor antes de liberar para clientes.

## Pix recorrente

Na assinatura tradicional, o Asaas gera as cobranças recorrentes. Cartão pode ser cobrado automaticamente; em Pix tradicional, o cliente paga as cobranças Pix geradas. Para débito recorrente automático via Pix, o produto específico é **Pix Automático** e pode ser integrado em uma segunda etapa.
