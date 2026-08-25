# Uorqui — Histórico de versões

## 1.2.23 — Navegação e atualização do feed

- Adicionado gesto de puxar para baixo no PWA para atualizar o feed sem recarregar toda a aplicação.
- O aviso da atualização do feed aparece abaixo do header, dentro da área de conteúdo, para diferenciar claramente essa ação de um recarregamento completo.
- A puxada comum atualiza somente o feed; o limite para atualização completa foi ampliado para exigir uma puxada deliberadamente mais longa.
- Adicionado segundo nível de puxada: ao puxar mais a tela a partir do topo, o PWA faz atualização completa da página.
- O comportamento de atualização completa passa a existir também no PWA do iPhone, onde o gesto nativo não é consistente como no navegador e no Android.
- O indicador do refresh completo permanece no topo e informa explicitamente quando toda a aplicação será recarregada.
- Ao tocar em **Início**, o Uorqui volta o feed para o topo mesmo quando o usuário já está na tela inicial.
- Adicionada a opção **Responder** em respostas existentes. O campo mostra quem está sendo respondido, direciona a menção para essa pessoa e mantém a resposta visualmente encadeada sem aumentar indefinidamente o recuo.
- Mantidas as otimizações de cache de mídia e as validações automáticas da versão 1.2.22.

## 1.2.22 — Stabilization

- Cache persistente de fotos por usuário para acelerar reabertura do feed e comunidades.
- Priorização das primeiras mídias dos posts no carregamento inicial.
- CI com verificação TypeScript e build de produção em alterações na `main`.
- Correções de runtime e estabilização do PWA/notificações.
