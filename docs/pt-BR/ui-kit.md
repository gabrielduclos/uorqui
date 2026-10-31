# Uorqui UI Kit · Design System v0.1

> Somente documentação. O UI Kit **não** terá página ou rota dentro do aplicativo.

## Objetivo

Definir a linguagem visual compartilhada do Uorqui para mensagens individuais, feed híbrido e comunidades. O sistema precisa funcionar no desktop e no celular, com temas semânticos, acessibilidade e português/inglês.

## Temas

O **Dark é o tema inicial padrão**. O botão de sol/lua no cabeçalho alterna imediatamente entre Dark e Light. A escolha explícita fica no localStorage, chave uorqui:theme.

| Token | Dark | Light | Uso |
| --- | --- | --- | --- |
| --background | #080e1b | #f7f8fc | Fundo principal |
| --foreground | #f1f5ff | #111827 | Texto |
| --card | #101a2b | #ffffff | Cards e painéis |
| --popover | #121d30 | #ffffff | Menus e sobreposições |
| --primary | #6366f1 | #4f46e5 | Ações principais |
| --secondary | #1d2b43 | #e9edf6 | Ações secundárias |
| --muted | #172338 | #eef1f7 | Superfícies neutras |
| --accent | #243653 | #e4eaf8 | Hover e seleção |
| --border | #27344c | #d8deea | Bordas |
| --input | #35445d | #cbd5e1 | Campos |
| --ring | #818cf8 | #6366f1 | Foco do teclado |
| --destructive | #ef4444 | #dc2626 | Excluir e alertas |

Use classes Tailwind semânticas, não cores fixas que só funcionem no dark. Verifique contraste nos dois temas.

## Tipografia, dimensões e estilo

- Fonte Inter/system sans-serif. Corpo de 14–16px; títulos de seção 18–30px; destaques até 48px; metadados 11–12px.
- Espaçamento na escala Tailwind de 4px e controles de toque com aproximadamente 40–44px.
- Cards podem ter cantos arredondados; **os balões do mensageiro têm cantos retos**.
- As conversas e canais usam a largura disponível do desktop, sem coluna estreita centralizada.
- Menus e modais ficam dentro da tela, inclusive com teclado do celular aberto; suporte a Escape.

## Componentes

| Componente | Responsabilidade |
| --- | --- |
| Button, Input, Label | Botões e formulários acessíveis |
| Card, Badge, Separator, ScrollArea | Estrutura e superfícies |
| Avatar | Foto ou iniciais |
| PreferencesControls | Troca de idioma por bandeira e tema no cabeçalho |
| DemoMessageComposer | Texto expansível, anexo horizontal pelo +, emoji à direita, áudio/envio no mesmo botão |
| DemoChatBubble | Balão retangular, resposta, reação e menu dentro da tela sobre conversa desfocada |
| DemoAudioPlayer, DemoMediaViewer | Áudio e visualização de fotos/vídeos |
| DemoImageEditor | Desenhos e formas em fotos antes de enviar e no visualizador |

Por enquanto, o mensageiro e os canais seguem como **prévia local**, sem sincronização real com o servidor.

## Idiomas

- Cabeçalho com **🇧🇷 PT** ou **🇺🇸 EN**, alternando sem recarregar.
- Preferência salva na chave uorqui:language. Navegadores em português começam em PT-BR; os demais em inglês.
- Traduzir menus, botões, placeholders, labels acessíveis, modais e erros. **Não traduzir automaticamente** mensagens escritas por usuários nem identificadores técnicos.
- Código compartilhado em UorquiPreferences.tsx, através de useUorquiPreferences e t.
- Atualizar o atributo lang do documento ao trocar o idioma.

## Código de referência

- apps/web/src/styles.css — tokens de tema
- apps/web/src/UorquiPreferences.tsx — estado de idioma e tema
- apps/web/src/PreferencesControls.tsx — controles no cabeçalho
- apps/web/src/components/ui/ — componentes reutilizáveis
- apps/web/src/Demo*.tsx — componentes do chat

A cada mudança, conferir dark/light × português/inglês × desktop/mobile, acessibilidade e documentação.
