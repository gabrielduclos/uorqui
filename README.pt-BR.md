# Uorqui

**Plataforma social open source centrada em comunidades, descoberta e mensagens individuais.**

[Português (Brasil)](README.pt-BR.md) · [English](README.md)

> **Versão: `0.1.0-beta.30` — beta técnico inicial (novembro de 2026).** Publicado para testes controlados, **não** é uma versão estável nem lançamento geral. Ainda faltam validar cadastro/e-mail de ponta a ponta, notificações e PWAs em dispositivos reais. O domínio oficial já foi transferido para o novo Worker.

**Beta oficial:** [uorqui.app](https://uorqui.app) · **Endereço técnico:** [main.uorqui1.workers.dev](https://main.uorqui1.workers.dev) · **Código:** [GitHub](https://github.com/gabrielduclos/uorqui)


## Novidades do beta.30

- **Fotos mais leves:** compactação automática de fotos JPEG/WebP/HEIC da galeria, câmera e área de transferência antes do envio nos chats e canais. GIFs, PNGs e anexos via **Arquivo** preservam o original; o navegador mantém o arquivo intacto se a conversão não ajudar.
- **Sino com badge unificado:** soma mensagens, canais, convites, atividades e e-mails não lidos das contas conectadas; o badge nativo do PWA depende da compatibilidade do dispositivo.
- **Comunidades e notificações:** foto e nome do autor aparecem já no envio otimista dos canais. A aba E-mail de Notificações lista apenas avisos pendentes; ler ou mover mensagens na caixa sincroniza os avisos com o backend.

## Alterações do beta.2

- **Convites com consentimento:** o usuário decide entrar ou recusar a comunidade depois de criar conta/entrar.
- **Canais:** respostas vinculadas à mensagem original, menções por `@`, lista de pessoas que reagiram e regras fixadas.
- **GIFs:** também em conversas privadas; GIPHY com busca e catálogo expansível depende de `VITE_GIPHY_API_KEY` definido **na compilação do web**. Sem chave, apenas os GIFs inclusos.
- **Privacidade:** Perfil → Excluir minha conta exige a senha e a palavra `EXCLUIR`. Remove dados da base ativa e agenda limpeza de mídia R2. Conversas privadas com outros usuários também são apagadas; backups do provedor não são apagados instantaneamente. O serviço deve validar a tarefa de R2 antes de liberar a exclusão.

## O produto

O Uorqui reúne quatro experiências:

- **Conversas individuais:** mensagens privadas 1:1, respostas otimistas, reações, anexos, galeria de todas as mídias/arquivos, mensagens fixadas para os dois participantes, entrega/leitura, push e SSE. Contatos ficam dentro de Mensagens, sem grupos tradicionais no mensageiro.
- **Descobrir:** tela inicial sem publicações globais, com recomendações de comunidades públicas, busca e atividades das comunidades das quais o usuário participa. O feed antigo foi retirado da interface, API e PostgreSQL em 02/11/2026.
- **Comunidades:** participação pública/privada, convites, canais de texto, moderação, salas de voz e **reuniões com áudio e vídeo** (até seis pessoas), convites por link ou DM, aprovação e notificações, senhas e permissões por canal. Reuniões têm compartilhamento de tela, destaque de quem fala e câmera em miniatura na tela cheia.

- **E-mail:** Gmail e Outlook OAuth ou IMAP/SMTP manual, múltiplas contas conectadas, entrada/enviados/spam/lixeira, respostas e ações em lote, visualizador HTML seguro e abertura de links externos no navegador.

O público inicial inclui comunidades gamers, mas o produto é de uso geral.

> **Feed global aposentado em 02/11/2026:** o novo Descobrir substituiu as publicações públicas. A API e o Worker passaram em verificações ao vivo, e as tabelas antigas foram excluídas da Neon após backups verificados. Quatro mídias antigas permanecem no R2 para recuperação; não exclua sem cópia validada. Leia a [decisão Descobrir](docs/pt-BR/descobrir.md).

A aprovação de entrada na comunidade atualiza a lista do solicitante por SSE direcionado à conta, sem recarregar. Administradores editam nome, descrição fixa/regras, senha e acesso em Moderação. Cada canal oferece um convite único que inclui a entrada na comunidade e abre o canal; reuniões usam o mesmo convite. Novos canais sugerem nomes numerados editáveis por tipo. Ver [Reuniões](docs/pt-BR/reunioes-video.md).

## Situação do beta

| Área | Estado técnico atual |
| --- | --- |
| Cadastro e perfis | Better Auth, verificação/recuperação por e-mail, privacidade e bloqueio implementados; falta validar cadastro real e entrega de e-mails |
| Mensageiro | Conversas 1:1, anexos, galeria de mídias/arquivos, mensagens fixadas, reações, estados de leitura/entrega, SSE e Web Push |
| Feed antigo | Removido do app, API e PostgreSQL; preservados snapshots de recuperação na Neon e quatro mídias no R2 |
| Descobrir | Recomendações de comunidades públicas, busca e atividades autorizadas; API validada em produção, testes em aparelhos pendentes |
| Comunidades | Canais de texto, voz e reunião em vídeo; permissões, convites, senhas, moderação e cache privado de mídias; testes reais de áudio/vídeo pendentes |
| E-mail | Conexões Gmail e IMAP/SMTP manual, pastas, leitura/resposta/movimentação, HTML isolado e responsivo; testes do navegador externo no PWA ainda necessários |
| Infraestrutura | PWA React no Worker `main` da Cloudflare, API Fastify no Render e PostgreSQL na Neon |
| Lançamento amplo | **Ainda pendente:** testes de câmera/microfone no iOS/Android, entrega de push, TURN/redes diferentes, monitoramento e testes de PWA instalado após a troca do domínio |

Os testes automáticos do GitHub cobrem API, interface e integrações. **Testes aprovados não substituem validação do PWA instalado em celulares.**

**Situação do domínio (confirmada em 01/11/2026):** a Cloudflare associa `uorqui.app` ao novo Worker `main`. O login de uma conta criada no novo Uorqui foi confirmado pelo usuário; atualização de PWAs já instalados e validação em aparelhos ainda estão pendentes. O mensageiro empresarial antigo permanece separado; **contas e mensagens anteriores não são importadas automaticamente**.

## Arquitetura

- **Interface:** React, TypeScript, Tailwind CSS, Cloudflare Workers Static Assets, PWA e service worker.
- **API:** Node.js 22, Fastify, Better Auth e eventos SSE.
- **Banco:** PostgreSQL na Neon, Drizzle ORM e migrações versionadas.
- **Mídias:** Cloudflare R2 com autorização.
- **Voz:** WebRTC P2P; TURN é opcional e requer testes entre redes.
- **Deploy:** Cloudflare Builds e Render, validados pelo GitHub Actions.

A identificação do beta está nos três manifestos npm, e o app mostra o selo Beta. Veja [notas da versão](CHANGELOG.pt-BR.md). **Após `v0.1.0-beta.9`, toda alteração deverá ser versionada**, inclusive documentação e CSS: [política de versões](docs/pt-BR/versoes.md).

## Documentação

| Tema | Português | English |
| --- | --- | --- |
| Versão beta | [Notas da versão](CHANGELOG.pt-BR.md) | [Changelog](CHANGELOG.md) |
| Política de versões | [Versionamento](docs/pt-BR/versoes.md) | [Release versions](docs/en/versions.md) |
| Instalação local | [Primeiros passos](docs/pt-BR/primeiros-passos.md) | [Getting started](docs/en/getting-started.md) |
| API e deploy | [Hospedagem da API](docs/pt-BR/hospedagem-api.md) | [API hosting](docs/en/api-hosting.md) |
| Worker Cloudflare | [Workers](docs/pt-BR/cloudflare-workers.md) | [Workers](docs/en/cloudflare-workers.md) |
| Arquitetura | [Arquitetura](docs/pt-BR/arquitetura.md) | [Architecture](docs/en/architecture.md) |
| Requisitos | [Produto](docs/pt-BR/produto.md) | [Product](docs/en/product.md) |
| Direção da descoberta | [Descobrir](docs/pt-BR/descobrir.md) | [Discover](docs/en/discover.md) |
| Planejamento | [Roadmap](docs/pt-BR/roadmap.md) | [Roadmap](docs/en/roadmap.md) |
| Permissões de canais | [Canais abertos e fechados](docs/pt-BR/permissoes-canais.md) | [Channel permissions](docs/en/channel-permissions.md) |
| Auditoria e limpeza de código | [Auditoria 03/11](docs/pt-BR/auditoria-manutencao.md) | [November 3 audit](docs/en/maintenance-audit.md) |
| Salas de voz e reunião | [Reuniões](docs/pt-BR/reunioes-video.md) | [Meetings](docs/en/video-meetings.md) |
| Identidade visual | [UI Kit](docs/pt-BR/ui-kit.md) | [UI Kit](docs/en/ui-kit.md) |
| Migração de domínio | [Plano e reversão](docs/pt-BR/migracao-dominio-uorqui-app.md) | [Migration runbook (PT-BR)](docs/pt-BR/migracao-dominio-uorqui-app.md) |
| Contribuição | [Contribuindo](CONTRIBUTING.pt-BR.md) | [Contributing](CONTRIBUTING.md) |
| Segurança | [Segurança](SECURITY.pt-BR.md) | [Security](SECURITY.md) |

## Desenvolvimento

É necessário Node.js 22+ e PostgreSQL para testar os recursos autenticados:

```sh
npm install
npm run dev
npm run typecheck
npm run build
```

Interface: `http://localhost:5173`; API: `http://127.0.0.1:3001`. É possível iniciar a interface sem banco, mas não usar autenticação e dados reais. Siga [Primeiros passos](docs/pt-BR/primeiros-passos.md) para preparar um ambiente de testes sem publicar credenciais.

## Código aberto

Licença [MIT](LICENSE). Consulte as [regras para contribuir](CONTRIBUTING.pt-BR.md) e a [política de segurança](SECURITY.pt-BR.md). Não publique segredos, dados de clientes nem detalhes de vulnerabilidades em issues.

**Uorqui — converse, descubra, participe.**
