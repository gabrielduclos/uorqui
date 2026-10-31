import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://127.0.0.1:3001',
      '/health': 'http://127.0.0.1:3001',
    },
  },
});
