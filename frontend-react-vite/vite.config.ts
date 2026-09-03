import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// https://vitejs.dev/config/
export default defineConfig({
  base: '/react/',
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    // dev 形态（[devrun]）：端口取编排注入的 PORT env（与 release.lock 分配端口、
    // pingap upstream 一致）；host 0.0.0.0 让容器外可访问；strictPort 防端口被占时
    // vite 自动 +1 漂移致 upstream 失联。
    port: Number(process.env.PORT) || 5173,
    host: true,
    strictPort: true,
  },
});
