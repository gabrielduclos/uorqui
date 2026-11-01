# Notas de versão

O novo Uorqui utiliza [versionamento semântico](https://semver.org/lang/pt-BR/) nos manifestos da aplicação. O sufixo `-beta.N` indica **pré-lançamento** e não uma versão estável ou liberada para todos.

## [0.1.0-beta.1] — 01/11/2026

**Primeiro beta técnico para testes controlados.** Este documento descreve código implementado e testes automatizados, **não** uma certificação em todos os navegadores e dispositivos.

### Incluído

- Nova rede social open source em React/TypeScript, com interface inspirada no UIKit, temas claro e escuro.
- Autenticação Better Auth com e-mail/senha, perfis, privacidade e bloqueios; cadastro público com proteção Turnstile e integração de e-mail.
- Mensageiro individual 1:1 com persistência, anexos, respostas, reações, estados de mensagens, atualizações SSE e suporte a Web Push.
- Feed híbrido contínuo e navegação dedicada por vídeos.
- Comunidades com convites, cargos, canais de texto, moderação e salas WebRTC, incluindo chamada minimizável.
- Frontend Cloudflare Worker/R2; API Fastify no Render; PostgreSQL Neon; testes automáticos de interface, API e integração.
- Preparação para migração de domínio, lista de origens autorizadas e substituição do service worker em PWAs instalados.

### Pendências e limitações

- Validar **com uma conta real** envio/recebimento de e-mail, confirmação e recuperação de senha.
- A substituição do PWA, notificações e ícone **não está garantida** para todos os aparelhos, especialmente iPhone.
- Voz entre redes diferentes pode precisar de TURN; iOS limita execução e microfone em segundo plano.
- Só considerar `uorqui.app` migrado depois de verificar o roteamento Cloudflare.
- Não há migração automática das contas, mensagens, push ou dados do Uorqui Chat empresarial.
- Antes de ampliar o beta: monitoramento, backups e restauração, testes de acessibilidade/segurança, operação de moderação e custos.

### Deploy e reversão

Siga o [procedimento de migração do domínio](docs/pt-BR/migracao-dominio-uorqui-app.md). A versão exige build e testes GitHub Actions. Não reutilizar credenciais ou dados do mensageiro empresarial legado.

> Alterar a versão e criar estas notas **não publica automaticamente** uma tag nem uma GitHub Release. A prerelease pode ser publicada depois de selecionar um commit validado.
