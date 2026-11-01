# Uorqui

**Plataforma social open source com mensageiro, feed híbrido e comunidades.**

[Português (Brasil)](README.pt-BR.md) · [English](README.md)

> **Versão: `0.1.0-beta.1` — beta técnico inicial (novembro de 2026).** Publicado para testes controlados, **não** é uma versão estável nem lançamento geral. Ainda faltam validar cadastro/e-mail de ponta a ponta, dispositivos reais e a migração do domínio.

**Acesse a versão atual:** [main.uorqui1.workers.dev](https://main.uorqui1.workers.dev) · **Código:** [GitHub](https://github.com/gabrielduclos/uorqui)

## O produto

O Uorqui reúne três experiências:

- **Conversas individuais:** mensagens privadas 1:1, respostas, reações, anexos, estados de mensagens, push e atualização em tempo real via SSE. Não há grupos tradicionais no mensageiro.
- **Feed híbrido:** publicações contínuas com texto, fotos e vídeos, com modo imersivo específico para vídeos.
- **Comunidades:** participação pública/privada, convites, canais de texto, moderação e salas de voz via WebRTC, com chamada minimizável durante a navegação.

O público inicial inclui comunidades gamers, mas o produto é de uso geral.

## Situação do beta

| Área | Estado técnico atual |
| --- | --- |
| Cadastro e perfis | Better Auth, verificação/recuperação por e-mail, privacidade e bloqueio implementados; falta validar cadastro real e entrega de e-mails |
| Mensageiro | Conversas 1:1 persistidas, anexos, reações, estados de leitura/entrega, SSE e Web Push implementados |
| Feed | Publicações híbridas, mídias, API e banco de dados integrados |
| Comunidades | Membros, convites, cargos, canais de texto, presença e voz WebRTC |
| Infraestrutura | PWA React no Worker `main` da Cloudflare, API Fastify no Render e PostgreSQL na Neon |
| Lançamento amplo | **Ainda pendente:** testes reais no iOS/Android, push, TURN/redes diferentes, monitoramento e domínio |

Os testes automáticos do GitHub cobrem API, interface e integrações. **Testes aprovados não substituem validação do PWA instalado em celulares.**

**Mudança de domínio:** `uorqui.app` está em processo de migração separado. Até a virada ser confirmada, use o endereço de testes acima. O mensageiro empresarial antigo continua em infraestrutura separada; **contas e mensagens anteriores não são importadas automaticamente**.

## Arquitetura

- **Interface:** React, TypeScript, Tailwind CSS, Cloudflare Workers Static Assets, PWA e service worker.
- **API:** Node.js 22, Fastify, Better Auth e eventos SSE.
- **Banco:** PostgreSQL na Neon, Drizzle ORM e migrações versionadas.
- **Mídias:** Cloudflare R2 com autorização.
- **Voz:** WebRTC P2P; TURN é opcional e requer testes entre redes.
- **Deploy:** Cloudflare Builds e Render, validados pelo GitHub Actions.

A identificação do beta está nos manifestos npm dos workspaces. Consulte as [notas da versão](CHANGELOG.pt-BR.md) para limitações e pendências.

## Documentação

| Tema | Português | English |
| --- | --- | --- |
| Versão beta | [Notas da versão](CHANGELOG.pt-BR.md) | [Changelog](CHANGELOG.md) |
| Instalação local | [Primeiros passos](docs/pt-BR/primeiros-passos.md) | [Getting started](docs/en/getting-started.md) |
| API e deploy | [Hospedagem da API](docs/pt-BR/hospedagem-api.md) | [API hosting](docs/en/api-hosting.md) |
| Worker Cloudflare | [Workers](docs/pt-BR/cloudflare-workers.md) | [Workers](docs/en/cloudflare-workers.md) |
| Arquitetura | [Arquitetura](docs/pt-BR/arquitetura.md) | [Architecture](docs/en/architecture.md) |
| Requisitos | [Produto](docs/pt-BR/produto.md) | [Product](docs/en/product.md) |
| Planejamento | [Roadmap](docs/pt-BR/roadmap.md) | [Roadmap](docs/en/roadmap.md) |
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
