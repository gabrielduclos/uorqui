# Notas de versão

O novo Uorqui utiliza [versionamento semântico](https://semver.org/lang/pt-BR/) nos manifestos da aplicação. O sufixo `-beta.N` indica **pré-lançamento** e não uma versão estável ou liberada para todos.

## [Não publicado] — alterações até 03/11/2026

Evolução do beta técnico na `main`, **sem criar tag e sem comprovar deploy da última versão em produção**.

### Produto e comunidades
- Cabeçalho dos canais com **Convidar**: lista contatos/amigos e envia DM com link direto para texto, voz ou reunião; convites válidos da comunidade são aproveitados quando disponíveis, mantendo senha e permissão de canal.
- **Descobrir** agora resume atividade com autor e tipo: GIF, foto, vídeo, áudio, arquivo, link, emoji, mensagem ou reação, sem mostrar URL de GIF nem nomes de arquivos.
- Canais de tipos diferentes podem usar **o mesmo nome**; nomes continuam únicos dentro da mesma comunidade e tipo. Migração versionada `0034_channel_names_per_kind` (novo índice antes da remoção do índice anterior) e índice de recência para reações; ainda exige aplicação no banco de produção.
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

## [0.1.0-beta.1] — 01/11/2026

**Primeiro beta técnico para testes controlados.** Este documento descreve código implementado e testes automatizados, **não** uma certificação em todos os navegadores e dispositivos.

### Incluído

- Nova rede social open source em React/TypeScript, com interface inspirada no UIKit, temas claro e escuro e selo Beta consistente junto ao logo no header.
- Autenticação Better Auth com e-mail/senha, perfis, privacidade e bloqueios; cadastro público com proteção Turnstile e integração de e-mail.
- Mensageiro individual 1:1 com persistência, anexos, respostas, reações, estados de mensagens, atualizações SSE e suporte a Web Push.
- Feed híbrido contínuo com filtros persistentes "Para você" / "Seguindo", botão + que abre o modal de postagem e navegação dedicada por vídeos.
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
