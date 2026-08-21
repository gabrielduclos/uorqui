# Uorqui 1.2.0

## Comunidades mais rápidas
- Ao entrar em uma comunidade, o frontend usa imediatamente os posts já recebidos no bootstrap.
- A atualização da comunidade ocorre em segundo plano.
- A lista de membros só é buscada quando o usuário abre a tela de membros.
- Administradores recebem no bootstrap os posts das comunidades da empresa que podem moderar.

## Resolução
- Posts e perguntas podem ser marcados como **Resolvido**.
- Autor pode resolver/reabrir a própria publicação.
- Administrador pode resolver/reabrir publicações privadas da empresa.
- Marcar uma resposta como solução também resolve a pergunta.

## Enquetes
- Novo tipo de publicação `Enquete`.
- De 2 a 6 opções.
- Um voto por usuário, com possibilidade de trocar o voto.
- Percentual e total de votos aparecem no próprio post.

## Eventos + agenda
- Novo tipo de publicação `Evento`.
- Título, início, término opcional, local/link e descrição.
- Botão **Google Agenda**.
- Botão **Adicionar à agenda** gera arquivo `.ics`, compatível com Apple Calendar, Outlook e outros calendários.

## Compartilhar
- O botão Compartilhar agora gera um permalink real da publicação.
- No celular usa o compartilhamento nativo quando disponível.
- Em outros navegadores copia o link ou oferece o link para copiar.
- Links de posts privados continuam exigindo login e autorização.

## Uorqui Free / Premium
- Plano é por empresa.
- Free mantém todas as funcionalidades até 5 membros e 2 comunidades.
- Premium remove esses dois limites.
- Backend bloqueia o sexto membro e a terceira comunidade em empresas Free.
- Tela Empresas mostra plano e consumo de cada empresa.

## Cobrança Asaas
- Checkout hospedado com Pix e cartão.
- Preço inicial configurável em `PREMIUM_MONTHLY_PRICE_BRL` (padrão R$ 49,90/mês).
- Premium é ativado por webhook, nunca pelo redirect do navegador.
- Webhook é idempotente e protegido por `ASAAS_WEBHOOK_TOKEN`.
- Consulte `BILLING-ASAAS.md`.

## Deploy
Esta versão altera React, Worker e configuração de variáveis. Preserve `public/firebase-config.js`. Configure Asaas primeiro no Sandbox.
