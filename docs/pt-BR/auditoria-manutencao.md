# Auditoria de código e manutenção — 03/11/2026

**Escopo:** revisão estática dos módulos TypeScript/React em `apps/web/src`, das rotas e serviços Fastify em `apps/api/src`, dos pontos de entrada, das referências entre componentes e da documentação. Esta revisão **não é** uma certificação de produção, uma análise completa de segurança nem uma varredura de todos os fluxos possíveis de execução. Não houve alteração em banco, bucket R2, contas ou infraestrutura.

## Mudanças realizadas

| Área | Evidência e ação |
| --- | --- |
| Salas de voz e reuniões | `LiveCommunities` passou a iniciar o painel de texto **recolhido**, nas duas modalidades. O botão de expandir/recolher e a chamada WebRTC foram preservados. |
| Compartilhamento legado de posts | `InternalShareDialog` só é chamado atualmente pelo mensageiro com origem `kind: 'message'`. Foram retirados o tipo `post`, o envio de links `/?post=` e os botões externos exclusivos do feed aposentado. |
| Links antigos recebidos em DMs | `DirectMessageBubble` ainda identifica URLs antigas de post para exibir o contexto, mas não emite mais o evento sem destinatário `uorqui:open-feed-post` nem oferece uma navegação quebrada. O destinatário vê um aviso de publicação antiga indisponível. |
| Componentes sem referências | As primitivas `components/ui/sheet.tsx` e `components/ui/tabs.tsx` não estavam importadas pelos módulos ativos inspecionados; foram retiradas. Podem ser recriadas pelo shadcn se voltarem a ser necessárias. |
| Reuniões e aprovação | Conferidos o uso de `CommunityVoiceRoom`, `VoicePortalShell`, o compartilhamento WebRTC, a detecção de fala e os eventos SSE direcionados ao solicitante aprovado. São funcionalidades **ativas** e não código morto. |

## Código preservado deliberadamente

- **Migrações Drizzle antigas:** arquivos SQL, snapshots e o journal são parte do histórico de migração; não devem ser excluídos só porque o feed global terminou. A migração de aposentadoria `0029` também deve continuar versionada.
- **Compatibilidade com mensagens anteriores:** o registro de referências antigas em mensagens privadas não autoriza reativar endpoints de posts nem apagar histórico de DMs.
- **Ferramentas e primitivas de desenvolvimento:** `apps/api/src/auth/auth.cli.ts` é ponto de entrada da configuração da CLI de autenticação, mesmo não sendo chamado pela API HTTP.
- **Backups e mídia legada:** nenhuma exclusão de dados Neon ou arquivos R2 foi realizada. Preservar as cópias de recuperação existentes até uma decisão explícita de retenção.

## Pendências identificadas

1. **Traduções e textos históricos:** `UorquiPreferences.tsx` mantém chaves de telas demonstrativas e feed anterior; uma futura limpeza deve confrontar **cada chave** com todas as chamadas `t(...)` antes de apagá-la.
2. **Textos legais:** `LegalPages.tsx` ainda contém referências ao feed. Alterar termos e políticas publicados exige revisão do conteúdo e do versionamento de aceite; não foram alterados automaticamente nesta auditoria.
3. **Documentação histórica:** a descrição do feed nas notas do lançamento original e nas migrações é registro histórico legítimo. As páginas atuais de apresentação, roadmap e UI Kit devem indicar claramente o feed como **aposentado**, nunca ativo.
4. **Validação em dispositivos:** reunir pelo menos dois usuários em navegadores/redes diferentes e testar câmera, microfone, alternância de quem fala, compartilhamento de tela, tela cheia e o PWA iOS/Android. Suporte a `getDisplayMedia` é específico do navegador.

## Critérios de validação

- `npm run typecheck` e `npm run build` (Web e API).
- GitHub Actions: **Web UI**, **API checks** e **API auth integration (temporary PostgreSQL)**.
- Não confundir CI aprovado com deploy confirmado em Cloudflare/Render ou testes de hardware.
- Revisar novamente imports e conteúdo antes de remover qualquer arquivo adicional. Não fazer limpeza destrutiva no PostgreSQL de produção por inferência de que um módulo está sem uso.

Consulte também [Reuniões](reunioes-video.md), [Descobrir](descobrir.md) e [Arquitetura](arquitetura.md).
