# Uorqui — plano de preservação de contas na reconstrução

**Decisão registrada em 23/11/2026. Status: plano, não migração executada.**

## Objetivo e escopo

Reconstruir o produto Uorqui do zero, sem reutilizar obrigatoriamente o UI Kit, componentes, módulos de comunidades, mensagens, e-mail ou reuniões atuais. **O único requisito de continuidade é preservar a identidade e a capacidade de acesso dos usuários já cadastrados.**

Prioridades distintas:
1. **Obrigatório:** ninguém precisar criar outra conta ou escolher outra senha; manter endereço de e-mail, @username e identidade.
2. **Desejável, mas não garantido:** quem estiver com a sessão ativa continuar autenticado sem precisar entrar novamente.
3. **Fora do escopo desta preservação:** migração de mensagens, comunidades, e-mails conectados, notificações e arquivos de outros módulos.

O repositório e o banco antigos devem continuar preservados até que a nova versão seja validada. Não alterar o serviço de produção, não excluir o banco antigo e não colocar credenciais ou dados pessoais no GitHub.

## O que o código atual comprova

**Repositório:** `gabrielduclos/uorqui` (não confundir com o independente `gabrielduclos/uorqui-chat`).

O Uorqui usa **Better Auth + adaptador Drizzle para PostgreSQL**. A identidade não é uma tabela única: há tabelas de autenticação e tabelas do perfil do produto.

| Tabela atual | Função | Migração para a nova versão |
| --- | --- | --- |
| `public.user` | ID UUID da conta Better Auth, e-mail, nome, verificação de e-mail | **Essencial** |
| `public.account` | Credencial de login (hash da senha em `password`) e dados de provedor de autenticação | **Essencial**; preservar o hash sem reescrever a senha |
| `public.users` | Perfil social vinculado ao mesmo UUID, @handle e datas | **Essencial para manter os @usernames** |
| `public.profiles` | Nome de exibição e preferências de visibilidade; pode referenciar mídia antiga | **Recomendado**, selecionando campos úteis para o novo produto |
| `public.session` | Sessões Better Auth, token e expiração | **Condicional**, necessária se quiser tentar manter sessões existentes |
| `public.verification` | Tokens temporários de verificação/recuperação | Avaliar de forma separada; não é necessária para conservar contas já verificadas |

O vínculo de identidade é `user.id = users.id = profiles.user_id` para perfis completos. O fluxo de onboarding antigo cria `users` e `profiles` com o mesmo ID fornecido pelo Better Auth. Não regenerar IDs na migração, para não perder os relacionamentos ou provocar perfis duplicados.

**Referências do código:**
- `apps/api/src/db/auth-schema.ts`
- `apps/api/src/db/schema.ts`
- `apps/api/src/auth/auth.ts`
- `apps/api/src/auth/auth-policy.ts`
- `apps/api/src/server.ts` (onboarding, `/api/auth/*`, `/api/v1/me`)

## Como preservar contas e senhas

1. **Recuperar acesso de leitura ao Neon antigo.** Em 23/11/2026 o projeto antigo `uorqui` atingiu a cota de computação; uma tentativa de consulta retornou HTTP 402. Portanto **não existe backup exportado nem migração concluída** neste momento. O período de cota informado termina em **01/12/2026 às 00:00 UTC**. Uma recuperação anterior dependerá das opções oferecidas pelo Neon.
2. **Gerar um backup privado consistente**, preferencialmente com `pg_dump` (conexão direta/não pooled). Guardar o arquivo fora do repositório e sob acesso restrito; testar integridade e capacidade de restauração. Não publicar exportações SQL, CSV com usuários ou tokens, hashes de senha, URLs de conexão ou segredos.
3. **Construir a autenticação nova isoladamente**, inicialmente com a mesma tecnologia e o mesmo esquema de contas Better Auth. Se trocar a biblioteca/algoritmo de senha, exige-se um plano explícito de compatibilidade dos hashes antes do corte; sem isso não se pode prometer reutilização das senhas.
4. **Migrar somente o subconjunto de identidade** listado acima, respeitando chaves e dependências, em banco de homologação. O plano exato de restauração deve ser validado conforme o esquema real do backup. Não executar `pg_restore` indiscriminadamente sobre a nova aplicação já em produção.
5. **Validar com contas reais de teste e casos autorizados**: login com a senha antiga, conta verificada/não verificada, @username mantido, perfil vinculado ao UUID correto, login duplicado, recuperação de senha e desativação de sessão.
6. **Preparar o corte para o banco novo** com janela controlada, plano de retorno e teste de saúde. Só trocar a `DATABASE_URL` depois de verificar as credenciais e relações; nunca apagar a origem antes de confirmar a restauração.

## Sessão já aberta: quando pode continuar funcionando?

Reutilizar contas **não é o mesmo** que manter os usuários conectados. Para a continuidade *sem tela de login*, é necessário verificar conjuntamente:

- domínio e origem do site (`uorqui.app`), HTTPS e caminhos dos endpoints de autenticação;
- compatibilidade de versão e política do Better Auth, nome/atributos dos cookies, regras de sessão e eventuais segredos usados para assiná-los;
- registros `session` válidos migrados com seus IDs, tokens e expirações, sem expor os tokens;
- sequência de corte de tráfego e invalidação/limpeza dos caches antigos.

O código atual configura `session.expiresIn = 7 dias` e `updateAge = 1 dia`. Se o projeto só migrar semanas depois, as sessões atuais **podem expirar naturalmente**. **Não prometer login invisível**: o resultado mais seguro e realista é que o usuário talvez precise fazer login uma vez com **a senha de sempre**, **sem se cadastrar novamente**. Nunca forçar reaproveitamento inseguro de sessões se houver incompatibilidade.

## Condições para dizer que a preservação deu certo

- Quantidade de contas e distribuição de IDs conferidas entre origem e destino.
- E-mail, status de verificação e identidade do usuário preservados.
- Hash de senha migrado sem qualquer exposição/alteração e autenticação validada.
- @username mantido, sem colisão, com perfil associado corretamente.
- Dados de teste e usuários de outros projetos (especialmente `uorqui-chat` e `arqvo`) isolados.
- Sessões preservadas apenas se teste seguro comprovar compatibilidade; caso contrário, exigir novo login, nunca novo cadastro.
- Banco antigo e backup retidos até o aceite final; segredos, hashes e dados pessoais não armazenados em issues, código ou documentação pública.

## Restrições operacionais e próximo passo

Esta documentação é apenas o **contrato de migração de contas**, não uma cópia dos usuários. A fonte de dados permanece no Neon antigo, indisponível por cota. Enquanto estiver bloqueado, podemos desenvolver o novo projeto do zero e testar a autenticação com usuários fictícios, mas não anunciar que as contas reais foram restauradas.

**Não implementar nesta etapa** reuso da UI, sistema de mensagens diretas ou qualquer outro módulo antigo; a reconstrução funcional será especificada separadamente.
