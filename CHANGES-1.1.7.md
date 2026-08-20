# Uorqui 1.1.7

## Administrar
- A tela Administrar agora tem um seletor de empresa.
- O seletor mostra somente empresas em que a conta é Proprietário ou Administrador.
- Ao trocar a empresa dentro de Administrar, a página continua em Administrar e
  recarrega colaboradores/comunidades da empresa escolhida.

## Bloqueio contra duplo clique
- Botões de ação recebem bloqueio visual temporário após o clique.
- A camada de API também deduplica requisições de escrita idênticas enquanto a
  primeira ainda está em andamento.
- Isso evita convites, exclusões, comentários, curtidas e outras gravações duplicadas.

## Fotos no feed
- URLs privadas de imagens agora são cacheadas durante a sessão.
- O feed faz prefetch das fotos antes de trocar os posts exibidos.
- Resultado: texto e fotos tendem a aparecer juntos, evitando o "pop-in" tardio.
- Comunidades e resultados de busca também fazem prefetch.

## Busca
- A busca do header mobile começa automaticamente após 2 caracteres.
- Há debounce de 220ms para não disparar uma consulta a cada tecla.
- Os resultados aparecem enquanto o usuário digita.
- Ao tirar o foco da busca do header, o texto da barra é apagado.
- A busca grande da página de resultados também atualiza enquanto digita.

## Footer mobile
- `Mundo` foi substituído por `Empresas`.
- A nova página Empresas mostra:
  - empresas das quais o usuário participa;
  - seu nível em cada empresa;
  - comunidades disponíveis em cada empresa;
  - quantidade de membros por comunidade;
  - botão para abrir/trocar para outra empresa.
- `Mundo` continua disponível nas abas do feed.

## Deploy
Esta versão altera frontend e Worker (`GET /api/companies/summary`).
Faça commit + push no mesmo Worker `uorqui-api`.
Não altere Firebase, Secrets ou R2.
