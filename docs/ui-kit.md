# Uorqui UI Kit · Design System v0.1.0-beta.1

O UI Kit é **somente documentação no repositório**; não há página ou rota pública no aplicativo.

O marco técnico do beta foi consolidado em **06/11/2026**. O CSS global concentra um único conjunto de tokens Dark/Light, e o workspace logado aplica seus overrides semânticos em `apps/web/src/ui-kit/sprintrix.css`. **A paleta real não é a antiga proposta roxa/azul.**

As especificações atuais estão em:

- [Português](./pt-BR/ui-kit.md)
- [English](./en/ui-kit.md)

O mensageiro e os canais reais usam componentes React persistidos na API. As antigas telas `Demo*.tsx` foram removidas; consulte `LiveDirectChat`, `DirectMessageBubble`, `LiveMessageComposer`, `LiveCommunities` e `CommunityVoiceRoom` como implementações atuais. Consulte também a [auditoria de manutenção](./pt-BR/auditoria-manutencao.md).

As APIs e as limitações atuais do chat estão documentadas em [Mensageiro](./pt-BR/mensageiro.md). A partir de **`v0.1.0-beta.1`**, todo PR deve aumentar a versão e atualizar as notas bilíngues: [política de versões](./pt-BR/versoes.md) / [version policy](./en/versions.md).
