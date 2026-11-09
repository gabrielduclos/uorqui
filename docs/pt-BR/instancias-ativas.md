# Instâncias ativas do aplicativo (beta.18)

O Uorqui permite **uma aba/janela desktop ativa** e **uma instância mobile (navegador/PWA) ativa** por conta, simultaneamente. Isso reduz conexões SSE, sincronizações e mídias duplicadas sem encerrar a sessão de login do Better Auth. Mesmo que abas compartilhem cookies, são instâncias independentes.

## Experiência

- **Inicialização (beta.19):** após recuperar a sessão, a confirmação da vaga ocorre por trás do `StartupSplash` original. A mesma tela inicial permanece até resolver a posse; não mostrar uma tela intermediária **Verificando instância ativa…**. Enquanto a posse não for confirmada, não montar o aplicativo.
- A segunda aba da mesma categoria não monta o aplicativo e mostra a mensagem **Uorqui já está aberto**, com a ação **Usar nesta aba**.
- O botão **Usar nesta aba** assume a vaga explicitamente. A instância anterior suspende a interface, encerrando suas assinaturas e conexões ao desmontar; **não perde o login** e pode reassumir depois. Existe também **Sair da conta**.
- Falhas de comunicação exibem **Tentar novamente**, não um bloqueio falso por outra aba. Falhas repetidas na renovação suspendem a interface até confirmar a posse. Abrir uma instância mobile não derruba a desktop e vice-versa.
- Abrir outra aba **não expulsa automaticamente** a primeira. A vaga expira após 60 segundos sem renovação, permitindo recuperar o acesso depois de fechar ou travar a aba.

## Arquitetura, migração e limites

- A migração aditiva `apps/api/drizzle/0043_app_instance_leases.sql` cria `app_instance_leases` no PostgreSQL, com chave `(user_id,kind)`. **Aplique a migração antes de considerar o bloqueio ativo no ambiente publicado**. Durante deploy escalonado, se faltar apenas essa tabela, a API retorna `active:true,managed:false` para não bloquear todas as contas; não há aplicação do limite até a migração.
- `POST /api/v1/instances/claim` exige usuário autenticado e Origin válido. Com `{kind,instanceId,takeover?}`, obtém/renova a vaga atomicamente ou responde HTTP 409 `INSTANCE_IN_USE`. Uma instância ativa renova a cada 15 segundos; somente o aceite explícito ou a expiração permite substituí-la. `POST /api/v1/instances/release` libera apenas a vaga correspondente ao ID durante o logout. IDs são UUIDs exclusivos por documento, não credenciais.
- `BroadcastChannel` entrega o bloqueio imediatamente entre abas da mesma origem. Outros navegadores são avisados por `instance-lease` no SSE autenticado existente. A verificação periódica continua como alternativa. Uma aba bloqueada não monta `SocialShell` nem assina as mensagens.
- A classificação mobile/desktop utiliza o user agent (incluindo iPadOS), e não a largura de tela. É um controle de interface e concorrência, **não substitui autorização de API nem é uma barreira de segurança contra clientes adulterados**. Login, cookies, conexões de e-mail e inscrições push permanecem inalterados.

## Testes

Executar `apps/api/test/app-instances.integration.test.mjs` com PostgreSQL temporário, build/typecheck web e CI. Em navegadores reais, testar duas abas desktop (inclusive **Duplicar aba**), duas janelas mobile/PWA, desktop + celular, navegadores diferentes, transferência durante chamada de voz, fechamento da aba, hibernação e retorno após falha de rede. A aplicação da migração no banco de produção e os deploys Render/Cloudflare devem ser verificados separadamente.
