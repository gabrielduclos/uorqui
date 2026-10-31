# Front-end do Uorqui — padrão e primeira entrega

## Objetivo

Interface simples e funcional, com **comunidades e canais inspirados na organização do Stoat** e **conversas privadas 1:1 inspiradas na simplicidade do WeChat**. As marcas e telas de terceiros são referências de comportamento; identidade, componentes e texto são próprios do Uorqui.

## Design system

- **shadcn/ui (estilo New York, Radix)** é a primeira opção para elementos reutilizáveis. Use o componente de catálogo existente antes de escrever um componente primitivo novo. Composições de produto, como lista de canais e shell do aplicativo, são próprias quando não há componente pronto correspondente.
- **Tailwind CSS v4**, tokens semânticos definidos em `src/styles.css` e tema existente em índigo, preparado para ajuste pelo tweakcn sem duplicar estilos.
- **Motion** para transições breves; respeitar `prefers-reduced-motion`.
- Componentes versionados em `apps/web/src/components/ui/`, configurações em `apps/web/components.json` e `apps/web/vite.config.ts`.
- Cabeçalhos fixos durante a rolagem, navegação inferior mobile, campos de formulário com ao menos 16px, safe-area do iPhone, contraste e foco de teclado.
- Spinner no botão enquanto aguarda backend; skeleton local nas consultas; logo e barra indeterminada na inicialização da sessão.

## Telas já codificadas

- **Sem sessão:** tela inicial de boas-vindas com cadastro principal, login secundário, confirmação/reenvio, recuperação e perfil social inicial. Continua integrada ao Better Auth e à API existente.
- **Com sessão e perfil:** shell adaptado a celular/desktop com Início, Conversas, Comunidades e Perfil.
- **Conversas:** lista, busca local, avatar, detalhe de conversa com balões e campo de mensagem **somente demonstrativos**.
- **Comunidades:** trilho de comunidades, canais de texto, salas de voz e mensagens de exemplo. **Não são grupos de DM:** são espaços distintos.
- **Feed:** estado inicial honesto, sem fingir publicações persistidas.
- **Perfil:** exibe os dados reais da sessão; sair envia a requisição ao backend com spinner.

## Limites da prévia

O backend ainda não expõe contratos sociais para DMs, canais, posts ou voz. **Todas as mensagens, comunidades e canais exibidos na prévia são dados fictícios e não persistem.** Apenas autenticação, onboarding, perfil autenticado e logout são integrações reais. Não exibir dados de comunidade privada, contadores não fundamentados ou estado de entrega inventado.

## Próximas etapas

1. Implementar contratos de API, permissão e persistência de conversas 1:1.
2. Comunidades reais, entrada, membros, papéis, canais públicos/privados e moderação.
3. Feed híbrido e modo de vídeos separado, sem chamar a função de “Reels”.
4. Auditoria visual real em iPhone Safari/PWA, Android e desktop; verificar sobreposições, scroll, teclado e safe areas.

## Validação

O CI `.github/workflows/web-ui.yml` executa TypeScript, build Vite e dry-run Wrangler. O Cloudflare Builds é responsável pela publicação do Worker `main` em `https://main.uorqui1.workers.dev`. CI verde não substitui conferência do SHA publicado e testes de dispositivo.

**Isolamento:** não modificar `uorqui.app` nem o Worker legado `uorqui-chat`.
