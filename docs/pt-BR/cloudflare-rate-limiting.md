# Rate limiting do Uorqui na Cloudflare

**Ativo em produção em 10/11/2026** no domínio `uorqui.app`, plano **Free**.

## Regra ativa

| Configuração | Valor |
| --- | --- |
| Nome | Uorqui API — limite por IP |
| Fase | `http_ratelimit` |
| Ação | `block`, resposta padrão HTTP 429 |
| Limiar | 120 requisições por IP em 10 segundos |
| Duração da mitigação | 10 segundos |
| Características | `cf.colo.id` e `ip.src` |
| Cloudflare Ruleset ID | `4140c7da5580456aa1d69c48c18b638d` |
| Rule ID | `5d2e82e42e424683949333278747eb8e` |
| Referência | `uorqui_api_per_ip_burst_limit_v1` |

Expressão (Cloudflare Rules language):

```text
(starts_with(http.request.uri.path, "/api/") and http.request.uri.path ne "/api/v1/status" and http.request.uri.path ne "/api/v1/dm/events" and http.request.uri.path ne "/api/v1/communities/events")
```

Aplica-se às chamadas `/api/*`, incluindo autenticação, e-mail e comandos de mensagens. Exclui propositalmente os fluxos SSE de mensagens privadas e comunidades e a rota pública de status. As rotas `/health` e `/health/*` também ficam fora do limite, pois não correspondem a `/api/*`.

O limite é avaliado **por endereço IP e ponto de presença da Cloudflare**, não é uma cota global exata. Redes corporativas com IP compartilhado podem atingir o limite mais facilmente. A Cloudflare Free permite uma única regra de rate limiting e a janela de 10 segundos, com bloqueio de 10 segundos. Não foram removidas proteções existentes nem alteradas regras gerenciadas.

## Operação e diagnóstico

1. Abra **Cloudflare → uorqui.app → Security → Security rules → Rate limiting rules** para conferir os bloqueios e ajustar a regra.
2. Investigue primeiro se um HTTP 429 veio da origem ou da borda: `x-uorqui-upstream-429: 1` indica uma resposta 429 **repassada pelo Worker** da API de origem. Se o header não estiver presente, examine os eventos de segurança do Cloudflare antes de concluir a causa.
3. A regra reduz tráfego anormal encaminhado ao Render, mas **não elimina um 429 causado por cotas de tráfego, serviços indisponíveis ou limites impostos pelo Render**. Nesses casos, verificar o serviço de API e suas métricas.
4. Se usuários legítimos forem afetados, ajuste o limiar monitorando o tráfego real ou desative apenas esta regra no painel. Não desative globalmente WAF, proteção DDoS ou autenticação.
5. Os endpoints de mídia podem aumentar a quantidade de solicitações por IP; monitore envios em lote e organizações que compartilham IP. Teste login, chats, comunidades, emails e SSE após alterações.

**Versão documental:** `0.1.0-beta.32`. A configuração é um recurso **remoto, aplicado diretamente na Cloudflare**; fazer rollback de um commit Git não desfaz a regra. Consulte também [Notas de versão](../../CHANGELOG.pt-BR.md).

Referência: [Rate limiting rules](https://developers.cloudflare.com/waf/rate-limiting-rules/).
