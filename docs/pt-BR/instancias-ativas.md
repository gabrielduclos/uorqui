# Instâncias ativas do aplicativo (beta.20)

O Uorqui permite **uma aba desktop** e **uma instância mobile (navegador/PWA)** por conta, simultaneamente. O limite não revoga sessões Better Auth, altera permissões push nem substitui autorização da API.

## Inicialização e reabertura

- A posse da instância é confirmada atrás do `StartupSplash` original, antes de montar chats, chamadas e conexões SSE.
- **Mesmo navegador ou PWA instalado:** um UUID aleatório de instância é salvo no `localStorage` por conta e categoria. Recarregar ou reabrir reutiliza o identificador e renova a reserva existente de 60 segundos no PostgreSQL, sem interpretar o próprio navegador como outra sessão.
- **Segunda aba aberta:** um Web Lock exclusivo por origem/conta/categoria impede duas páginas de usarem a mesma identidade. A segunda recebe **Uorqui já está aberto** e pode selecionar **Usar nesta aba** para tomar o bloqueio e a vaga do servidor. A anterior suspende o aplicativo, mas não sai da conta.
- **Outro navegador/dispositivo:** a reserva do PostgreSQL mantém uma identidade ativa por categoria. Desktop e mobile podem coexistir. Um conflito real exige transferência explícita ou expiração de 60 segundos.
- **Erros:** falhas de conexão exibem **Tentar novamente**, sem montar o aplicativo. Navegadores sem Web Locks usam uma sondagem via BroadcastChannel como alternativa aproximada. Com todo armazenamento local bloqueado, não é possível preservar a identidade após reiniciar.

## Ciclo de vida e arquitetura

- A migração anterior `apps/api/drizzle/0043_app_instance_leases.sql` guarda uma reserva por `(user_id,kind)`. `POST /api/v1/instances/claim` renova ou transfere a posse atomicamente. Somente o documento ativo chama `/release` ao sair da conta.
- O cliente utiliza **dois identificadores**: um UUID persistente do navegador/PWA e outro UUID temporário exclusivo do documento. O segundo distingue até abas duplicadas/clonadas no BroadcastChannel, embora compartilhem cookies e a mesma identidade de instalação.
- O Web Lock é liberado ao fechar a aba. `pagehide` suspende o aplicativo e o bloqueio local, sem liberar a reserva no banco, pois a liberação antiga poderia chegar após uma nova abertura e apagar a reserva nova. `pageshow` valida novamente. Eventos de foco e heartbeat não duplicam a checagem inicial.
- O BroadcastChannel notifica transferências entre abas da mesma origem; o SSE `instance-lease` existente avisa outros navegadores, com verificação a cada 15 segundos como fallback. Abas bloqueadas não montam chats e conexões.
- A classificação desktop/mobile usa o agente do navegador (incluindo iPadOS), não a largura da tela. É uma medida de interface e concorrência, **não uma garantia contra clientes adulterados**.
- Na primeira atualização da beta.19, pode existir uma reserva antiga com UUID temporário por até 60 segundos. Se acontecer, pressione **Usar nesta aba** uma única vez; o identificador persistido evita a repetição.

## Validação

Executar `node --import tsx --test apps/web/test/app-instance-identity.test.mjs`, integração com PostgreSQL temporário, TypeScript/build e os quatro workflows de CI. Validar manualmente: recarregar a aba desktop, fechar/abrir navegador, fechar/abrir PWA iOS/Android, duplicar aba, segundo navegador, transferência, desktop + celular, retorno de hibernação/BFCache e desmontagem de chamadas de voz. A beta.20 não requer outra migração. Confirmar publicação Cloudflare/Render separadamente.
