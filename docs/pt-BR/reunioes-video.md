# Salas de voz e reuniões com áudio e vídeo

Atualizado em **06/11/2026** para o beta técnico `0.1.0-beta.2`.

O Uorqui oferece canais de **texto**, **voz** e **reunião** nas comunidades. O usuário entra na chamada explicitamente; abrir a sala não ativa câmera ou microfone automaticamente.

## Comportamento da interface

- **Chat de texto recolhido por padrão** tanto nas salas de voz quanto nas reuniões, com controle para expandir e recolher sem desligar a chamada.
- O conteúdo da sala e o painel de texto se adaptam ao espaço disponível em celular e desktop. Uma chamada ativa pode ser minimizada dentro do Uorqui sem desmontar o componente WebRTC.
- Na reunião, cada participante pode ativar/desativar sua câmera e microfone. Caso a câmera falhe, é possível entrar apenas com áudio.
- A **câmera de quem fala** recebe realce visual baseado na atividade de áudio. O modo **Tela cheia** usa a câmera em destaque como imagem principal e, quando disponível, a própria câmera como miniatura sobreposta, no estilo de videoconferência.
- É possível **fixar outra câmera** manualmente, navegar pelas miniaturas e voltar ao destaque automático. A apresentação de tela pode ocupar a imagem principal.
- O botão **Compartilhar tela** está disponível nas salas de voz e nas reuniões: usa `getDisplayMedia` e permite exibir a tela e a câmera simultaneamente. O botão fica indisponível quando o navegador não oferece essa API; em celulares e PWAs, a captura varia conforme o sistema e navegador.
- Os controles de microfone, câmera, apresentação, encerramento e saída da tela cheia continuam acessíveis na visualização ampliada.
- O botão **Convidar** da sala de reunião e o botão do cabeçalho do canal abrem o **mesmo modal de convite**. Um link temporário inclui entrada na comunidade e acesso direto ao canal/reunião, por cópia ou chat 1:1. Entrada na reunião e permissões continuam obrigatórias.

## Aprovação e segurança

- Proprietários e administradores escolhem **Entrada direta** ou **Por aprovação** em cada reunião.
- No modo por aprovação, a API impede o ingresso WebRTC antes da autorização; o administrador pode aceitar ou recusar solicitações.
- **Participação na comunidade**, **senha do canal** e **admissão da reunião** são checagens distintas e aplicadas no backend.
- Solicitações para entrar em comunidades e reuniões geram avisos na central de notificações dos administradores e push quando autorizado.
- Uma solicitação de comunidade aprovada emite evento SSE direcionado à conta solicitante: a lista e o detalhe são atualizados sem recarregar a página, e a assinatura é renovada para receber eventos da comunidade recém-ingressada.

## Administração dos canais

- O cabeçalho não possui mais o botão **Editar canal**; proprietários e administradores configuram nome, descrição fixa, senha e permissões em **Moderação → Canais**.
- A descrição (até 4.000 caracteres) fica fixada abaixo do cabeçalho de qualquer tipo de canal. Regras longas aparecem recolhidas com **Ler mais / Mostrar menos**.
- Na criação, nomes numerados por tipo são sugeridos automaticamente e podem ser editados. Em **Moderação → Membros**, o proprietário e administradores escolhem quem pode acessar canais fechados. Excluir canal permanece na moderação.
- Permissão individual, senha e admissão da reunião são verificações diferentes; revogar um acesso fechado desconecta o participante da sala. Consulte [Permissões de canais](permissoes-canais.md).
- As senhas são armazenadas como hash scrypt com salt; a troca revoga desbloqueios anteriores. O servidor limita tentativas de senha incorreta.

## Arquitetura e limites

- WebRTC usa uma malha **P2P de até seis pessoas** com sinalização na API Fastify e sessões persistidas em Neon PostgreSQL; não há gravação da reunião pela aplicação.
- O compartilhamento de tela e o vídeo dependem de suporte e permissões do navegador. TURN, redes distintas, iOS/Android e PWA instalado **ainda exigem testes práticos**.
- As migrações versionadas `0030`–`0032` introduziram os canais de reunião, o controle de entrada e as senhas. Migrações históricas não devem ser apagadas só porque seus recursos foram aposentados.
- CI de TypeScript, build e integração não substitui um teste real com dois ou mais aparelhos e redes diferentes.
