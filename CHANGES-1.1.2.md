# Uorqui 1.1.2

## Alterações desta versão

- Comunidades agora são clicáveis.
- Ao entrar em uma comunidade, o usuário vê as publicações daquele grupo e pode abrir as respostas.
- Foi criado o endpoint `GET /api/communities/:id/posts`.
- Autor da publicação pode excluir a própria postagem.
- Owner/admin pode excluir postagens da empresa/comunidades.
- Exclusão remove respostas, reações, confirmações de leitura e anexos vinculados.
- Logo do header mobile ficou maior e centralizado.
- Nome da tela foi removido do header mobile.
- Footer mobile: `Alertas` foi trocado por `Mundo`.
- Notificações continuam acessíveis pelo sino do header.
- No desktop, `Notificações` saiu do menu lateral; o sino do header permanece.
- Fundo escuro do login foi ajustado para `#0a0b11`, aproximando-se do fundo do logo escuro.
- Versão exibida atualizada para 1.1.2.

## Deploy

Esta alteração mexe em frontend e backend. Faça o deploy do mesmo Worker `uorqui-api`.

Mantenha seus Secrets e `public/firebase-config.js` atuais.
