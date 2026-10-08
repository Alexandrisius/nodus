import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// Мини-фронтенд оболочки (экран подключения + попапы уведомлений): собирается
// в dist/ и встраивается Tauri (frontendDist ../dist). Адрес портала мини-UI
// не знает — всем общением с порталом управляет Rust-сторона (IPC-команды).
export default defineConfig({
  plugins: [react(), tailwindcss()],
  clearScreen: false,
  build: {
    target: 'chrome110',
  },
});
