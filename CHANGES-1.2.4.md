# Uorqui 1.2.4

## Confirmação de leitura

A confirmação de leitura voltou a ser exclusiva de **Comunicados**.

- Post comum: sem confirmação de leitura.
- Pergunta: sem confirmação de leitura.
- Enquete: sem confirmação de leitura.
- Evento: sem confirmação de leitura.
- Mundo: sem confirmação de leitura.
- Comunicado: pode solicitar confirmação de leitura.

Quando um comunicado exige confirmação:

1. os destinatários recebem notificação;
2. a pendência permanece no sino;
3. abrir a notificação não remove a pendência;
4. somente `Confirmar leitura` dentro do comunicado encerra a pendência.

## Compatibilidade com 1.2.2 / 1.2.3

Se já existirem pendências antigas de confirmação vinculadas a posts, perguntas,
enquetes ou eventos, o bootstrap identifica essas notificações e encerra a
persistência automaticamente. Isso evita notificações antigas impossíveis de
resolver após a mudança de regra.

## Push

O push continua funcionando para:

- novas publicações relevantes;
- comunicados;
- perguntas;
- enquetes;
- eventos;
- respostas;
- curtidas.

O push persistente de confirmação é exclusivo de comunicados.

## Cache

Service Worker atualizado para `uorqui-react-v1.2.4`.

## Deploy

Esta versão altera frontend e Worker.
Não exige novos Secrets, alterações no Firebase, Firestore ou R2.
