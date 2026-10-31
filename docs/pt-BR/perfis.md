# Perfis de usuário — Uorqui

## Escopo do MVP

Os perfis usam o login existente (Better Auth), o PostgreSQL Neon e as tabelas `users` e `profiles`. A implementação adiciona edição autenticada, página pública em `/@usuario`, pesquisa de pessoas e controle de visibilidade.

### Meu perfil
- Nome exibido, @usuário (3–32 caracteres, minúsculas, único), biografia (até 500 caracteres).
- Foto de perfil e capa via URL **HTTPS**. Upload binário nativo ainda não está disponível e deverá usar armazenamento dedicado.
- Botão Perfil público: desativar oculta a pessoa das pesquisas e retorna 404 na rota pública. O proprietário mantém acesso privado em Meu perfil.
- Atualizações validadas no servidor, em transação SQL; não aceitar campos arbitrários.

### Perfil público
- URL: `/@usuario`, acessível mesmo sem login.
- Mostra nome, @, bio, foto/capa públicas e data de cadastro.
- Nunca retorna e-mail ou dados de autenticação.
- Botão de conversa desabilitado até o chat real; feed público ainda em desenvolvimento.

### Busca
- `GET /api/v1/profiles/search?q=termo`, mínimo de 2 caracteres, no máximo 15 resultados, exclusivamente públicos.
- Abre a página pública da pessoa encontrada.

## API
| Método | Rota | Segurança |
| --- | --- | --- |
| GET | `/api/v1/me` | Sessão obrigatória, inclui perfil privado do proprietário |
| PATCH | `/api/v1/me/profile` | Sessão obrigatória, validação e controle do proprietário |
| GET | `/api/v1/profiles/:handle` | Somente perfil público |
| GET | `/api/v1/profiles/search?q=` | Somente perfis públicos, sem e-mail |

## Banco e implantação
Migração Drizzle `0002_profile_visibility_media` adiciona `avatar_url`, `cover_url` e `is_public` (padrão TRUE). Rodar primeiro no banco, então publicar a API e o frontend, evitando erros por coluna ausente. O UI Kit continua somente na documentação.

## Próximas melhorias
Upload de foto/capa com tratamento e hospedagem no R2 (ou storage equivalente), compressão, moderação, segurança de links externos e integração real do botão Conversar ao sistema de mensagens.
