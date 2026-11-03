# Roadmap e critérios de avanço

[Português](roadmap.md) · [English](../en/roadmap.md)

**Status:** roadmap do **beta técnico `0.1.0-beta.1`** e da mudança de direção aprovada em **02/11/2026**. Itens marcados indicam implementação ou teste CI, não publicação comprovada nem validação em aparelhos reais. O feed global foi aposentado em 02/11/2026; **Descobrir já está implementado**, com testes reais ainda pendentes. Ver [decisão](descobrir.md) e [auditoria](auditoria-manutencao.md).

## Fase 0 — Descoberta e fundação

- [x] Repositório público criado com licença MIT.
- [x] Documentação inicial de produto e tecnologia em dois idiomas.
- [ ] Realizar descoberta com usuários de comunidades interessadas e documentar requisitos validados.
- [ ] Verificar estratégia de marca e isolamento do domínio em produção do legado.
- [x] Definir stack principal: React, TypeScript, Tailwind CSS, Node.js, Fastify, PostgreSQL na Neon e Drizzle.
- [x] Escolher Cloudflare Workers Static Assets para o front-end e preparar Wrangler, SPA e proxy separado da API.
- [x] Integrar Worker `main` com o repositório no Cloudflare Builds, ajustar root `/apps/web`, build `npm run build` e deploy `npx wrangler deploy`; transferir o build/deploy web do GitHub Actions para a Cloudflare.
- [x] Preparar API Fastify para hospedagem externa com bind de rede em produção, Blueprint Render opcional e segredos não versionados.
- [x] Mostrar aviso de API indisponível na interface web até a conexão estar pronta.
- [x] Publicar API Render `uorqui-social-api`, conectar Neon e configurar `API_ORIGIN` no Worker, com health pronto.
- [ ] Definir teto de orçamento, design, privacidade e fornecedores restantes de tempo real/voz/mídias.
- [x] Publicar a estrutura inicial de desenvolvimento React/Tailwind, Fastify e Drizzle.
- [x] Criar e verificar PostgreSQL na Neon para desenvolvimento.
- [x] Validar tipagem e compilação da estrutura inicial pelo GitHub Actions.
- [x] Gerar e versionar SQL inicial e snapshot de migração do Drizzle.
- [x] Testar tabelas, enums, chaves estrangeiras e índices em branch temporária da Neon.
- [x] Aplicar primeira migração na branch Neon `main`; verificar seis tabelas, chaves, índices e histórico do Drizzle.
- [x] Escolher Better Auth, implementar fluxos Fastify/React e versionar migração 0001.
- [x] Testar migração de autenticação em branch temporária Neon e passar pelo CI de tipagem/build/schema.
- [x] Validar cadastro, sessão, perfil, proteção contra duplicidade e logout em teste real com PostgreSQL temporário no GitHub Actions.
- [x] Validar o proxy Cloudflare Worker → Fastify → PostgreSQL em ambiente temporário, incluindo cookies, onboarding e logout.
- [x] Adicionar endpoint `/health/ready`, exigindo tanto autenticação configurada quanto schema do banco pronto antes de habilitar o login.
- [x] Aplicar migração 0001 na Neon main e verificar dez tabelas, dois registros Drizzle e limpeza da branch de teste.
- [x] Configurar segredos privados e validar health, status e bloqueio de sessão anônima na Neon main (login de uma conta real ainda pendente).
- [x] Versionar fluxos de e-mail, recuperação, verificação Turnstile e interface de cadastro/boas-vindas seguindo padrões globais.
- [x] Configurar Resend e Turnstile, habilitar `ENABLE_PUBLIC_SIGNUP=true` e passar testes públicos de saúde/bloqueio anti-bot sem criação de contas.
- [ ] Validar cadastro humano completo, entrega/confirmação do e-mail, login e recuperação de senha com Resend.

**Critério:** interesse real de comunidades-piloto, escopo e limites operacionais definidos.

## v0.1 — Base social

- [x] Implementar cadastro/login, perfis, descoberta e seguidores (a confirmação humana de e-mail continua pendente).
- [x] Implementar mensagens 1:1 persistidas, mídias, status e reconexão SSE; validar estabilidade real em campo.
- [x] Implementar comunidades, acesso público/privado, convites, cargos e canais de texto.
- [x] Implementar denúncias iniciais, bloqueios, limites e autorização no servidor; falta validar operação da moderação.

**Critério:** fluxos confiáveis no celular, com conteúdo privado protegido.

## v0.2 — Voz em comunidades

- [x] Implementar entrada/saída da voz, mute e lista de participantes.
- [x] Implementar permissões, sinalização WebRTC, tolerância de sessão e limites para salas pequenas; validar TURN e reconexão mobile.
- [ ] Testar em desktop, Android navegador/PWA e iOS navegador/PWA.

