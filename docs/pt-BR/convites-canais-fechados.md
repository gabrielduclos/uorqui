# Convites de acesso aos canais fechados

**Versão:** 0.1.0-beta.33 — 10/11/2026

## Comportamento

- Canais em modo **Fechado / restricted** usam links próprios de autorização; não reaproveitam convites gerais da comunidade.
- Apenas **dono, administradores e moderadores com acesso ao canal** podem criar os links.
- O link copiado é de **uso único**, válido por **24 horas**. Qualquer usuário autenticado que possua o link pode usá-lo antes de terceiros — compartilhe apenas com o convidado desejado.
- Ao enviar um convite pelo **@usuário** no chat privado, a API gera um novo link que só pode ser aceito **pelaquela conta específica** (vinculado ao ID, não apenas ao @).
- Abrir o link mostra uma confirmação. Entrar/criar uma conta ou apenas visualizar a prévia **não** concede nenhuma permissão.
- Após clicar em **Aceitar e entrar no canal**, o servidor registra em uma transação a participação na comunidade, a autorização para **aquele canal** e o consumo do convite.
- Links usados, expirados, revogados, de emissores banidos ou sem cargo/permissão válida deixam de funcionar.
- As regras de **senha de canal** e de **aprovação para sala de reunião** permanecem independentes. O convite não ignora essas verificações.

## Proteções técnicas

- O servidor gera **256 bits criptograficamente aleatórios** (`crypto.randomBytes(32)`).
- O banco guarda **apenas SHA-256 do segredo**; validade, emissor, destinatário opcional, canal, quem aceitou e data de resgate são auditáveis.
- O token fica no **fragmento (#)** do link e no `sessionStorage` durante o login, jamais nos caminhos/query strings da API nem nos logs HTTP usuais. O frontend remove o fragmento do endereço ao iniciar.
- `POST /api/v1/channel-invites/preview` e `/redeem` exigem autenticação, origem válida, validade, ausência de banimento, permissões atuais do emissor e vínculo ao destinatário (quando presente).
- `FOR UPDATE` na linha do convite impede dois aceites simultâneos; o registro de permissão e de uso é atômico.
- Máximo de **10 links ainda válidos e não utilizados por emissor/canal** para conter geração excessiva.
- O emissor pode **revogar o link não utilizado** no modal de convite.
- O usuário convidado nunca recebe acesso a outro canal fechado por esse link.

## Banco, implantação e testes

- Migração aditiva **`0044_restricted_channel_invites.sql`**.
- O banco **Neon main** recebeu a nova tabela e o histórico de migração em 10/11/2026; sem alterações ou exclusões de dados existentes.
- Testes estáticos de regressão: `apps/api/test/restricted-channel-invites.test.mjs` e `apps/web/test/restricted-invite-flow.test.mjs`; CI inclui typecheck e build.
- Testar ponta a ponta com contas reais (dono/moderador/convidado), convite já consumido, destinatário errado, banimento, expiração e canal com senha.
- O bloqueio de abuso da Cloudflare continua aplicado às rotas da API. Convidar não deve aumentar a quota global de mensagens ou fazer bypass do rate limiting.

**Reversão:** desfazer código do recurso não apaga a tabela; para desativar emissão e resgate imediatamente, desabilitar as rotas no backend. Não excluir a tabela de auditoria sem política de retenção.
