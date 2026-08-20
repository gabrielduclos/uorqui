# Arquitetura Uorqui 1.1.0

```text
Browser
  |
  v
Cloudflare Worker: uorqui-api
  |-- Static Assets (React/Vite)
  |-- /api/* -> Worker API
  |       |-- Firebase Auth token validation
  |       |-- Firestore REST
  |       |-- R2 MEDIA
  |       `-- Cron
  |
  `-- SPA fallback -> index.html
```

O frontend nunca recebe a Service Account. Os Secrets permanecem exclusivamente
nas variáveis secretas do Worker.
