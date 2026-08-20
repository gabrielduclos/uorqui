# Uorqui 1.1.3

## Comunidades e usuários
- Cada comunidade agora mostra a quantidade de membros.
- Ao abrir a comunidade, é possível ver quais usuários fazem parte dela.
- Administradores podem adicionar e remover usuários diretamente de uma comunidade.
- Administradores podem abrir comunidades mesmo quando não são membros delas.
- O proprietário da empresa pode definir o nível de cada colaborador como:
  - Usuário
  - Administrador
- O nível Proprietário permanece protegido.

## Publicações e comentários
- Comentários não abrem mais em modal: ficam abaixo da própria publicação.
- Contadores de curtidas e comentários permanecem visíveis no mobile.
- O autor pode excluir a própria publicação definitivamente.
- Quando um Administrador apaga a publicação de outra pessoa, o conteúdo é removido,
  mas permanece um aviso: "Publicação apagada por um administrador".
- Respostas, reações e anexos da publicação removida também são apagados.

## Notificações
- O sino agora abre uma página de Notificações dentro do app.
- A gaveta/modal de notificações deixou de ser usada.

## Marca
- Logo do menu desktop maior.
- Logo da tela de login bem maior.
- A tela de login usa uma versão transparente do logo para eliminar diferença de
  tonalidade entre o fundo da imagem e o fundo da página.

## Deploy
A versão altera frontend e Worker. Faça commit/push e publique o mesmo Worker
`uorqui-api`. Mantenha `public/firebase-config.js`, Secrets e R2 como estão.
