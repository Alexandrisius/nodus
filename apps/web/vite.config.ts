import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// API и WebSocket доступны браузеру с того же origin:
// dev — прокси Vite, docker — прокси nginx (infra/nginx/web.conf).
export default defineConfig({
  plugins: [react()],
  server: {
    port: Number(process.env.NODUS_WEB_DEV_PORT ?? 5173),
    proxy: {
      '/api': {
        target: `http://localhost:${process.env.NODUS_API_PORT ?? 3001}`,
        changeOrigin: true,
      },
      '/socket.io': {
        target: `http://localhost:${process.env.NODUS_GATEWAY_PORT ?? 3002}`,
        ws: true,
      },
    },
  },
});
