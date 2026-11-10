# Registro de rate limit da Cloudflare — Uorqui

[Português](cloudflare-rate-limiting.md) · [English](../en/cloudflare-rate-limiting.md)

**Situação atual (verificada em 10/11/2026): DESATIVADO.** Não há regra personalizada ativa na fase `http_ratelimit` da zona `uorqui.app`. É uma configuração feita pelo painel/API da Cloudflare, **não** uma opção ativada pelo deploy do Git.

## Regra histórica (preservada, sem execução)

| Configuração | Valor |
| --- | --- |
| Nome | Uorqui API — limite por IP |
| Fase | `http_ratelimit` |
| **Ativa** | **Não (desativada em 10/11/2026)** |
| Ação anterior | Bloqueio com HTTP 429 |
| Limiar anterior | 120 requisições / 10 segundos por IP público e colo da Cloudflare |
| Bloqueio anterior | 10 segundos |
| Ruleset ID | `4140c7da5580456aa1d69c48c18b638d` |
| Rule ID | `5d2e82e42e424683949333278747eb8e` |

Expressão histórica:

```text
(starts_with(http.request.uri.path, "/api/") and http.request.uri.path ne "/api/v1/status" and http.request.uri.path ne "/api/v1/dm/events" and http.request.uri.path ne "/api/v1/communities/events")
```

A regra foi **criada depois dos primeiros erros 429**, então não explica as ocorrências iniciais. Entretanto, a contagem por IP poderia bloquear usuários legítimos com o mesmo Wi-Fi/IP público (NAT). Ela foi desativada para diagnóstico controlado, **não** por dispensar proteção contra abuso.

## Proteções que permanecem

- As proteções contra DDoS e as regras gerenciadas de segurança da Cloudflare não foram alteradas.
- Os controles de autenticação do Fastify/Better Auth e limites próprios da aplicação continuam aplicáveis, inclusive com possibilidade de HTTP 429.
- O Render também pode impor limites de tráfego; **nem todo HTTP 429 vem da Cloudflare**.

## Como investigar um novo HTTP 429

1. Execute `window.__uorquiRateLimitDiagnostics()` e `window.__uorquiAuthDiagnostics()` (beta.36) para consultar dados sanitizados da aba atual.
2. `x-uorqui-upstream-429: 1` significa que o Worker repassou um erro da origem/API; a ausência **não prova** bloqueio da Cloudflare.
3. Confira Security Events na Cloudflare, logs do Render, `x-uorqui-rate-limit-scope` quando houver e o comportamento do Better Auth. Correlacione horário e rota; IP compartilhado não é sinônimo de um usuário.
4. Se um novo limite na borda for necessário, aplique-o primeiro a rotas sensíveis e teste vários usuários no mesmo IP público, em vez de reativar automaticamente a regra global anterior.

**Atenção:** reverter um commit do Git **não** altera essa configuração remota da Cloudflare. Verifique no painel antes de declarar que a regra está ativa ou não. Veja [notas de versão](../../CHANGELOG.pt-BR.md) e [estudo de caso](portfolio.md).

[Documentação de rate limit da Cloudflare](https://developers.cloudflare.com/waf/rate-limiting-rules/).
