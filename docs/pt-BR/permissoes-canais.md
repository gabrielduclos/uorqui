# Permissões de acesso aos canais

**Implementação versionada em 03/11/2026.** A funcionalidade requer a migração Drizzle `0033_restricted_channel_members.sql` no PostgreSQL do ambiente de destino. Não declarar a função disponível em produção antes de confirmar migração, API, Worker e testes reais.

## Abertura do canal

O proprietário e os administradores podem configurar qualquer canal de **texto**, **voz** ou **reunião** como:

- **Aberto:** qualquer integrante autorizado da comunidade pode visualizar e acessar o canal, respeitando a eventual senha e a política de admissão da reunião.
- **Fechado por permissão:** o canal só aparece e funciona para proprietário/administradores e para membros individualmente autorizados. Não há acesso automático para o cargo de moderador.

O campo **Quem pode acessar** está na criação do canal, e a opção **Permissão de acesso** pode ser alterada posteriormente em **Editar canal**, no cabeçalho do canal. Canais existentes permanecem **abertos** após a migração.

Ao mudar um canal aberto para fechado, usuários sem autorização são removidos de sessões WebRTC ativas. Ao tornar um canal aberto novamente, os registros de permissões individuais daquele canal são zerados para que um fechamento futuro não herde acessos antigos.

## Liberação individual na moderação

Em **Comunidades → Moderação → Membros**, os administradores encontram **Acesso aos canais fechados** em cada membro comum ou moderador. Marcar um canal libera aquele membro; desmarcar revoga imediatamente. Proprietário e administradores sempre têm acesso e não exigem marcação. Apenas contas que já fazem parte da comunidade podem receber a permissão.

Ao remover/banir um participante ou quando ele sai voluntariamente, suas concessões são excluídas; entrar novamente não restaura privilégios antigos.

## Segurança e independência das regras

- **Participação na comunidade** é pré-requisito para qualquer canal.
- **Permissão individual** controla a visibilidade do canal fechado e o acesso ao conteúdo.
- **Senha do canal**, se configurada, continua obrigatória mesmo quando o membro recebeu a permissão individual.
- **Aprovação para reunião**, se ativada, continua obrigatória mesmo após a concessão de acesso ao canal.
- A API verifica essas condições em mensagens, reações, confirmação de leitura, anexos, presença, sinalização e sessões WebRTC. O Descobrir, os contadores de não lidas e as notificações push filtram canais para os quais a pessoa não tem permissão.
- Mudanças publicam evento SSE sem divulgar os identificadores dos canais fechados a membros não autorizados; as listas e os estados são recarregados com a autorização atual.
- Nenhuma permissão deve ser implementada apenas ocultando opções no React.

## Operação e testes

Aplicar a migração **0033** com o procedimento normal de Drizzle, primeiro em banco de testes ou branch isolada da Neon. Não alterar o banco de produção sem aprovação operacional e backup validado.

Cobertura automatizada: criação de canais fechados, concessão e revogação, filtragem da API e do Descobrir, independência de senha, remoção de concessões ao sair da comunidade, bloqueio de reuniões e expulsão de sessões WebRTC revogadas. Validar separadamente Android/iOS, dispositivos, sinalização em redes distintas e deploy real.
