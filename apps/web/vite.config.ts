import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// API и WebSocket проксируются на того же origin:
// dev — прокси Vite, preview (e2e в CI) — тот же прокси, docker — прокси nginx (infra/nginx/web.conf).
const proxy = {
  '/api': {
    target: `http://localhost:${process.env.NODUS_API_PORT ?? 3001}`,
    changeOrigin: true,
  },
  '/socket.io': {
    target: `http://localhost:${process.env.NODUS_GATEWAY_PORT ?? 3002}`,
    ws: true,
  },
};

export default defineConfig({
  plugins: [react()],
  server: {
    port: Number(process.env.NODUS_WEB_DEV_PORT ?? 5173),
    proxy,
  },
  preview: {
    port: Number(process.env.NODUS_WEB_PREVIEW_PORT ?? 4173),
    proxy,
  },
});
