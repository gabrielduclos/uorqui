# Uorqui UI Kit · Design System v0.1.0-beta.6

> **Contrato visual do beta de 06/11/2026.** Este UI Kit é documentação no GitHub; não existe uma rota de demonstração ou segundo frontend. O produto usa os componentes reais em `apps/web/src`.

- **Chats dos canais:** respostas com mensagem original, `@usuário` com sugestões, GIFs e lista de reagentes por emoji; não mostrar membros sem permissão.
- **Privacidade:** cartão de exclusão definitiva no Perfil com duas confirmações (senha e `EXCLUIR`), estados de erro e aviso de mídia em limpeza posterior.
- **Convites:** confirmação de ingresso somente depois da autenticação, sem bloquear a tela de cadastro.

## Princípios

- **Respostas em mensagens (estilo Discord):** referência compacta com conector, autor e trecho truncado **acima** da mensagem em conversas privadas e canais; clique leva à mensagem original. Editor exibe prévia discreta e cancelar. Sem cartão dentro de outro balão; cores vêm do CSS global para contraste Light/Dark. Inclui fallback para mensagem excluída, GIF e arquivos.


- **Central de notificações:** abas compactas e roláveis **Todas, Mensagens, Menções, E-mail, Convites e Contatos**; contadores por categoria, estados vazios específicos e atalhos internos. Push nativo e histórico são conceitos independentes.


- **Convites de permissão no desktop:** a oferta diária de push tem prioridade sobre a instalação opcional do PWA; nunca sobrepor os dois avisos, e abrir a permissão nativa apenas mediante clique. No mobile, manter as regras próprias de instalação.


- O modal de e-mail reúne Gmail OAuth, Outlook OAuth e IMAP/SMTP manual, com rolagem independente. A disponibilidade do botão Outlook depende das credenciais Microsoft Entra no Render; isso não bloqueia os outros provedores.

- Interface compacta, orientada a comunicação, com referências de organização visual a painéis de trabalho; **não** restringir o Uorqui ao público empresarial.
- Navegação principal: **Descobrir · Mensagens · Comunidades · E-mail**; contatos são acessados **dentro de Mensagens**, não por um item independente do menu.
- Trilho de comunidades e barra lateral no desktop; **Descobrir** usa ícone de bússola no lugar da lupa. O cabeçalho dos canais tem **Convidar**, mas não **Editar**; descrições fixas apresentam **Ler mais / Mostrar menos**, e são editadas em **Moderação → Canais**. Somente a área de conteúdo deve rolar.
- Dark e Light têm a mesma estrutura e ações. Todos os controles de toque e diálogos devem respeitar viewport, área segura do iOS, teclado, Escape e acessibilidade.
- PT-BR e inglês coexistem; linguagem humana, ícones Lucide, sem misturar bibliotecas ou criar CSS avulso para cada página.

## Hierarquia dos temas — fonte de verdade

1. `apps/web/src/styles.css`: tokens semânticos **globais**, resets, movimentos e superfícies reutilizáveis. Existe **um único par** `:root` e `:root.light`, sem paletas globais repetidas.
2. `apps/web/src/ui-kit/sprintrix.css`: personalização **intencional do workspace logado** em `[data-uorqui-ui-kit="sprintrix-v1"]`, conservando os mesmos nomes de tokens para páginas e componentes. É esta a paleta efetiva do app logado.
3. `apps/web/src/components/ui/` e `ui-kit/components.tsx`: botões, campos, menus, skeletons, contagens e estrutura visual reutilizável.
4. Componentes de módulos consomem `bg-card`, `bg-background`, `text-foreground`, `border-border` e demais tokens, **sem definir paletas próprias**.

O padrão de instalação nova é **Light**, como implementado em `UorquiPreferences.tsx`; uma escolha existente de tema é respeitada pela chave `uorqui:theme`. O tema muda sem recarregar. As superfícies de **Contatos, Mensagens e E-mail** compartilham `data-uorqui-workspace-surface`. O documento HTML recebido por e-mail permanece isolado e pode ter cores próprias do remetente, sem alterar a paleta do aplicativo.

### Paleta real do workspace logado

