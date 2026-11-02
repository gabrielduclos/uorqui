# Front-end do Uorqui — padrões e direção de navegação

[Português](frontend.md) · [English](../en/frontend.md)

## Estado do documento

O beta técnico já contém **mensageiro real, comunidades reais, feed híbrido legado e salas de voz**. As telas demonstrativas citadas na documentação inicial não representam mais o estado do aplicativo. A direção aprovada em **02/11/2026**, detalhada em [Descobrir](descobrir.md), **ainda precisa ser implementada no front-end**.

## Objetivo

Interface mobile-first para **descobrir comunidades, participar de canais/salas de voz e conversar individualmente**. Organização de canais e interações de chat podem se inspirar em padrões de mercado, mas a identidade visual, o código e o conteúdo devem ser próprios.

## Navegação futura

- **Descobrir (início):** atividades reais dos canais e salas de voz das comunidades do usuário; busca e comunidades públicas recomendadas. Sem posts, feed infinito, filtro «Para você/Seguindo» ou modo vertical de vídeos.
- **Mensagens:** conversas individuais 1:1, histórico, anexos, reações e estados de entrega/leitura.
- **Comunidades:** espaços do usuário, canais de texto, salas de voz e ferramentas de administração/moderação.
- **Perfil, notificações e configurações:** acessíveis sem ocupar obrigatoriamente uma aba principal. A privacidade do perfil continua independente de comunidades.

Em Descobrir, atalhos levam à comunidade e ao canal exato, sem ingressar automaticamente na chamada ou marcar mensagens como lidas. O usuário sem comunidades vê busca, recomendações públicas e estados vazios honestos. Privacidade e contagens são verificadas pela API.

## Design system

- Preferir os componentes reutilizáveis **shadcn/ui (New York/Radix)** e tokens semânticos **Tailwind CSS v4** em `apps/web/src/styles.css`.
- **Motion** para transições curtas, respeitando `prefers-reduced-motion`.
- Componentes em `apps/web/src/components/ui/`. O [UI Kit](ui-kit.md) é **somente documentação**.
- Cabeçalhos fixos; navegação mobile adaptada ao teclado e safe areas; controle de foco e toque confortável; tradução PT/EN e temas Light/Dark.
- Skeleton nos carregamentos iniciais e spinners em ações dependentes da API. Atualizações em segundo plano não apagam dados já exibidos.
- Atividades, presenças, badges e recomendações não devem ser simulados como reais.

## Migração da interface atual

1. Construir Descobrir e ajustar menu, links internos e onboarding para **Descobrir · Mensagens · Comunidades**.
2. Reutilizar as APIs e eventos autenticados de comunidades/voz para atividade; projetar os novos endpoints somente se necessário, sempre com controle de acesso no servidor.
3. Revisar dependências do feed no perfil, notificações, roteamento, compartilhamento e deep links antigos.
4. Descontinuar o acesso global aos posts e modo vídeos depois da migração, **sem apagar dados** e sem interromper o compartilhamento de mídias em chats/canais.
5. Validar desktop, iPhone Safari/PWA, Android/PWA, Light/Dark e PT/EN.

## Validação e isolamento

`.github/workflows/web-ui.yml` valida TypeScript, Vite e configuração Wrangler; a publicação ocorre pelo Cloudflare Builds. CI verde não comprova deploy ou testes em dispositivos. Não alterar o Worker **legado** `uorqui-chat` nem suas bases de dados.
