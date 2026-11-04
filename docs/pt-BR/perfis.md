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

Avatares e capas no R2 privado são compartilhados em **cache em memória** (até 48 imagens, com expiração por inatividade em 30 minutos) e em um **IndexedDB local por conta autenticada**, limitado a **64 itens, 24 MiB e 24 horas**. Assim, no *cold start* o aplicativo pode reutilizar fotos já autorizadas, sem repetir todos os downloads nem deixar o avatar piscar em cada tela. O IndexedDB é consultado **somente após a autenticação da conta**. Imagens novas continuam passando pela autorização do Worker, com `Cache-Control: private, no-store`; não há cache no Service Worker, Cache Storage nem CDN público. Fotos com URL alterada são baixadas novamente. Logout limpa a memória e o IndexedDB, e alterações de bloqueio, amizades ou visibilidade invalidam o cache por segurança. Se IndexedDB estiver indisponível, o carregamento por rede continua funcionando. A regra se aplica exclusivamente a fotos de perfil e capa; mídias privadas de mensagens continuam em cache temporário na memória da aba.

## Próximas melhorias
Moderação de imagens, segurança de links externos antigos e integração real do botão Conversar ao sistema de mensagens.
