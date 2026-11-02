# Reuniões com áudio e vídeo

O Uorqui oferece canais de **Reunião** nas comunidades, separados dos canais de texto e das salas de voz.

## Utilização
- Administradores podem criar um canal do tipo **Reunião (áudio e vídeo)** na lista de canais.
- O participante entra por ação explícita e concede permissões de microfone e câmera. A câmera pode ser desligada/ligada durante a reunião; se o acesso à câmera falhar, ainda é possível conectar apenas com áudio.
- O limite da implementação P2P atual é de **seis participantes**. A transmissão utiliza WebRTC; não existe gravação ou armazenamento de áudio e vídeo no backend.
- Em tela pequena, a reunião ocupa a área principal, com chat de texto disponível para expandir. Controles de chamada continuam acessíveis.
- O botão **Convidar** copia o link da reunião ou envia uma mensagem direta para um @usuário pelo mensageiro do Uorqui. Quando existe um link de convite comunitário válido, ele é reutilizado; administradores podem gerar um quando necessário. Convidados não integrantes precisam aceitar o convite e entrar na comunidade antes de acessar a sala.

## Aprovação
- Apenas administradores/proprietário da comunidade podem alternar a reunião entre **Entrada direta** e **Por aprovação**.
- Na modalidade por aprovação, o servidor nega a conexão WebRTC a integrantes não aprovados. Uma solicitação de acesso é registrada; administradores podem aprovar ou recusar. A aprovação é registrada por usuário e canal, até que a política mude ou que o estado seja alterado.
- Entrar na comunidade e entrar na reunião são permissões distintas. Um link de convite **não** ignora a aprovação da reunião.
- Solicitações de entrada em comunidades sujeitas a aprovação e em reuniões geram notificações na central dos administradores e alertas push quando autorizados. O tipo pode ser desligado em **Notificações > Ajustes > Solicitações das comunidades e reuniões**.
- Os endpoints validam autenticação, papel do usuário, bloqueios/banimentos aplicáveis, política de entrada e acesso ao canal.

## Infraestrutura e validação
A API Fastify reutiliza a sinalização e sessões WebRTC existentes (Neon PostgreSQL). As migrações versionadas `0030` e `0031` incluem tipo de canal, política de admissão, fila de aprovações e preferência push. Não aplicá-las em produção antes de validar CI, Render, Cloudflare e a migração em uma branch Neon isolada.

**Limitações:** WebRTC P2P depende da conectividade de rede; relay TURN e permissões de câmera precisam ser testados em aparelhos iOS/Android e em redes diferentes. O PWA instalado pode ter limitações de captura em segundo plano.
