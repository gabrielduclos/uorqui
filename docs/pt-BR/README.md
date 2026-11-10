# Documentação do Uorqui

[Português](README.md) · [English](../en/README.md) · [README principal](../../README.pt-BR.md)

Este é o **índice da documentação do produto Uorqui e do código-fonte**. Atende pessoas que desejam conhecer o beta, desenvolvedores que trabalham em um módulo e responsáveis por hospedagem e suporte. O [estudo de caso de engenharia](portfolio.md) fica separado para aprofundar decisões, evidências e aprendizados.

> **Versão atual:** `0.1.0-beta.38` (beta técnico). Os guias podem registrar detalhes de implementação, decisões históricas e testes pendentes. Consulte as [notas de versão](../../CHANGELOG.pt-BR.md) e o [roadmap](roadmap.md) para verificar a situação mais recente. CI aprovada não significa certificação do PWA em dispositivos reais nem estabilidade em escala.

## Produto e funcionalidades

| Tema | Conteúdo |
| --- | --- |
| [Requisitos do produto](produto.md) | Escopo das funções, comportamentos detalhados e decisões históricas separadas dos recursos atuais |
| [Visão e princípios](visao.md) | Por que o produto é centrado em comunidades e o que fica fora da proposta |
| [Descobrir](descobrir.md) | Como a descoberta substituiu o antigo feed social global |
| [Mensageiro 1:1](mensageiro.md) | Conversas, respostas, anexos e funcionamento em tempo real |
| [Perfis](perfis.md) | Visibilidade, identidade e controle de acesso |
| [Comunidades e permissões](permissoes-canais.md) | Papéis, canais fechados, moderação e verificações |
| [Convites para canais fechados](convites-canais-fechados.md) | Links de uso único e concessão de acesso |
| [Reuniões com áudio e vídeo](reunioes-video.md) | Salas pequenas, tela compartilhada, aprovação, links reutilizáveis e limites |
| [Notificações](notificacoes.md) | Contadores de não lidos, Web Push e preferências |
| [E-mail conectado](email.md) | Provedores, múltiplas contas, pastas, mensagens e limitações |
| [Roadmap](roadmap.md) | Entregas, direção do produto e validações pendentes |

## Arquitetura e desenvolvimento

| Tema | Conteúdo |
| --- | --- |
| [Primeiros passos](primeiros-passos.md) | Requisitos, execução local, banco de testes e variáveis de ambiente |
| [Arquitetura](arquitetura.md) | Componentes, fluxos de dados, permissões e escolhas técnicas |
| [Frontend](frontend.md) | Implementação React/PWA e limites da interface |
| [Cloudflare Worker](cloudflare-workers.md) | Static assets, proxy da API na mesma origem e publicação |
| [Hospedagem da API](hospedagem-api.md) | Render, configuração da API e disponibilidade |
| [UI kit](ui-kit.md) | Padrões de interface e componentes compartilhados |
| [Como contribuir](../../CONTRIBUTING.pt-BR.md) | Pull requests, padrões de desenvolvimento e colaboração |

## Operação, segurança e versões

| Tema | Conteúdo |
| --- | --- |
| [Notas de versão](../../CHANGELOG.pt-BR.md) | Versões, correções, migrações e alterações anteriores |
| [Política de versões](versoes.md) | Alinhamento de manifestos, regras e publicação |
| [Incidente de rate limit na Cloudflare](cloudflare-rate-limiting.md) | Regra histórica, estado desativado e investigação do HTTP 429 |
| [Auditoria de manutenção](auditoria-manutencao.md) | Limpeza e decisões sobre dívida técnica |
| [Política de segurança](../../SECURITY.pt-BR.md) | Comunicação privada de vulnerabilidades e cuidados necessários |

## Portfólio de engenharia

Para avaliar o projeto como experiência de desenvolvimento, consulte o [estudo de caso](portfolio.md) junto ao **código real**, [testes de integração da API](../../apps/api/test), [testes web](../../apps/web/test), [migrações](../../apps/api/drizzle) e [workflows do CI](../../.github/workflows). O estudo explica escolhas técnicas e limitações; ele **não substitui** a documentação do produto.

## Caminhos de leitura

- **Novo usuário / avaliação do produto:** [Produto](produto.md) → [Descobrir](descobrir.md) → [Comunidades](permissoes-canais.md) → [Reuniões](reunioes-video.md)
- **Novo colaborador:** [Primeiros passos](primeiros-passos.md) → [Arquitetura](arquitetura.md) → [UI kit](ui-kit.md) → [Contribuir](../../CONTRIBUTING.pt-BR.md)
- **Operação:** [Hospedagem da API](hospedagem-api.md) → [Worker](cloudflare-workers.md) → [Segurança](../../SECURITY.pt-BR.md) → [Notas de versão](../../CHANGELOG.pt-BR.md)
- **Recrutador / avaliação técnica:** [README principal](../../README.pt-BR.md) → [Portfólio](portfolio.md) → [Testes](../../apps/api/test)

Não inclua credenciais, dados privados de clientes ou segredos de produção em issues, exemplos ou capturas.
