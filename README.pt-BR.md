# Uorqui

**Plataforma open source de comunicação que reúne comunidades, mensagens individuais, reuniões e e-mails conectados.**

[Português (Brasil)](README.pt-BR.md) · [English](README.md)

**Beta técnico `0.1.0-beta.40`** · [Abrir Uorqui](https://uorqui.app) · [Documentação do produto](docs/pt-BR/README.md) · [Estudo de caso técnico](docs/pt-BR/portfolio.md)

> **Beta, não uma versão estável.** Os recursos abaixo estão implementados no projeto, mas testes em dispositivos reais, integrações com provedores e carga ainda estão em andamento. Consulte o [roadmap](docs/pt-BR/roadmap.md) antes de depender da plataforma em operações críticas.

## Sobre o produto

O Uorqui reúne formas de comunicação do dia a dia em um único lugar. É possível descobrir comunidades, participar de canais temáticos, trocar mensagens privadas, entrar em pequenas reuniões por voz/vídeo e acompanhar caixas de e-mail conectadas sem alternar entre interfaces diferentes.

O público inicial dos testes inclui comunidades gamers, mas a proposta atende outros grupos e espaços colaborativos. A tela **Descobrir** substituiu o antigo feed global de publicações: o foco está na participação, não em uma rolagem infinita.

### O que é possível fazer

| Área | Funcionalidades no beta atual | Documentação |
| --- | --- | --- |
| **Mensagens privadas** | Conversas 1:1 persistidas, respostas, reações, mídias/arquivos, mensagens fixadas, entrega/leitura, atualizações em tempo real e push | [Mensageiro](docs/pt-BR/mensageiro.md) |
| **Comunidades** | Espaços públicos/privados, canais de texto e voz moderados, papéis, permissões, senhas e convites seguros | [Produto](docs/pt-BR/produto.md) · [Permissões](docs/pt-BR/permissoes-canais.md) |
| **Voz e vídeo** | Salas pequenas com WebRTC, aprovação em reuniões, compartilhamento de tela, links reutilizáveis para participantes autorizados e limite de 60 minutos por sessão | [Reuniões](docs/pt-BR/reunioes-video.md) |
| **Descobrir e notificações** | Busca de comunidades, atividades das comunidades participantes, notificações e contadores de mensagens/e-mails não lidos | [Descobrir](docs/pt-BR/descobrir.md) · [Notificações](docs/pt-BR/notificacoes.md) |
| **E-mail conectado** | Navegação entre várias contas e caixa unificada, Gmail OAuth, Outlook OAuth opcional e configuração manual IMAP/SMTP | [E-mail](docs/pt-BR/email.md) |

**Acesso é diferente de convite:** um link de reunião não concede participação na comunidade nem acesso ao canal. Para entrar em um canal fechado, há convite separado e autorização verificada pelo servidor. Provedores de e-mail e recursos de dispositivos dependem de configuração e disponibilidade.

### Exemplo de uso

1. **Descobrir** uma comunidade ou aceitar um convite e abrir um canal de texto ou voz autorizado.
2. **Conversar** individualmente com outra pessoa, incluindo anexos e respostas a mensagens.
3. **Colaborar** numa sala de voz ou reunião, com permissões, regras de admissão e cronômetro visível.
4. **Acompanhar** os avisos pela central de notificações ou consultar e-mails das contas conectadas.

## Como funciona

O projeto usa um **monorepo TypeScript**, com PWA React, API Node.js/Fastify e PostgreSQL. A API segue uma arquitetura de monólito modular, não uma coleção de microsserviços.

| Componente | Tecnologias | Responsabilidade |
| --- | --- | --- |
| Web e PWA | React, TypeScript, Vite, Tailwind CSS | Interface responsiva, navegação e ações otimistas |
| Borda | Cloudflare Workers Static Assets | Publicar a SPA e encaminhar a API na mesma origem |
| Backend | Node.js 22, Fastify, Better Auth | Rotas autenticadas, regras de negócio e SSE |
| Persistência | Neon PostgreSQL, Drizzle | Contas, conversas, membros, permissões e migrações |
| Mídia e comunicação | Cloudflare R2, Web Push, WebRTC | Arquivos protegidos, notificações e chamadas P2P |
| Entrega | Render, Cloudflare Builds, GitHub Actions | Publicações separadas e validações automatizadas |

Mais detalhes: [Arquitetura](docs/pt-BR/arquitetura.md) · [Worker e proxy](docs/pt-BR/cloudflare-workers.md) · [UI kit](docs/pt-BR/ui-kit.md).

## Executar localmente

**Requisitos:** Node.js 22+, npm e PostgreSQL para autenticação e dados persistentes. Use PostgreSQL local ou uma branch de desenvolvimento isolada na Neon.

```bash
git clone https://github.com/gabrielduclos/uorqui.git
cd uorqui
npm install
npm run dev
```

Interface: `http://localhost:5173` · API: `http://127.0.0.1:3001`.

Para usar recursos autenticados, configure `apps/api/.env` com base no exemplo seguro, conecte um banco **exclusivo de desenvolvimento** e execute as migrações Drizzle documentadas. A interface pode iniciar sem banco; as funções autenticadas não. Siga o [guia completo](docs/pt-BR/primeiros-passos.md) antes de executar `npm run db:migrate`. Não use segredos de produção localmente.

Para validar alterações:

```bash
npm run typecheck
npm run build
```

As suítes de testes de interface e integração estão organizadas na [documentação técnica](docs/pt-BR/README.md).

## Estado da versão e operação

- **Disponível para beta controlado:** interface, mensagens, comunidades, Descobrir, reuniões, notificações e integrações configuráveis de e-mail.
- **Ainda em validação:** PWA instalado em iOS/Android, WebRTC entre redes e TURN, fluxos reais com provedores de e-mail, entrega de push, acessibilidade, testes de carga e custos.
- **Investigação de HTTP 429:** os limites de autenticação do backend permanecem. A regra genérica da Cloudflare por IP foi desativada em 10/11/2026; a origem do primeiro 429 não foi comprovada. Veja [operações](docs/pt-BR/cloudflare-rate-limiting.md).

Recursos implementados e CI aprovada **não comprovam** estabilidade em escala de produção. Consulte o [roadmap](docs/pt-BR/roadmap.md) e as [notas de versão](CHANGELOG.pt-BR.md).

## Documentação por objetivo

| Você quer… | Comece por aqui |
| --- | --- |
| **Entender ou utilizar o produto** | [Guia e mapa de funcionalidades](docs/pt-BR/README.md) · [Requisitos do produto](docs/pt-BR/produto.md) |
| **Desenvolver ou contribuir** | [Ambiente local](docs/pt-BR/primeiros-passos.md) · [Arquitetura](docs/pt-BR/arquitetura.md) · [Contribuir](CONTRIBUTING.pt-BR.md) |
| **Operar ou solucionar problemas** | [Hospedagem da API](docs/pt-BR/hospedagem-api.md) · [Cloudflare Worker](docs/pt-BR/cloudflare-workers.md) · [Segurança](SECURITY.pt-BR.md) |
| **Avaliar a engenharia como portfólio** | [Estudo de caso, decisões e evidências](docs/pt-BR/portfolio.md) · [Testes de código](apps/api/test) |

O **README e os guias do produto descrevem o Uorqui**; o estudo de caso de portfólio, separadamente, explica decisões técnicas, compromissos, aprendizados e evidências.

## Código aberto

Licença MIT · [Contribuição](CONTRIBUTING.pt-BR.md) · [Segurança](SECURITY.pt-BR.md) · [Notas de versão](CHANGELOG.pt-BR.md) · [Versionamento](docs/pt-BR/versoes.md).

**Uorqui — converse, descubra, participe.**
