# Uorqui 1.1.6

## Header mobile
- Corrigido o problema que escondia a barra de busca e a engrenagem.
- A causa era uma regra CSS global posterior ao media query mobile.
- Busca agora aparece no centro do header.
- Engrenagem aparece ao lado do sino para Proprietário/Administrador.
- Logo permanece fixo à esquerda.
- Footer mobile reduzido de 70px para 62px para ficar proporcional ao header.

## Loading / validação de sessão
- Fundo da tela de carregamento agora é branco.
- O logo usado nessa transição é o wordmark transparente.
- O arquivo quadrado com fundo branco não é mais usado nessa tela.
- Tela de erro de sessão também usa o logo transparente.

## Favicon
- Criado favicon apenas com o isotipo do Uorqui.
- Também foram criados ícones PWA de 192px e 512px somente com o isotipo.
- `manifest.webmanifest` atualizado.

## Avatar sem foto
- Usuários sem foto continuam usando as iniciais.
- O fundo do avatar agora usa o gradiente azul → roxo → verde do isotipo Uorqui,
  em vez do círculo preto.

## Deploy
Esta versão altera apenas frontend/assets.
Faça commit + push no mesmo projeto. Não altere Firebase, Secrets, Firestore ou R2.
