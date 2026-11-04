# Front-end do Uorqui — padrões e direção de navegação

[Português](frontend.md) · [English](../en/frontend.md)

## Estado do documento

O beta técnico contém **mensageiro 1:1 real, Descobrir, comunidades, salas de voz e reuniões em vídeo**. O feed global foi aposentado em 02/11/2026. A direção atual está em [Descobrir](descobrir.md), e a [auditoria de manutenção](auditoria-manutencao.md) foi realizada em 03/11. Deploy e testes práticos ainda exigem confirmação separada.

## Objetivo

Interface mobile-first para **descobrir comunidades, participar de canais/salas de voz e conversar individualmente**. Organização de canais e interações de chat podem se inspirar em padrões de mercado, mas a identidade visual, o código e o conteúdo devem ser próprios.

## Navegação implementada no código (nova direção)

- **Descobrir (início):** atividades reais dos canais e salas de voz das comunidades do usuário; busca e comunidades públicas recomendadas. Sem posts, feed infinito, filtro «Para você/Seguindo» ou modo vertical de vídeos.
- **Mensagens:** conversas individuais 1:1, histórico, anexos, reações e estados de entrega/leitura.
- **Comunidades:** espaços do usuário, canais de texto, voz, reuniões em vídeo, senhas por canal e moderação. Nas salas de voz/reunião, o texto inicia recolhido e pode ser expandido.
- **Perfil, notificações e configurações:** acessíveis sem ocupar obrigatoriamente uma aba principal. A privacidade do perfil continua independente de comunidades.

Em Descobrir, atalhos levam à comunidade e ao canal exato, sem ingressar automaticamente na chamada ou marcar mensagens como lidas. O usuário sem comunidades vê busca, recomendações públicas e estados vazios honestos. Privacidade e contagens são verificadas pela API.

## Retomar a última área acessada

- Depois de autenticar, a aplicação reabre a última área principal visitada pela mesma conta **neste navegador/dispositivo**: Comunidades, Conversas, Descobrir, Notificações, Perfil ou Moderação (somente com permissão).
- A preferência é salva no `localStorage` com chave vinculada ao ID do usuário; em um dispositivo novo ou sem armazenamento disponível, a área padrão é Comunidades. Não requer alteração do banco ou sincronização entre dispositivos.
- Links diretos de conversas, notificações e comunidades, convites recebidos e destinos de push **têm prioridade** sobre a preferência salva. Falta de acesso à Moderação retorna para Comunidades.
- As etapas automáticas do onboarding não substituem a última área escolhida; o onboarding inicial continua podendo terminar em Comunidades.

## Design system

- Preferir os componentes reutilizáveis **shadcn/ui (New York/Radix)** e tokens semânticos **Tailwind CSS v4** em `apps/web/src/styles.css`.
- **Motion** para transições curtas, respeitando `prefers-reduced-motion`.
- Componentes em `apps/web/src/components/ui/`. O [UI Kit](ui-kit.md) é **somente documentação**.
- Cabeçalhos fixos; navegação mobile adaptada ao teclado e safe areas; controle de foco e toque confortável; tradução PT/EN e temas Light/Dark.
- Skeleton nos carregamentos iniciais e spinners em ações dependentes da API. Atualizações em segundo plano não apagam dados já exibidos.
- Atividades, presenças, badges e recomendações não devem ser simulados como reais.

## Estado da migração e próxima validação

1. **Concluído:** substituir o feed global por Descobrir e atualizar navegação, links internos e onboarding.
2. **Concluído:** reutilizar atividades autorizadas e eventos SSE, inclusive aprovação direcionada à conta. As permissões continuam verificadas no servidor.
3. **Concluído na auditoria de 03/11:** retirar controles de compartilhamento do feed sem uso e corrigir o destino de links antigos de publicações.
4. **Preservado:** histórico de migrações Drizzle e mídias de recuperação; não excluir dados de produção por inferência de uso no front-end.
5. **Pendente:** validar desktop, iPhone Safari/PWA, Android/PWA, Light/Dark e PT/EN, incluindo captura de tela WebRTC e tela cheia da reunião.

## Validação e isolamento

`.github/workflows/web-ui.yml` valida TypeScript, Vite e configuração Wrangler; a publicação ocorre pelo Cloudflare Builds. CI verde não comprova deploy ou testes em dispositivos. Não alterar o Worker **legado** `uorqui-chat` nem suas bases de dados.
