import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import path from 'path';
// https://vitejs.dev/config/
// base 按 command 分流：build 产物引用带 /vue/ 前缀（平台 [proxy] 路由）；
// dev server（devrun 热加载）用 '/'——pingap strip_prefix=true 剥掉 /vue
// 前缀后转发，vite 以无前缀 base 接收才不 404。
export default defineConfig(({ command }) => ({
  base: command === 'serve' ? '/' : '/vue/',
  plugins: [
    // Keep the Vue SFC plugin first for standard Vue compilation.
    vue(),
    // dev 形态探针端点：devrun（vite dev）下应答 GET /health 200——
    // manifest [health].readiness_path 与 pingap upstream 健康探针都指向它；
    // 无此端点 dev server 会被 pingap 摘流（经 9080 的 /vue 预览 503）。
    // 仅 dev server 生效（configureServer），不进构建产物。
    {
      name: 'health-endpoint',
      configureServer(server) {
        server.middlewares.use('/health', (_req, res) => {
          res.statusCode = 200;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ status: 'ok' }));
        });
      },
    },
  ],
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
}));
