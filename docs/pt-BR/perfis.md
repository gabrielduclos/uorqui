# Perfis de usuário — Uorqui

## Escopo do MVP

Os perfis usam o login existente (Better Auth), o PostgreSQL Neon e as tabelas `users` e `profiles`. A implementação adiciona edição autenticada, página pública em `/@usuario`, pesquisa de pessoas e controle de visibilidade.

### Meu perfil
- Nome exibido, @usuário (3–32 caracteres, minúsculas, único), biografia (até 500 caracteres).
- Foto de perfil e capa via URL **HTTPS**. Upload direto disponível com Cloudflare R2, recorte e compressão no navegador.
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


## Upload de fotos e Cloudflare R2

- Bucket novo e privado: `uorqui-profile-media`; não reutilizar `uorqui-media` ou `uorqui-chat-media`.
- Binding do Worker: `PROFILE_MEDIA`; as rotas `/api/media/profile/avatar` e `/api/media/profile/cover` recebem POST com arquivo processado (WebP/JPEG/PNG, até 3 MB) ou DELETE para remover.
- O editor de recorte no navegador salva avatar 640×640 e capa 1440×480, priorizando WebP.
- A validação de sessão e a escrita do perfil continuam no Fastify/Neon, usando somente referências. Arquivos ficam no R2.
- Leitura `/media/profile/{id}/{avatar|cover}/{asset}.{ext}` feita pelo Worker: consulta a API para confirmar que a imagem é a atual e que o perfil é público ou pertence à sessão autorizada.
- Não habilitar domínio público do R2, acesso direto ao bucket nem cache público. Ao substituir/remover, URLs anteriores são invalidadas.
- A configuração R2 exige vínculo no Cloudflare Worker em produção. A interface deve informar erros quando indisponível.
- Links HTTPS externos antigos ainda são aceitos pela API para compatibilidade com perfis existentes.


### Cache das imagens durante a sessão

Avatares e capas no R2 privado são reutilizados em **cache limitado na memória da aba** (até 48 imagens, com verificação de expiração em 5 minutos). Isso reduz downloads repetidos e evita fotos piscando ao navegar por conversas, busca e perfis. O cache **não** é persistido em Cache Storage, IndexedDB, localStorage ou CDN público. Cada acesso de rede continua sendo autorizado pelo Worker com cabeçalhos HTTP `no-store`. O cache é limpo ao sair da conta, substituir/remover imagens ou alterar a visibilidade do próprio perfil. Esta regra vale para fotos de perfil e capa; anexos do futuro chat real terão política específica.

## Próximas melhorias
Moderação de imagens, segurança de links externos antigos e integração real do botão Conversar ao sistema de mensagens.
