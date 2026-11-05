# Interface inspirada no Shadboard e experiência de canais inspirada no Stoat

Esta mudança adapta conceitos visuais e de interação sem copiar a aplicação Stoat ou migrar o runtime Next.js do [Shadboard](https://github.com/Qualiora/shadboard), distribuído sob licença MIT.

## Implementado

- Layout de dashboard compacto, sidebar recolhível, agrupamento da navegação, breadcrumb contextual, cores neutras nos temas claro/escuro e listas mais densas no desktop.
- Transições direcionais entre módulos (190 ms no mobile e 160 ms no desktop) e nos históricos de canais (175/145 ms), com suporte a movimento reduzido.
- Mantidos React/Vite, Cloudflare, API Fastify no Render, Neon/Drizzle, permissões server-side e o SSE compartilhado.
- Ao voltar a um canal já visitado, o histórico surge do cache em memória imediatamente; a API revalida os dados em silêncio.
- Eventos SSE de comunidades atualizam somente o canal selecionado; consultas simultâneas são agrupadas, chamadas duplicadas próximas são limitadas e mensagens inalteradas mantêm sua identidade na renderização.
- Mensagens agrupadas por autor em até cinco minutos, posição de rolagem por canal e botão de novas mensagens quando o leitor está acima do final.
- Cache isolado por conta, limitado a 24 canais, somente em memória e apagado ao sair ou perder o acesso. **Não** persistimos mensagens protegidas em IndexedDB nesta etapa.
- Preservados os envios otimistas, os recibos SSE das mensagens privadas, mídia em cache, WebRTC e a montagem persistente das comunidades.

## Limitações desta etapa

- O endpoint autorizado ainda retorna as últimas 100 mensagens a cada atualização. Foram reduzidas consultas redundantes e retrabalho no React, mas não foram implementados cursor incremental no backend nem virtualização de histórico.
- Não houve migração para Next.js nem criação de novos fluxos de empresas, clientes ou permissões multiempresa.

## Testes necessários

1. Trocar comunidades e canais, validando permissões e canal protegido.
2. Rolar para cima, sair e voltar; conferir posição e indicador de novas mensagens.
3. Testar envio otimista, arquivos, reações, edição, exclusão e reenvio após falha.
4. Navegar com chamada de voz/reunião ativa e verificar que não desconecta.
5. Validar voltar no mobile, headers fixos, teclado PWA, safe areas e ambos os temas.
6. Conferir badges, último módulo aberto e prioridade de convites/links diretos.
7. Conferir preferência por movimento reduzido e revogação de acesso.
8. Executar `npm run typecheck` e `npm run build`, verificando GitHub Actions.
