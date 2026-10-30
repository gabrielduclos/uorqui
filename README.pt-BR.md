# Uorqui

**Uma plataforma social open source para conversar, descobrir conteúdos e participar de comunidades.**

[English](README.md) · [Português (Brasil)](README.pt-BR.md)

> **Status: estrutura de desenvolvimento / pré-MVP.** O Uorqui está sendo criado do zero. Há uma base local com React/Fastify, mas as funcionalidades sociais e o banco ainda não foram implementados ou publicados.

## O que é o Uorqui?

O Uorqui reúne três experiências integradas:

1. **Conversas individuais:** mensagens privadas de uma pessoa para outra. Grupos de mensagens tradicionais ficam intencionalmente fora do escopo.
2. **Feed híbrido:** rolagem vertical contínua com textos, fotos, carrosséis e vídeos. Há um modo imersivo **Vídeos**, dedicado exclusivamente a vídeos, acessível diretamente ou ao abrir um vídeo do feed.
3. **Comunidades:** espaços públicos ou privados com canais de texto, salas de voz ao vivo, cargos, permissões e moderação.

O objetivo é conectar **descoberta de conteúdo → participação em comunidades → relacionamentos individuais** sem copiar integralmente nenhuma rede existente.

A validação começa com comunidades gamers, especialmente de MMORPG, mas a marca e o produto são **de uso geral**.

## Tecnologias principais definidas

**React + TypeScript + Tailwind CSS** (web/PWA), **Node.js + Fastify** (API) e **PostgreSQL na Neon + Drizzle ORM** (banco, consultas e migrações). Essas tecnologias foram escolhidas, mas **ainda não foram provisionadas nem implementadas**. Tempo real, voz, mídias e hospedagem continuam em avaliação.

## Documentação

| Tema | Português | English |
| --- | --- | --- |
| Rodar localmente | [Primeiros passos](docs/pt-BR/primeiros-passos.md) | [Getting started](docs/en/getting-started.md) |
| Visão e princípios | [Visão](docs/pt-BR/visao.md) | [Vision](docs/en/vision.md) |
| Requisitos do produto | [Produto](docs/pt-BR/produto.md) | [Product](docs/en/product.md) |
| Arquitetura proposta | [Arquitetura](docs/pt-BR/arquitetura.md) | [Architecture](docs/en/architecture.md) |
| Etapas do projeto | [Roadmap](docs/pt-BR/roadmap.md) | [Roadmap](docs/en/roadmap.md) |
| Como contribuir | [Contribuindo](CONTRIBUTING.pt-BR.md) | [Contributing](CONTRIBUTING.md) |
| Segurança | [Segurança](SECURITY.pt-BR.md) | [Security](SECURITY.md) |
| Convivência | [Código de conduta](CODE_OF_CONDUCT.pt-BR.md) | [Code of conduct](CODE_OF_CONDUCT.md) |

## Situação atual

- **Concluído:** repositório, licença MIT e documentação inicial de produto e tecnologia.
- **Ainda não implementado:** provisionamento e migrações do banco, autenticação, API funcional de produto, mensagens em tempo real, vídeos, salas de voz, deploy e validação com usuários.
- **Próximo:** configurar a Neon, revisar/aplicar o schema, definir autenticação, validar o build e implementar gradualmente um MVP utilizável.

A documentação técnica distingue **tecnologias principais aprovadas** de **integrações ainda propostas**, sem declarar funcionalidades implementadas. O planejamento comercial, as hipóteses de preço e as projeções financeiras ficam separados deste repositório público.

## Desenvolvimento

Os workspaces npm iniciais contêm uma **interface React + Tailwind**, um **endpoint de saúde Fastify** e um **schema Drizzle ainda não aplicado**. Com Node.js 22+:

```sh
npm install
npm run dev
```

Interface: `http://localhost:5173` · API: `http://127.0.0.1:3001/health`. Não é necessário banco para visualizar esta estrutura. Veja [Primeiros passos](docs/pt-BR/primeiros-passos.md) para configurar a Neon com segurança.

## Código aberto

Licença [MIT](LICENSE). Leia [CONTRIBUTING.pt-BR.md](CONTRIBUTING.pt-BR.md) antes de contribuir e [SECURITY.pt-BR.md](SECURITY.pt-BR.md) ao identificar uma vulnerabilidade.

O mensageiro empresarial anterior é um **produto legado separado**. O domínio registrado **uorqui.app** não significa que esta nova aplicação já foi lançada.

---

**Uorqui — converse, descubra, participe.** *(Slogan provisório.)*
