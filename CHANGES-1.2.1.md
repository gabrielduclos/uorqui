# Uorqui 1.2.1

## Superadmin

- Criado nível global `Superadmin`.
- Autorização exclusivamente no Worker usando Firebase UID.
- Novo Secret: `SUPERADMIN_UIDS`.
- Menu Superadmin aparece somente para UIDs autorizados.
- Atalho também aparece no Perfil.
- Uma conta Superadmin pode abrir o painel mesmo sem participar de uma empresa.

## Métricas

O dashboard mostra:

- total de usuários;
- novos usuários em 30 dias;
- total de empresas;
- novas empresas em 30 dias;
- empresas Free;
- empresas Premium;
- Premium pago via Asaas;
- Premium manual/cortesia;
- vínculos ativos de equipe;
- comunidades;
- publicações;
- comentários;
- atividade dos últimos 30 dias;
- MRR estimado.

## Premium manual

- Superadmin pode conceder Premium a qualquer empresa.
- Períodos rápidos: 30, 60, 90, 180 e 365 dias.
- Uma nova concessão adiciona tempo ao período manual ainda ativo.
- Superadmin pode remover somente a cortesia manual.
- Uma assinatura Asaas paga não é cancelada ao remover a cortesia.
- Free/Premium continua pertencendo à empresa, não à conta do usuário.
- Os limites Free de 5 membros e 2 comunidades passam a ignorar a limitação
  enquanto a empresa tiver Premium manual ativo.

## Auditoria e privacidade

- Concessões e remoções são registradas em `superadminAudit`.
- O Superadmin não recebe acesso automático ao conteúdo privado das empresas.
- O dashboard usa apenas metadados e contagens operacionais.

## Cache

- Service Worker atualizado para `uorqui-react-v1.2.1`.

## Deploy

A versão altera Worker e frontend.

Depois do deploy configure:

```bash
npx wrangler secret put SUPERADMIN_UIDS
```

Não coloque o UID do Superadmin em `wrangler.jsonc` ou no frontend.
