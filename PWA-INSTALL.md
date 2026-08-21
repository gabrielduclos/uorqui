# Instalação do Uorqui como PWA

O Uorqui pode ser instalado diretamente do navegador sem App Store ou Google Play.

## Android / Chrome / Edge

Quando o navegador considerar o PWA elegível, o Uorqui captura o prompt nativo.
Depois de algumas interações, aparece um convite discreto com o botão `Instalar`.

Também existe:

```text
Perfil → Instalar Uorqui
```

## iPhone / iPad

No Safari:

1. Abra o Uorqui.
2. Toque em `Compartilhar`.
3. Escolha `Adicionar à Tela de Início`.
4. Confirme em `Adicionar`.

O Uorqui detecta iPhone/iPad e mostra essas instruções dentro do próprio produto.

## Política do convite

- não interrompe o primeiro acesso;
- aparece somente depois de algumas interações;
- pode ser dispensado;
- depois de dispensado, fica oculto por 14 dias;
- não aparece quando o app já está em modo standalone.

## Requisitos técnicos

Já presentes no projeto:

- HTTPS;
- Service Worker;
- `manifest.webmanifest`;
- ícones 192 e 512;
- `display: standalone`;
- `start_url`;
- `scope`;
- `apple-touch-icon`;
- metadados Apple para modo standalone.

O navegador continua sendo o responsável por decidir quando o prompt nativo pode
ser oferecido. Por isso o Perfil mantém uma alternativa permanente de instalação/instrução.
