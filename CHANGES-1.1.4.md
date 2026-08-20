# Uorqui 1.1.4

## Comunidades
- A lista de membros não ocupa mais a tela principal da comunidade.
- A comunidade mostra apenas um link com a quantidade de membros.
- Ao tocar/clicar nesse link, abre uma tela própria de membros.
- Nessa tela o administrador continua podendo adicionar e remover usuários.

## Fotos e anexos
- Fotos anexadas à publicação agora aparecem diretamente no feed.
- Não aparece mais a mensagem `1 anexo(s) — abra a publicação para visualizar`.
- Uma foto ocupa a largura da publicação.
- Múltiplas fotos usam uma grade responsiva.
- Arquivos que não são imagem aparecem como um cartão de arquivo com opção de download.
- As mídias continuam privadas no R2 e são carregadas pelo `/api/media/:id` após autenticação.

## Deploy
A alteração é somente de frontend React. O Worker/API existente continua compatível.
Faça commit + push no mesmo projeto `uorqui-api`. Não altere Secrets, Firebase ou R2.
