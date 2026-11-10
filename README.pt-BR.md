# Uorqui

**Plataforma open source de comunicação para comunidades, mensagens privadas e espaços colaborativos.**

[Português (Brasil)](README.pt-BR.md) · [English](README.md)

**Beta técnico `0.1.0-beta.37`** · [Testar o beta](https://uorqui.app) · [Estudo de caso para portfólio](docs/pt-BR/portfolio.md) · [Código-fonte](https://github.com/gabrielduclos/uorqui)

> É um **beta técnico funcional em desenvolvimento**, não um produto certificado como pronto para uso crítico. Chamadas entre dispositivos, PWA instalado, notificações e integrações reais de e-mail ainda exigem validação.

## Qual problema o Uorqui busca resolver?

Para participar de comunidades e manter contato, muitas pessoas alternam entre mensageiro, servidor de comunidade, link de reunião e caixa de e-mail. O Uorqui explora um **ambiente de comunicação centrado em comunidades**: descobrir espaços, participar dos canais, conversar individualmente e reunir os e-mails conectados numa interface responsiva.

O público inicial de validação inclui comunidades gamers, mas não se limita a elas. O feed global de publicações foi **descontinuado** em favor do Descobrir, focado em comunidades e participação.

## Explore o produto

| Experiência | Implementada no beta |
| --- | --- |
| **Mensagens 1:1** | Persistência, envio otimista, respostas, reações, mensagens fixadas, mídias/arquivos, estados de entrega/leitura, SSE, push e galeria |
| **Comunidades** | Espaços públicos/privados, canais de texto e voz, papéis, moderação, permissões, senhas opcionais e convites protegidos |
| **Reuniões** | Áudio/vídeo WebRTC (até seis pessoas), entrada por aprovação, link reutilizável por participantes autorizados, tela compartilhada e **cronômetro de 60 minutos por sessão** |
| **Descobrir e avisos** | Busca/recomendação de comunidades, atividade de comunidades participantes, central de notificações e indicadores de mensagens/canais/e-mails |
| **E-mail conectado** | Múltiplas contas, navegação unificada, Gmail OAuth, Outlook OAuth opcional e IMAP/SMTP manual; disponibilidade depende da configuração e do provedor |

## Arquitetura em resumo

| Camada | Tecnologia | Responsabilidade |
| --- | --- | --- |
| Web / PWA | React, TypeScript, Vite, Tailwind CSS | Interface responsiva, shell com suporte offline, estado e interações |
| Borda | Cloudflare Worker e Static Assets | Hospedagem da SPA, proxy da API na mesma origem e transporte |
| API | Node.js 22, Fastify, Better Auth | Sessões, autorização, HTTP, SSE e regras de negócio |
| Dados | Neon PostgreSQL, Drizzle ORM | Contas, mensagens, associações, notificações e migrações |
| Mídia e chamadas | Cloudflare R2, Web Push, WebRTC | Arquivos protegidos, avisos e áudio/vídeo P2P |
| Entrega | Render, Cloudflare Builds, GitHub Actions | Deploy separado da API e web; verificações automatizadas |

**Decisões técnicas relevantes:** monólito modular na API; permissões verificadas no servidor; distribuição de eventos com PostgreSQL e SSE; mensagens otimistas reconciliadas; encaminhamento de IP assinado da borda para a API; **links de reunião separados dos convites que concedem acesso ao canal**; migrações versionadas.

Consulte [arquitetura](docs/pt-BR/arquitetura.md), [mensageiro](docs/pt-BR/mensageiro.md), [reuniões](docs/pt-BR/reunioes-video.md) e [decisões técnicas do portfólio](docs/pt-BR/portfolio.md).

## Portfólio: o que este repositório demonstra

O repositório é um **estudo de caso de produto e engenharia ponta a ponta**, não apenas um template visual. Registra escolhas de escopo, integração frontend/backend, migrações, autenticação, tempo real, diagnóstico operacional de erros HTTP 429, CI e decisões de deploy.

O desenvolvimento usa **ferramentas de IA como apoio** em partes da implementação, depuração e documentação. O portfólio busca demonstrar entendimento das decisões, formas de verificação e limites reais do sistema, sem afirmar que cada linha foi escrita manualmente. Leia o [estudo de caso, evidências e pendências](docs/pt-BR/portfolio.md).

## Maturidade atual

- **Implementado:** beta funcional PWA + API, mensagens, comunidades, Descobrir, caminhos de integração de e-mail, salas WebRTC, notificações, testes automatizados e migrações.
- **Pendente de validação:** TURN e chamadas entre redes, PWA instalado em iOS/Android, fluxos com provedores reais de e-mail, entrega de push e testes de custos/escala.
- **Rate limit:** a regra genérica da Cloudflare por IP, criada em 10/11, foi **desativada no mesmo dia** por preocupação com redes compartilhadas; autenticação no backend e outras proteções seguem ativas. Veja [registro operacional](docs/pt-BR/cloudflare-rate-limiting.md). A origem do primeiro HTTP 429 ainda não foi confirmada.

**Funcionalidade implementada ou CI aprovada não significam validação completa de produção.** As versões atuais são betas.

## Executar localmente

Requer Node.js **22+** e PostgreSQL (local ou branch Neon isolada para recursos autenticados).

```bash
git clone https://github.com/gabrielduclos/uorqui.git
cd uorqui
npm install
npm run dev
npm run typecheck
npm run build
```

Frontend: `http://localhost:5173` · API: `http://127.0.0.1:3001`. Siga [Primeiros passos](docs/pt-BR/primeiros-passos.md) para ambiente e migrações. **Não use credenciais de produção no desenvolvimento.**

## Documentação

- **Comece por aqui:** [Estudo de caso de portfólio](docs/pt-BR/portfolio.md) · [Arquitetura](docs/pt-BR/arquitetura.md) · [Produto](docs/pt-BR/produto.md) · [Roadmap](docs/pt-BR/roadmap.md)
- **Desenvolvimento:** [Primeiros passos](docs/pt-BR/primeiros-passos.md) · [Cloudflare Worker](docs/pt-BR/cloudflare-workers.md) · [UI kit](docs/pt-BR/ui-kit.md)
- **Qualidade e histórico:** [Notas de versão](CHANGELOG.pt-BR.md) · [Política de versões](docs/pt-BR/versoes.md) · [Contribuição](CONTRIBUTING.pt-BR.md) · [Segurança](SECURITY.pt-BR.md)

Licença MIT. **Uorqui — converse, descubra, participe.**