| Token | Dark | Light | Uso |
| --- | --- | --- | --- |
| `--background` | `#181818` | `#fafafa` | Tela e navegação |
| `--foreground` | `#fafafa` | `#171717` | Texto principal |
| `--card` | `#0a0a0a` | `#ffffff` | Conteúdo e painéis |
| `--popover` | `#111111` | `#ffffff` | Menus e overlays |
| `--primary` | `#e5e5e5` | `#171717` | Seleção e ação principal |
| `--secondary` | `#171717` | `#f5f5f5` | Áreas secundárias |
| `--muted` | `#171717` | `#f7f7f7` | Estado neutro |
| `--muted-foreground` | `#a3a3a3` | `#777777` | Metadados |
| `--accent` | `#242424` | `#f1f1f1` | Hover |
| `--border` | `rgba(255,255,255,.10)` | `#e5e5e5` | Divisórias |
| `--input` | `rgba(255,255,255,.16)` | `#d4d4d4` | Campos |
| `--ring` | `#b6b6b6` | `#7c7c7c` | Foco de teclado |
| `--destructive` | `#fa646e` | `#d7384c` | Ações destrutivas; token global |
| `--workspace-rail` | `#181818` | `#fafafa` | Trilho lateral |

**Não copiar esses valores hexadecimais para os componentes.** Usar o token. Referências de resposta usam `uorqui-reply-reference` e `uorqui-reply-draft` definidos globalmente, com contraste testado em ambos os temas. Cantos seguem a escala compartilhada, com balões compactos e levemente arredondados.

## Componentes e comportamentos obrigatórios

| Componente / módulo | Contrato |
| --- | --- |
| `SocialShell`, `UIKitSectionHeading` | Navegação e cabeçalhos responsivos; uma só fonte de verdade para área ativa |
| `LiveDirectChat`, `DirectMessageBubble` | Conversas persistidas, SSE, estados entregue/lido, hora de leitura, respostas otimistas e fixadas, ações e menus sem ultrapassar a tela |
| `LiveMessageComposer` | **+ anexos · texto expansível · emoji · microfone/enviar**; não fechar teclado desnecessariamente |
| `ConversationAttachmentsPanel`, `ChatMediaViewer`, `ChatAudioPlayer` | Histórico paginado de fotos/vídeos/áudios/arquivos; zoom, download, prévia responsiva |
| `LiveCommunities`, `CommunityVoiceRoom` | Canais de texto, áudio e reunião; SSE, participantes, moderação, convites e texto associado às salas |
| `CommunityModerationPanel` | Confirmação de exclusão visível, no próprio canal e fora da rolagem principal |
| `EmailInbox` | Gmail OAuth e IMAP/SMTP manual, pastas, leitura/ação; HTML isolado, links externos no navegador, skeleton até montagem/ajuste das imagens |
| `WorkspaceContentLoading` | Skeleton para dados ainda não prontos, sem piscadas ou deslocamento abrupto |

Mensagens de **texto** são otimistas sem spinner individual; progresso de envio visível é reservado principalmente às **mídias**. A rolagem horizontal não aparece durante o carregamento de anexos. O cache de mídia é privado, limitado à memória, reutilizado ao voltar ao canal, invalidado após remoção/perda de acesso e limpo no logout. A tela de e-mail é separada do HTML externo, que não pode executar scripts ou formulários.

## Arquitetura e organização do código

- Cliente HTTP reutilizável: `apps/web/src/lib/apiClient.ts`. Mantém os códigos de erro de Mensagens e Comunidades existentes; nenhuma chamada usa um cache indiscriminado.
- Estado e tempo real ficam por domínio: `dmCache.ts`, `dmEventStream.ts`, `communityMessageCache.ts`, `chatMediaCache.ts`. Não duplicar SSE ou cache num novo componente.
- API Node/Fastify em `apps/api/src`: autorização no servidor, migrações Drizzle, mensagens e mídias privadas. A validação exata de origem para rotas de escrita é compartilhada em `request-origin.ts`.
- UI Kit não é uma implementação alternativa. O código React publicado é a única interface a manter.

## Marca, tradução e qualidade

O `UorquiWordmark` usa o lettering pixelado **uorqui.** de 43 × 7 módulos e ponto verde-menta `#69d2aa`; os ícones PWA e favicon seguem os arquivos públicos existentes. Não introduzir fontes externas para desenhar a marca. O aplicativo suporta PT/EN via `UorquiPreferences`, preserva textos escritos pelos usuários e respeita o atributo `lang`.

Antes de mesclar: validar **mobile/desktop × Dark/Light × PT/EN**, navegação por teclado, loading, conteúdo extenso, acesso protegido, reprodução de mídias e telas do PWA instalado. O badge nativo do ícone depende do suporte da plataforma.

## Versão e manutenção

Este documento corresponde ao marco **`v0.1.0-beta.6`**. A partir deste marco, **todo PR, inclusive só de CSS ou documentação, deve aumentar a versão SemVer dos três manifestos**, atualizar os changelogs PT/EN e passar na verificação automática `Version policy`. As releases são publicadas com tags imutáveis `v...`; ver [política de versões](versoes.md), [notas](../../CHANGELOG.pt-BR.md) e [contribuição](../../CONTRIBUTING.pt-BR.md).
