# Uorqui 1.2.3

## Instalação PWA

- O Uorqui agora captura o evento nativo `beforeinstallprompt` em navegadores compatíveis.
- O convite não aparece imediatamente: ele é mostrado depois de algumas interações úteis na sessão.
- Se o usuário dispensar o convite, o Uorqui não insiste novamente por 14 dias.
- Quando a instalação é concluída, o banner deixa de aparecer.
- O Perfil agora possui uma opção permanente `Instalar Uorqui`.
- Se o Uorqui já estiver instalado, o Perfil mostra `Uorqui instalado`.

## iPhone / iPad

- Detecta iOS e apresenta instruções próprias:
  Safari → Compartilhar → Adicionar à Tela de Início.
- Adicionados metadados Apple para melhorar a experiência em modo standalone.
- Adicionado `apple-touch-icon`.

## Android / Desktop

- Quando o navegador disponibiliza o prompt nativo, o botão `Instalar` abre o instalador.
- Caso o prompt automático não esteja disponível, o Perfil oferece instruções para usar
  `Instalar app` / `Adicionar à tela inicial` no menu do navegador.

## Manifest

- Adicionados `id`, `scope`, `lang` e categorias.
- Mantido `display: standalone`.
- O Service Worker foi atualizado para o cache `uorqui-react-v1.2.3`.

## Deploy

Esta versão altera somente frontend/PWA.
Não exige mudança no Worker, Firebase, Firestore, R2 ou Secrets.
