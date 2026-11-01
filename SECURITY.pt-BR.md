# Política de segurança

[Português (Brasil)](SECURITY.pt-BR.md) · [English](SECURITY.md)

## Estado do projeto

O novo Uorqui está na versão **`0.1.0-beta.1` (beta técnico)**. O PWA, a API Fastify e o banco Neon já foram publicados para testes controlados, mas ainda não existe certificação independente de segurança ou validação completa em celulares. O mensageiro empresarial antigo é separado e não está coberto por esta política.

## Como relatar vulnerabilidades

**Não divulgue vulnerabilidades, provas de conceito, informações pessoais ou credenciais em issues e pull requests públicos.**

Se o relatório privado de vulnerabilidades estiver habilitado no GitHub, use **Security → Report a vulnerability**. Caso contrário, procure um canal de contato privado fornecido explicitamente pelos mantenedores. Se não houver canal privado disponível, não publique detalhes sensíveis numa discussão pública.

O responsável deve avaliar o relato antes de divulgar detalhes técnicos. Prazos de resposta e versões suportadas **ainda não foram definidos**; este documento será atualizado quando houver um processo estabelecido.

## Requisitos para futuras implementações

- Verificar permissões no servidor, inclusive para comunidades/canais privados, publicações, mídias e notificações.
- Aplicar validação, proteção contra abuso, limites de requisições e uploads seguros.
- Manter chaves, tokens e credenciais fora do repositório.
- Proteger tráfego com TLS e definir logs, backups e retenção de dados.
- Não alegar criptografia ponta a ponta sem implementação revisada.
- Manter descobertas sensíveis fora de issues públicas até uma divulgação coordenada.

## Abrangência

Esta política se aplica ao código e à documentação **deste repositório**. Problemas em outros produtos, sistemas ou domínios devem ser encaminhados aos respectivos operadores.
