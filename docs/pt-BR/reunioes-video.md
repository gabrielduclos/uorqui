# Salas de voz e reuniões com áudio e vídeo

Atualizado em **03/11/2026** para o beta técnico `0.1.0-beta.1`.

O Uorqui oferece canais de **texto**, **voz** e **reunião** nas comunidades. O usuário entra na chamada explicitamente; abrir a sala não ativa câmera ou microfone automaticamente.

## Comportamento da interface

- **Chat de texto recolhido por padrão** tanto nas salas de voz quanto nas reuniões, com controle para expandir e recolher sem desligar a chamada.
- O conteúdo da sala e o painel de texto se adaptam ao espaço disponível em celular e desktop. Uma chamada ativa pode ser minimizada dentro do Uorqui sem desmontar o componente WebRTC.
- Na reunião, cada participante pode ativar/desativar sua câmera e microfone. Caso a câmera falhe, é possível entrar apenas com áudio.
- A **câmera de quem fala** recebe realce visual baseado na atividade de áudio. O modo **Tela cheia** usa a câmera em destaque como imagem principal e, quando disponível, a própria câmera como miniatura sobreposta, no estilo de videoconferência.
- É possível **fixar outra câmera** manualmente, navegar pelas miniaturas e voltar ao destaque automático. A apresentação de tela pode ocupar a imagem principal.
- O botão **Compartilhar tela** está disponível nas salas de voz e nas reuniões: usa `getDisplayMedia` e permite exibir a tela e a câmera simultaneamente. O botão fica indisponível quando o navegador não oferece essa API; em celulares e PWAs, a captura varia conforme o sistema e navegador.
- Os controles de microfone, câmera, apresentação, encerramento e saída da tela cheia continuam acessíveis na visualização ampliada.
- O botão **Convidar** copia um link ou envia um convite pelo chat 1:1 do Uorqui. Um link de convite para a comunidade não contorna as regras de acesso da reunião.

## Aprovação e segurança

- Proprietários e administradores escolhem **Entrada direta** ou **Por aprovação** em cada reunião.
- No modo por aprovação, a API impede o ingresso WebRTC antes da autorização; o administrador pode aceitar ou recusar solicitações.
- **Participação na comunidade**, **senha do canal** e **admissão da reunião** são checagens distintas e aplicadas no backend.
- Solicitações para entrar em comunidades e reuniões geram avisos na central de notificações dos administradores e push quando autorizado.
- Uma solicitação de comunidade aprovada emite evento SSE direcionado à conta solicitante: a lista e o detalhe são atualizados sem recarregar a página, e a assinatura é renovada para receber eventos da comunidade recém-ingressada.

## Administração dos canais

- Em qualquer canal de texto, voz ou reunião, o botão **Editar canal** fica no cabeçalho apenas para proprietário/administradores.
- Nesse menu, é possível renomear o canal, definir/trocar/remover senha com confirmação. **Excluir canal** continua na moderação da comunidade.
- As senhas são armazenadas como hash scrypt com salt; a troca revoga desbloqueios anteriores. O servidor limita tentativas de senha incorreta.

## Arquitetura e limites

- WebRTC usa uma malha **P2P de até seis pessoas** com sinalização na API Fastify e sessões persistidas em Neon PostgreSQL; não há gravação da reunião pela aplicação.
- O compartilhamento de tela e o vídeo dependem de suporte e permissões do navegador. TURN, redes distintas, iOS/Android e PWA instalado **ainda exigem testes práticos**.
- As migrações versionadas `0030`–`0032` introduziram os canais de reunião, o controle de entrada e as senhas. Migrações históricas não devem ser apagadas só porque seus recursos foram aposentados.
- CI de TypeScript, build e integração não substitui um teste real com dois ou mais aparelhos e redes diferentes.