**Critério:** voz estável em grupos pequenos e custos mensuráveis.

## v0.3 — Histórico do beta: feed híbrido (legado)

- [x] Implementar feed híbrido com texto, imagens, carrosséis e vídeos — **já existente, mas fora da visão futura**.
- [x] Implementar navegação imersiva por vídeos — **entrega histórica, agora aposentada**.

Esses itens documentam entregas passadas, **não** a próxima prioridade de desenvolvimento.

## Etapa entregue — Descobrir (antes do piloto)

- [x] Substituir a tela inicial do feed por **Descobrir**, com busca e recomendações de comunidades públicas (código na `main`; validação de deploy pendente).
- [x] Mostrar atividades recentes e salas de voz ativas **das comunidades do usuário**, com contagens fundamentadas e autorização no servidor.
- [x] Acesso direto ao canal/sala correto sem entrar automaticamente em chamada, marcar como lido ou expor conteúdo privado.
- [x] Implementar estado vazio para contas sem comunidades, sem listas artificiais de posts/atividade (validação manual pendente).
- [x] Ajustar a navegação, onboarding, perfil público, busca e textos da nova tela em PT-BR/EN, usando os tokens Light/Dark (auditoria acessibilidade/dispositivos pendente).
- [x] Tratar links antigos de publicações nas mensagens sem abrir uma tela inexistente e remover o compartilhamento do feed sem uso (03/11).
- [ ] Concluir auditoria de notificações e deep links nos PWAs instalados.
- [x] Aposentar navegação do feed global, criação de posts, modo vídeos e API/schema antigos (02/11; snapshots Neon e mídias R2 preservados conforme documentação).
- [x] Registrar migrações históricas, backups e escopo inicial da limpeza na auditoria de manutenção.
- [ ] Concluir política de retenção/exportação e testes de aceitação no desktop, Android e iOS/PWA.
- [ ] Testar a nova jornada **comunidade recomendada → ingresso → canal/voz → mensagem individual** com usuários reais.

**Critério:** Descobrir é útil mesmo sem comunidades inscritas e respeita privacidade, atividade real e participação efetiva.

## v0.4 — Piloto

- [ ] Validar a experiência com comunidades-piloto convidadas.
- [ ] Medir estabilidade técnica, acessibilidade, moderação e desempenho.
- [ ] Corrigir problemas de usabilidade e priorizar ajustes conforme retorno do piloto.

**Critério:** fluxos estáveis, moderação responsável e desempenho operacional aceitável.

## v1.0 — Preparação para versão pública estável

- [ ] Testes, CI/CD, métricas, backups, restauração e rollback.
- [ ] Acessibilidade, política de privacidade, termos, moderação e proteção conforme faixa etária.
- [ ] Revisão de segurança, governança de colaboradores e deploy documentado.
- [ ] Capacidade e suporte definidos antes de ampliar acesso.

**Não lançar amplamente** com vazamento de conteúdo privado, perda silenciosa de mensagens, falta de moderação ou custos de mídia sem limite.

## Decisões pendentes

Prioridades, licenças de dependências, custos e cotas, política de retenção dos backups do feed legado, processo de moderação, qualidade do TURN e validação do PWA/domínio. SSE, WebRTC e R2 já têm implementação inicial.

### Comunidades (trabalho incremental)

- [x] Persistência e regras de visibilidade de comunidades públicas, por aprovação e privadas
- [x] Criação, descoberta, membros, convites, aprovação e saída (exceto proprietário)
- [x] Canais de texto e salas de voz persistidos; texto real para membros
- [x] Base WebRTC de áudio em grupos de até 6 (mesh), com presença, sinalização, microfone/mute/saída e integração TURN opcional no backend
- [ ] Configurar credenciais de TURN no ambiente de produção e validar áudio entre redes móveis/Wi-Fi, Safari e Samsung Internet
- [ ] Evolução para SFU quando grupos excederem a escala da malha P2P
- [x] Moderação inicial: cargos hierárquicos, remoção e banimento, edição/cancelamento de mensagens, gerenciamento de canais
- [ ] Ampliar denúncias para apelações, trilha completa, antispam e permissões específicas por canal
- [x] Anexos no canal usando R2; continuar otimizando mídia e custos
- [x] Implementar PWA e Web Push para canais; validar entrega em iOS/Android instalados
- [x] Reuniões com câmera, tela compartilhada, detecção da fala, modo tela cheia e miniatura da câmera própria; chat de texto começa recolhido
- [x] Edição de nome/senha no cabeçalho de canais de texto, voz e reunião; solicitação de comunidade atualizada por SSE direcionado ao usuário aprovado
- [ ] Testar reunião real com duas ou mais pessoas, diferentes navegadores/redes, compartilhamento de tela e modo tela cheia
