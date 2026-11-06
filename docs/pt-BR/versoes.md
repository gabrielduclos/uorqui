# Política de versões — Uorqui

**Marco inicial do beta: `v0.1.0-beta.1` (06/11/2026).** O marco congela o estado do código, UI Kit, API e documentação de referência. **Beta não significa estabilidade de produção** nem substitui testes reais de dispositivo, e-mail e voz.

## Regra a partir do marco

**Toda alteração posterior enviada por PR deve receber uma versão nova, mesmo se apenas corrigir texto, CSS ou documentação.**

1. Alterar **a mesma versão SemVer** nos arquivos `package.json`, `apps/web/package.json` e `apps/api/package.json`.
2. Acrescentar uma entrada com o novo número em **`CHANGELOG.md` e `CHANGELOG.pt-BR.md`**. Descrever o que mudou, impactos, migrações, riscos e testes relevantes. Manter a seção `[Unreleased]` disponível.
3. Sincronizar a documentação impactada em português e inglês; corrigir o UI Kit quando houver mudança de interface, e os documentos de arquitetura quando houver mudança técnica.
4. Abrir PR e aguardar os checks **Version policy**, **Web UI** e **API/integrations** aplicáveis. O check de versão compara o PR com a `main` e rejeita versões iguais ou menores.
5. O workflow `Publish tagged beta releases` tenta criar a tag imutável `v<versão>` e uma GitHub Release ao entrar na `main`. Se a mesma versão já estiver etiquetada em outro commit, o workflow falha: **não reescrever tags**.

Exemplo de progressão: `0.1.0-beta.1` → `0.1.0-beta.2` → `0.1.0-beta.3` → `0.1.0` (somente quando a versão estável for aprovada). Mudanças incompatíveis ou novos marcos podem elevar minor/major conforme SemVer.

## CI e limitações de proteção

O workflow de versionamento roda em **todos os PRs**, inclusive alterações apenas de documentação, e em pushes para `main`. Para torná-lo **bloqueio obrigatório do merge**, o mantenedor deve configurar nas regras de proteção da branch a verificação **Verify release version** como *required status check*. O CI por si só sinaliza falhas, mas não impede um administrador de ignorar o check se a proteção de branch não estiver ativada.

A geração de tags/Releases depende das permissões de escrita do `GITHUB_TOKEN` e das configurações do repositório; uma build/deploy bem-sucedida não confirma automaticamente uma tag. Não reescrever versões publicadas; gerar uma versão superior para qualquer correção.

## Escopo de consolidação do beta

- CSS: uma definição global de tokens Dark/Light, com paleta efetiva do workspace isolada em `sprintrix.css`.
- Frontend: transporte HTTP compartilhado em `lib/apiClient.ts` para os módulos de mensagens/comunidades/moderação, preservando erros e códigos 204.
- Backend: validação estrita de origem compartilhada em `request-origin.ts`; nenhuma alteração na autorização, banco ou URLs.
- UI Kit e documentação de funcionalidades atualizados para refletir a interface e arquitetura desta versão.

A referência visual é [UI Kit](ui-kit.md); consulte também as [notas da versão](../../CHANGELOG.pt-BR.md).
