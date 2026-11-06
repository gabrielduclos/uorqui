# Notas de versão

O novo Uorqui utiliza [versionamento semântico](https://semver.org/lang/pt-BR/) nos manifestos da aplicação. O sufixo `-beta.N` indica **pré-lançamento** e não uma versão estável ou liberada para todos.

## [Unreleased]

Mudanças posteriores ao marco exigem aumento de versão nos três manifestos npm e atualização dos changelogs. Ver [política de versões](docs/pt-BR/versoes.md).

## [0.1.0-beta.4] — 06/11/2026

- **Notificações no desktop:** o convite diário para ativar o push passa a ter prioridade sobre a oferta de instalar o PWA. Antes, o aviso de instalação surgia primeiro e cancelava o lembrete de notificações.
- **Sem sobreposição:** a instalação poderá ser oferecida em outro acesso, sem interromper a permissão de notificações já apresentada durante a visita.
- **Permissão do navegador:** o pedido nativo continua acontecendo somente após clicar em **Ativar notificações**. Em caso de bloqueio, o usuário recebe orientação para alterar a permissão nas configurações do site.
- **Mobile preservado:** no iOS o push continua exigindo PWA instalado; avisos móveis e limite de uma oferta por conta/dia não mudam. A ativação manual permanece em Notificações → Ajustes.

## [0.1.0-beta.3] — 06/11/2026

- **Outlook OAuth restaurado:** a conexão de novas contas Outlook.com, Hotmail e Microsoft 365 volta a ser aceita por Microsoft Entra e Graph, com PKCE, estado de uso único, renovação de tokens e armazenamento criptografado. Contas já conectadas permanecem preservadas.
- **Interface de e-mail:** botão Outlook volta ao modal de configuração, junto com Gmail e Servidor manual. Fica indisponível até que as credenciais Microsoft estejam presentes no Render; sem afetar outros provedores.
- **Erros de conexão:** o callback devolve apenas o identificador público do provedor (sem códigos, tokens ou estado) e a interface apresenta instruções específicas para permissões e erros Microsoft.
- **Configuração:** criar aplicativo Entra para contas organizacionais e pessoais, plataforma Web, redirect exato `https://uorqui.app/api/v1/mail/oauth/outlook/callback`, permissões delegadas `User.Read`, `Mail.ReadWrite`, `Mail.Send` e `offline_access`. Configurar `MAIL_MICROSOFT_CLIENT_ID` e `MAIL_MICROSOFT_CLIENT_SECRET` **somente no Render**, preservando `MAIL_TOKEN_KEY`.
- **Testes:** fluxo Microsoft de autorização, escopos, PKCE, callback com isolamento por usuário/provedor, proteção contra replay e ausência de segredos, e bloqueio seguro quando as credenciais não estiverem configuradas. Sem migração do banco.

## [0.1.0-beta.2] — 06/11/2026

- **Canais:** removido o botão Editar do cabeçalho; nome, descrição/regras, acesso e senha são administrados em **Moderação → Canais**.
- **Descrição fixa:** criação e edição de textos de até 4.000 caracteres, exibidos permanentemente abaixo do cabeçalho, com **Ler mais / Mostrar menos** para textos longos. Disponível em canais de texto, voz e reunião.
- **Nomes sugeridos:** novas salas recebem nomes numerados por tipo (**Sala de texto 1**, **Sala de voz 1**, **Sala de reunião 1**); a numeração evita nomes duplicados no mesmo tipo e pode ser alterada antes de salvar. A restrição única no PostgreSQL permanece.
- **Convites:** removidas as ações independentes de convidar/compartilhar a comunidade. Cada canal fornece um link único que aceita a entrada na comunidade e abre o canal de destino. O link pode ser copiado ou enviado por mensagem direta; reunião e canal usam o mesmo modal/link.
- **Descobrir:** a lupa na barra das comunidades foi substituída pelo ícone e nome **Descobrir**, mantendo o acesso à lista de comunidades públicas.
- **Segurança:** convite não contorna senha de canal, permissão de canal restrito nem aprovação de reunião. Link temporário existente é reutilizado; administradores podem gerar o primeiro link se não existir.
- **Migração:** `0039_channel_descriptions`, aditiva, acrescenta a coluna opcional `community_channels.description` sem apagar dados. Exige migração do banco antes do deploy da nova API.
- **Segurança de ingresso:** após login/cadastro, o convite apresenta o nome da comunidade e exige **Entrar na comunidade** ou **Agora não**; cadastro e autenticação nunca resgatam convites automaticamente.
- **Mensagens dos canais:** resposta com referência à mensagem original (também para anexos), envio otimista, menções `@usuário` com autocompletar e destaque, e lista de pessoas que reagiram ao tocar na contagem. Acesso restrito é respeitado; push destaca quando a pessoa foi mencionada.
- **GIFs:** seletor compartilhado nos canais e nas mensagens privadas, com envio/visualização como mídia animada e preservação do rascunho. Suporte a catálogo expansível via GIPHY Trending/Busca com paginação quando configurado `VITE_GIPHY_API_KEY`; sem chave, mantém catálogo local limitado.
- **Exclusão da conta:** em Perfil, confirmação de senha e texto `EXCLUIR`; apaga dados pessoais, sessões, mensagens e vínculos do banco, transferindo comunidades com outros membros. Objetos R2 são removidos por fila persistente e tarefa agendada, com tentativas posteriores. A exclusão de conversas privadas compartilhadas impacta o outro participante. Backups do provedor seguem a política de retenção.
- **Migrações adicionais:** `0040_community_message_replies` e `0041_account_media_cleanup`; aplicá-las antes de publicar a nova API. Testes de integração cobrem exclusão e os fluxos de respostas/reações. Testar exclusão e GC do R2 com dados de teste em ambiente real antes de liberar a opção em produção.
- **Testes:** casos de integração para persistência, autorização, limite e remoção de descrição; compilação de frontend e backend/CI. Testar convite com conta nova, link expirado e PWAs reais após implantação.

## [0.1.0-beta.1] — 06/11/2026

**Marco oficial do beta técnico.** Consolida a interface React, os tokens CSS, a API Fastify e a documentação sob uma única versão no GitHub. Testes automáticos e deploy não certificam todos os fluxos em aparelhos reais.

### Implementação consolidada (04–06 de novembro)

- **Interface:** layout compacto e responsivo de Mensagens/Contatos/Comunidades/E-mail, melhor contraste de respostas nos temas e superfícies globais. UI Kit passa a descrever a **paleta cinza real do workspace**, não as propostas roxas/azuis anteriores. Um par global de tokens Dark/Light substitui declarações duplicadas.
- **Mensageiro:** SSE e horários de entrega/leitura, texto e respostas otimistas, anexos, galeria paginada de todas as mídias/arquivos, uma mensagem fixada compartilhada por conversa, cache e placeholders responsivos.
- **Comunidades:** canais, permissões, confirmação de exclusão sempre visível, reuniões de áudio/vídeo, chat mobile e carregamento inteligente de mídias privadas em memória.
- **E-mail:** OAuth Gmail e IMAP/SMTP manual, pastas entrada/enviados/spam/lixeira, leitura/resposta/movimentação, visualizador HTML isolado com links externos nativos e skeleton até a montagem do layout/imagens (com limite para serviços remotos travados).
- **PWA/notificações:** categorias configuráveis de push para atividade, comunidades, DMs e e-mail; badge nativo de não lidos onde suportado e service worker seguro.
- **Código consolidado:** transporte JSON reutilizável em `apps/web/src/lib/apiClient.ts`, sem alterar erros existentes; validação estrita da origem de escrita compartilhada em `apps/api/src/request-origin.ts`. **Sem mudanças nas rotas, autenticação ou schema nesta consolidação.**
- **Governança:** workflow `Version policy` exige versão SemVer superior e changelogs PT/EN nos próximos PRs; `Publish tagged beta releases` cria tags/Releases imutáveis `v...` na `main` (dependente das permissões do GitHub).

### Evolução de produto de 02–03/11 incluída neste beta

As mudanças abaixo precederam o marco formal de 06/11 e integram esta versão.

### Produto e comunidades
- Removido o **Explorar comunidades** interno da aba Comunidades (ícone bússola, pesquisa e lista pública). A área agora mostra apenas comunidades participadas, convites pendentes e criação; a descoberta de novas comunidades fica exclusivamente na aba **Descobrir**.
- Links de convite para canais enviados nos chats e prévias abrem a comunidade e o canal por **navegação interna**, sem nova aba ou recarregamento. Convites por token usam o fluxo existente de entrada no próprio app; tocar no push do convite direto também abre o canal.
- O seletor **Convidar para o canal** agora mostra exclusivamente outros participantes da comunidade atual, excluindo contas bloqueadas e respeitando a privacidade de nomes/fotos; o convite usa link direto sem gerar convite geral da comunidade.
- Migração `0034_channel_names_per_kind` aplicada no Neon de produção (3 nov. 2026), com verificação do novo índice exclusivo por comunidade, tipo e nome; backups existentes preservados, mas limite do Neon impediu criar um novo snapshot/branch.
- Push de convite apenas ao destinatário: mensagens privadas de convite usam o push normal do chat com texto específico, e convites de entrada na comunidade notificam somente a pessoa convidada.
- Cabeçalho dos canais com **Convidar**: lista contatos/amigos e envia DM com link direto para texto, voz ou reunião; convites válidos da comunidade são aproveitados quando disponíveis, mantendo senha e permissão de canal.
- **Descobrir** agora resume atividade com autor e tipo: GIF, foto, vídeo, áudio, arquivo, link, emoji, mensagem ou reação, sem mostrar URL de GIF nem nomes de arquivos.
- Canais de tipos diferentes podem usar **o mesmo nome**; nomes continuam únicos dentro da mesma comunidade e tipo. Migração versionada `0034_channel_names_per_kind` e índice de recência para reações, já aplicados ao banco de produção.
- Lista de conversas privadas agora tem divisórias **sutis e recuadas** entre os itens, sem afetar a separação entre áudio/vídeo e chat nas salas.
- Notificações agora têm botão **X** para exclusão individual e persistente, com atualização imediata da lista e do badge; a exclusão não cancela pedidos de amizade/entrada. Em salas de voz e reuniões, uma divisória explícita separa áudio/vídeo do chat quando ambos estão abertos (vertical no desktop, horizontal no celular); retiradas as divisórias indevidas entre conversas privadas.
- Notificações de solicitações de entrada em comunidade/reunião agora identificam a comunidade (e a reunião, se aplicável) no app e no push. Na moderação, avatar, nome e @usuário formam uma área clicável para abrir o perfil público; esse perfil aparece acima do dialog. Nomes da lista principal de participantes das comunidades permanecem texto simples, com links apenas nos canais e na moderação.
- Divisórias de conversas no desktop reforçadas com separadores contínuos de contraste visível entre as linhas.
- **Comunidades** agora é a entrada principal e primeira aba da navegação; logo volta a Comunidades e onboarding apresenta essa área primeiro. O app retoma a última comunidade acessada apenas se a conta continuar participando; quem ainda não participa encontra convite para explorar.
- Nomes de participantes e autores nas comunidades (mensagens, voz e moderação) abrem o perfil público; o mini-player flutuante de reunião mostra a própria câmera e a câmera/avatar de quem está falando, com destaque de atividade.
- Lista de conversas com divisórias discretas no desktop; controles e botões do compositor alinhados em 48 px nas salas de voz e reuniões no layout desktop, preservando tamanhos compactos no celular.
- Menu principal lateral do desktop com fonte e ícones ligeiramente maiores, além de mais altura nos itens; lista de conversas no celular com retorno visual de toque (pressão e destaque) ao abrir chats.
- Moderação da comunidade organizada em abas no dialog: **Membros** (inclui acesso aos canais fechados), **Banimentos**, **Canais**, **Configurações** e **Exclusão** (exclusiva ao proprietário), com navegação adaptada ao celular.
- A moderação da comunidade agora abre em **dialog responsivo**: tela completa no celular e janela centralizada no desktop, com foco controlado, rolagem interna e fechamento sem interromper ações pendentes.
- O feed global e o modo de vídeos antigo deram lugar a **Descobrir**, com recomendações, busca e atividades autorizadas; aposentadoria e snapshots de recuperação foram documentados.
- Reuniões com áudio/vídeo, links ou convites via mensagem individual, controle de entrada, compartilhamento de tela, destaque de quem fala e tela cheia com câmera própria em miniatura.
- O painel de texto das salas de voz e reuniões inicia **recolhido**, com expansão sem desconectar.
- Aprovação de solicitação de comunidade envia evento SSE direcionado ao solicitante e atualiza a participação sem recarregar a página.
- Proprietário/admins editam nome, senha e acesso **aberto/fechado** pelo cabeçalho de canais de texto/voz/reunião; exclusão continua na moderação.
- **Permissões individuais de canais fechados** em Moderação → Membros; API filtra mensagens, Descobrir, notificações, mídia, presença e WebRTC. Revogação encerra a chamada. Migração `0033_restricted_channel_members` versionada; aplicar e verificar no banco de destino antes de liberar o recurso.

### Manutenção
- Auditoria de traduções: excluídas 38 chaves sem uso de feed/demonstrações; texto do cadastro e tradução inglesa atualizados para Descobrir.
- Termos e Privacidade revisados em PT/EN para a experiência atual; aceite de **novos cadastros** usa versão `2026-11-03`, sem alterar registros de usuários anteriores. Política de Cookies permanece `2026-11-01`. Reaceite de contas antigas não foi imposto.
- Retirados controles de compartilhamento de posts do feed já desativado; links antigos recebidos em DMs exibem aviso em vez de navegação quebrada.
- Removidos dois componentes shadcn sem importações (Sheet/Tabs). Mantidos históricos de migração e mídias de recuperação.
- Revisada a documentação bilíngue, com [auditoria de código de 03/11](docs/pt-BR/auditoria-manutencao.md).

**Pendências:** testes reais de reunião e apresentação entre aparelhos, PWA iOS/Android, push/e-mail de ponta a ponta e confirmação independente do deploy em produção.

### Escopo inicial (registros históricos do preview)

**Primeiro beta técnico para testes controlados.** Este documento descreve código implementado e testes automatizados, **não** uma certificação em todos os navegadores e dispositivos.

### Incluído

- Nova rede social open source em React/TypeScript, com interface inspirada no UIKit, temas claro e escuro e selo Beta consistente junto ao logo no header.
- Autenticação Better Auth com e-mail/senha, perfis, privacidade e bloqueios; cadastro público com proteção Turnstile e integração de e-mail.
- Mensageiro individual 1:1 com persistência, anexos, respostas, reações, estados de mensagens, atualizações SSE e suporte a Web Push.
- Descoberta de comunidades em substituição ao feed global removido; rotas e tabelas legadas foram desativadas durante a evolução do beta.
- Comunidades com convites, cargos, canais de texto, moderação e salas WebRTC, incluindo chamada minimizável.
- Frontend Cloudflare Worker/R2; API Fastify no Render; PostgreSQL Neon; testes automáticos de interface, API e integração.
- Preparação para migração de domínio, lista de origens autorizadas e substituição do service worker em PWAs instalados.

### Pendências e limitações

- Validar **com uma conta real** envio/recebimento de e-mail, confirmação e recuperação de senha.
- A substituição do PWA, notificações e ícone **não está garantida** para todos os aparelhos, especialmente iPhone.
- Voz entre redes diferentes pode precisar de TURN; iOS limita execução e microfone em segundo plano.
- Em 01/11/2026, a Cloudflare confirmou `uorqui.app` habilitado no Worker `main` em produção. Ainda faltam conferir caches dos PWAs instalados, particularidades de dispositivos e fluxos de recuperação.
- Não há migração automática das contas, mensagens, push ou dados do Uorqui Chat empresarial.
- Antes de ampliar o beta: monitoramento, backups e restauração, testes de acessibilidade/segurança, operação de moderação e custos.

### Deploy e reversão

Siga o [procedimento de migração do domínio](docs/pt-BR/migracao-dominio-uorqui-app.md). A versão exige build e testes GitHub Actions. Não reutilizar credenciais ou dados do mensageiro empresarial legado.

> Alterar a versão e criar estas notas **não publica automaticamente** uma tag nem uma GitHub Release. A prerelease pode ser publicada depois de selecionar um commit validado.
