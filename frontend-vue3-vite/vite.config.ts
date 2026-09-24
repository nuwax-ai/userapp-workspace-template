import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import path from 'path';
import { readManifestBase } from './scripts/manifest-routing.mjs';
// https://vitejs.dev/config/
// dev 与 build 的资源 URL 都保留公共前缀；dev 由 Vite 处理前缀，
// prod 由代理剥前缀后映射 dist/assets。见 manifest 的 dev_strip_prefix。
export default defineConfig({
  // 修改公共路径只改 manifest；dev/build 都在加载配置时读取，不再写死 base。
  base: readManifestBase(new URL('./project.manifest.toml', import.meta.url)),
  plugins: [
    // Keep the Vue SFC plugin first for standard Vue compilation.
    vue(),
    // dev 形态探针端点：devrun（vite dev）下应答 GET /health 200——
    // manifest [health].readiness_path 与 pingap upstream 健康探针都指向它；
    // 无此端点 dev server 会被 pingap 摘流（经 9080 的 /vue 预览 503）。
    // 仅 dev server 生效（configureServer），不进构建产物。
    {
      name: 'health-and-base',
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          // 内部 readiness 探测用 /health；预览路径保留 base，二者都返回 JSON。
          const pathname = req.url?.split('?', 1)[0];
          const base = server.config.base;
          if (
            base !== '/' && pathname === base.slice(0, -1) &&
            (req.method === 'GET' || req.method === 'HEAD')
          ) {
            res.statusCode = 302;
            res.setHeader('Location', base + (req.url?.slice(pathname.length) ?? ''));
            res.end();
            return;
          }
          if (pathname !== '/health' && pathname !== `${server.config.base}health`) {
            next();
            return;
          }
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
});
