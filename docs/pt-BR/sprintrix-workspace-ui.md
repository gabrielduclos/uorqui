# Navegação de espaços inspirada no Sprintrix

A interface adapta padrões gerais observados na [demonstração pública do Sprintrix](https://shadcn-nextjs-sprintrix-app-template.vercel.app/my-issues). O Sprintrix é comercial; nenhum código-fonte, imagem, asset ou componente pago foi copiado.

## Escopo
- Visual shadcn mais neutro e compacto, com barra lateral de 240px no desktop.
- Seção Principal com módulos e contadores reais; seção Suas comunidades com vínculos autorizados, acesso aos canais existentes e destaque para a comunidade selecionada.
- Barra lateral expandida substitui a coluna duplicada de ícones de comunidades no desktop; barra recolhida preserva a coluna. Navegação mobile permanece.
- Paleta com Ctrl/Cmd+K ou botões de busca: navega por módulos e comunidades existentes, sem prometer busca global ainda não implementada.
- Preferências de conta e moderação seguem operacionais, com suas permissões.
- Preservados cache das mensagens, SSE, envio otimista, chamadas WebRTC e endpoints existentes.

## Validações
1. Conferir atalhos sem comunidades e com uma ou várias comunidades, entradas e saídas.
2. Testar paleta no teclado/mouse, em português e inglês, e movimento reduzido.
3. Testar sidebar aberta/recolhida, convites por links, badges e perfil.
4. Conferir PWA mobile, teclado, áudio e safe areas.
5. Executar typecheck/build e testes de integração da API antes da publicação.
