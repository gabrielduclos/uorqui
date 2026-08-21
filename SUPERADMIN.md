# Uorqui Superadmin — v1.2.1

## O que foi criado

O Superadmin é um nível global da plataforma Uorqui, separado dos níveis
Proprietário/Administrador/Usuário de cada empresa.

Ele possui:

- métricas globais do produto;
- lista de empresas;
- plano efetivo Free/Premium de cada empresa;
- quantidade de membros e comunidades;
- proprietário da empresa;
- empresas Premium pagas via Asaas;
- empresas Premium concedidas manualmente;
- MRR estimado com base apenas nas empresas Premium pagas;
- concessão de Premium manual por 30, 60, 90, 180 ou 365 dias;
- adição de mais tempo a uma cortesia já ativa;
- remoção apenas da cortesia manual.

O Superadmin NÃO ganha acesso automático às conversas privadas, comentários,
arquivos ou comunidades das empresas.

## Segurança

A autorização é feita pelo Firebase UID e validada exclusivamente no Worker.

Configure em produção:

```bash
npx wrangler secret put SUPERADMIN_UIDS
```

Quando solicitado, informe o UID exato do usuário no Firebase Authentication.

Para mais de um Superadmin:

```text
uid_do_usuario_1,uid_do_usuario_2
```

Não coloque esse valor no frontend.

Se `SUPERADMIN_UIDS` não estiver configurado, nenhum usuário terá acesso
Superadmin.

## Como descobrir o UID

No Firebase Console:

Authentication → Users → selecione o usuário → User UID.

Use o UID, não a senha e não um token.

## Premium manual

O Premium concedido pelo Superadmin é uma cortesia separada da cobrança Asaas.

Campos usados:

```text
manualPremiumUntil
manualPremiumGrantedAt
manualPremiumGrantedBy
```

Enquanto `manualPremiumUntil` estiver no futuro, a empresa possui os limites
Premium mesmo que não exista assinatura paga.

Se uma empresa também possuir assinatura paga, remover a cortesia NÃO cancela
o pagamento e NÃO remove o Premium pago.

As concessões e remoções são registradas na coleção:

```text
superadminAudit
```

## Métricas

O painel mostra:

- usuários;
- novos usuários em 30 dias;
- empresas;
- novas empresas em 30 dias;
- Free x Premium;
- Premium pago x cortesia;
- vínculos ativos de equipe;
- comunidades;
- publicações;
- comentários;
- atividade de posts/comentários em 30 dias;
- MRR estimado.

O MRR é uma estimativa:

```text
empresas Premium pagas × PREMIUM_MONTHLY_PRICE_BRL
```

Ele não substitui conciliação financeira do Asaas.

## Observação de escala

Nesta primeira versão o painel Superadmin faz leituras agregadas das coleções
para montar as métricas. Isso é adequado para a fase inicial do produto.
Quando o volume crescer, migre as métricas para contadores/materialized stats
atualizados por eventos para reduzir leituras Firestore.
