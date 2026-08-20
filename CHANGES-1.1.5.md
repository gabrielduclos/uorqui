# Uorqui 1.1.5

## Perfil / empresas
- O Perfil agora possui uma área `Empresas`.
- O usuário pode criar uma nova empresa sem criar outra conta.
- O usuário que cria a empresa se torna Proprietário.
- Empresas das quais o usuário é Proprietário possuem a opção `Excluir`.
- A exclusão exige digitar exatamente o nome da empresa.
- Excluir uma empresa remove comunidades, membros, publicações, comentários,
  reações, confirmações, convites e mídias ligadas à empresa.
- Administradores e usuários comuns não podem excluir a empresa.
- A conta pessoal Uorqui não é excluída junto com a empresa.

## Header mobile
- Logo movido para a esquerda.
- Uma barra de busca compacta fica no centro do header.
- O sino continua abrindo Notificações.
- Para Owner/Admin, uma engrenagem aparece ao lado do sino e abre Administrar.
- O nome da página continua oculto no mobile.

## Busca
- A busca digitada diretamente no header mobile abre a página de busca já com
  os resultados do termo informado.

## Deploy
A versão altera React e Worker. Faça commit + push no mesmo Worker `uorqui-api`.
Não altere Firebase, Secrets ou R2.
