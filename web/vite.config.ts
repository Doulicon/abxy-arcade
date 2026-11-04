import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': { target: 'http://localhost:3000', changeOrigin: false },
      '/uploads': { target: 'http://localhost:3000', changeOrigin: false },
      // 内置平台默认图（server/public/platform-art），开发模式需要代理到后端
      '/platform-art': { target: 'http://localhost:3000', changeOrigin: false },
      // 模拟器运行时与内核（server/public/emulatorjs）。不代理会 404，页面只能退回
      // 公网 CDN；国内网络连不上时就直接「Failed to start game」
      '/emulatorjs': { target: 'http://localhost:3000', changeOrigin: false },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    chunkSizeWarningLimit: 900,
  },
});
