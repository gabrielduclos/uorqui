# Roadmap e critérios de avanço

[Português](roadmap.md) · [English](../en/roadmap.md)

**Status:** marcos propostos, sem datas prometidas nem funcionalidades declaradas como prontas.

## Fase 0 — Descoberta e fundação

- [x] Repositório público criado com licença MIT.
- [x] Documentação inicial de produto e tecnologia em dois idiomas.
- [ ] Realizar descoberta com usuários de comunidades interessadas e documentar requisitos validados.
- [ ] Verificar estratégia de marca e isolamento do domínio em produção do legado.
- [x] Definir stack principal: React, TypeScript, Tailwind CSS, Node.js, Fastify, PostgreSQL na Neon e Drizzle.
- [x] Escolher Cloudflare Workers Static Assets para o front-end e preparar Wrangler, SPA e proxy separado da API.
- [x] Integrar Worker `main` com o repositório no Cloudflare Builds, ajustar root `/apps/web`, build `npm run build` e deploy `npx wrangler deploy`; transferir o build/deploy web do GitHub Actions para a Cloudflare.
- [ ] Escolher hospedagem da API, configurar `API_ORIGIN` e segredos de autenticação e validar front-end e backend antes de publicar.
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
- [x] Aplicar migração 0001 na Neon main e verificar dez tabelas, dois registros Drizzle e limpeza da branch de teste.
- [ ] Configurar segredos privados e validar a API/login diretamente com a Neon main.
- [ ] Implementar confirmação de e-mail, recuperação de senha e controles seguros antes de abrir acesso.

**Critério:** interesse real de comunidades-piloto, escopo e limites operacionais definidos.

## v0.1 — Base social

- [ ] Cadastro/login, perfis, descoberta e seguidores.
- [ ] Mensageiro 1:1 seguro com histórico, estados claros e reconexão.
- [ ] Comunidades, entrada pública/privada, cargos e canais de texto.
- [ ] Denúncias, bloqueio, limites e autorização no servidor.

**Critério:** fluxos confiáveis no celular, com conteúdo privado protegido.

## v0.2 — Voz em comunidades

- [ ] Entrar/sair da voz, mutar, visualizar participantes.
- [ ] Permissões, reconexão, moderação e limites operacionais.
- [ ] Testar em desktop, Android navegador/PWA e iOS navegador/PWA.

**Critério:** voz estável em grupos pequenos e custos mensuráveis.

## v0.3 — Descoberta híbrida

- [ ] Feed misto contínuo com textos, imagens, carrosséis e vídeos.
- [ ] Modo imersivo somente de vídeos, acesso direto e retorno coerente ao feed.
- [ ] Compartilhamento e descoberta de comunidades públicas, respeitando a privacidade.
- [ ] Cotas, processamento e carregamento adaptativo de vídeos; moderação.

**Critério:** pessoas reais podem testar a jornada conteúdo → comunidade.

## v0.4 — Piloto

- [ ] Validar a experiência com comunidades-piloto convidadas.
- [ ] Medir estabilidade técnica, acessibilidade, moderação e desempenho.
- [ ] Corrigir problemas de usabilidade e priorizar ajustes conforme retorno do piloto.

**Critério:** fluxos estáveis, moderação responsável e desempenho operacional aceitável.

## v1.0 — Preparação para beta público

- [ ] Testes, CI/CD, métricas, backups, restauração e rollback.
- [ ] Acessibilidade, política de privacidade, termos, moderação e proteção conforme faixa etária.
- [ ] Revisão de segurança, governança de colaboradores e deploy documentado.
- [ ] Capacidade e suporte definidos antes de ampliar acesso.

**Não lançar amplamente** com vazamento de conteúdo privado, perda silenciosa de mensagens, falta de moderação ou custos de mídia sem limite.

## Decisões pendentes

Prioridades, licenças de dependências, fornecedores de tempo real/voz/mídias, algoritmo do feed, moderação, nome do modo Vídeos, implantação e futura migração de domínio.
