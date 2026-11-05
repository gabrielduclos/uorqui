# Uorqui — reinício independente

Esta branch é uma aplicação nova para comunicação empresarial. O Uorqui anterior (API, mensagens, comunidades, autenticação e dados) não foi importado.

## Template solicitado

O alvo é o **Sprintrix original**, do Shadcn Studio: https://shadcnstudio.com/templates/admin-dashboard/sprintrix

A demo pública não fornece os arquivos do template premium. Portanto, **o template exato ainda não foi instalado**. Assim que o pacote-fonte licenciado estiver disponível, seus componentes e estilos serão a fonte de verdade. Não é uma recriação aproximada.

## Desenvolvimento

```sh
cd apps/web
npm install
npm run dev
```

Estrutura inicial: Next.js 16, React 19, TypeScript, Tailwind CSS 4.

O preview temporário usa Next static export e Cloudflare Worker Previews. Não aponta à API de produção e não tem login funcional.
