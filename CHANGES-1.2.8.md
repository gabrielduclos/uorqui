# Uorqui 1.2.8

## Página de Planos

- Nova view `Planos`.
- Compara Free e Premium de forma simples.
- Reforça que o plano pertence à empresa, não ao usuário.
- Free: até 5 pessoas e 2 comunidades, sem prazo.
- Premium: remove esses dois limites.
- Checkout do Premium usa a integração Asaas já existente.
- Se a conta participa de mais de uma empresa, a página permite trocar a empresa.

## Oferta após criar empresa

- A primeira empresa criada no onboarding abre a página de Planos.
- Uma nova empresa criada pelo Perfil também abre a página de Planos.
- A mensagem deixa claro que a empresa já pode continuar no Free; Premium é opcional.

## Upgrade ao atingir limites

Quando o Worker retorna HTTP 402 por limite do Free:

- tentativa de criar a 3ª comunidade → abre Planos;
- tentativa de convidar além do limite de 5 pessoas → abre Planos;
- tentativa de criar comunidade pela tela Comunidades → abre Planos.

A mensagem original do backend é preservada na página para explicar por que o upgrade foi oferecido.

## Acesso

- `Planos` aparece no menu lateral desktop.
- `Empresas` possui botão `Ver planos`.
- A área Administrar possui atalho de plano.
- Limites no mobile também redirecionam automaticamente para Planos.

## Billing

Nenhuma nova integração financeira foi criada.
A página reutiliza:

```text
POST /api/companies/:companyId/billing/checkout
```

e os Secrets/configurações do Asaas já previstos no projeto.

## Cache

- Service Worker atualizado para `uorqui-react-v1.2.8`.
