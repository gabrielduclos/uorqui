# Uorqui — Histórico de versões

## 1.2.23 — Navegação e atualização do feed

- Adicionado gesto de puxar para baixo no PWA para atualizar o feed sem recarregar toda a aplicação.
- Adicionado segundo nível de puxada: ao puxar mais a tela a partir do topo, o PWA faz atualização completa da página.
- O comportamento de atualização completa passa a existir também no PWA do iPhone, onde o gesto nativo não é consistente como no navegador e no Android.
- Adicionado indicador visual para mostrar quando a puxada atualiza o feed ou a aplicação inteira.
- Ao tocar em **Início**, o Uorqui volta o feed para o topo mesmo quando o usuário já está na tela inicial.
- Mantidas as otimizações de cache de mídia e as validações automáticas da versão 1.2.22.

## 1.2.22 — Stabilization

- Cache persistente de fotos por usuário para acelerar reabertura do feed e comunidades.
- Priorização das primeiras mídias dos posts no carregamento inicial.
- CI com verificação TypeScript e build de produção em alterações na `main`.
- Correções de runtime e estabilização do PWA/notificações.
