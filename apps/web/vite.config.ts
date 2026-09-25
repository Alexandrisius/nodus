import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';

// API и WebSocket проксируются на того же origin:
// dev — прокси Vite, preview (e2e в CI) — тот же прокси, docker — прокси nginx (infra/nginx/web.conf).
// Цель /api-прокси: NODUS_API_DEV_TARGET из корневого .env — живой api для
// dev-приёмки (например, локальный инстанс ветки на :3011); по умолчанию —
// NODUS_API_PORT (docker-стек, 3001). Цель /socket.io (#104): симметрично —
// NODUS_GATEWAY_DEV_TARGET (dev-gateway ветки, например :3012), иначе хост-порт
// docker-gateway (NODUS_GATEWAY_PORT, 3002).
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '../../', '');
  const apiTarget = env.NODUS_API_DEV_TARGET ?? `http://localhost:${env.NODUS_API_PORT ?? 3001}`;
  const gatewayTarget =
    env.NODUS_GATEWAY_DEV_TARGET ?? `http://localhost:${env.NODUS_GATEWAY_PORT ?? 3002}`;
  const proxy = {
    '/api': {
      target: apiTarget,
      changeOrigin: true,
    },
    '/socket.io': {
      target: gatewayTarget,
      ws: true,
    },
  };
  return {
    // VITE_*-флаги (VITE_API_MOCK) лежат в корневом .env рядом с docker-переменными.
    envDir: '../../',
    plugins: [tailwindcss(), react()],
    server: {
      port: Number(env.NODUS_WEB_DEV_PORT ?? 5173),
      // Канон одного dev-сервера (#91): без strictPort vite тихо уезжает на
      // соседний порт, и владелец с агентами сидят на разных инстансах.
      strictPort: true,
      proxy,
    },
    preview: {
      port: Number(env.NODUS_WEB_PREVIEW_PORT ?? 4173),
      strictPort: true,
      proxy,
    },
  };
});
