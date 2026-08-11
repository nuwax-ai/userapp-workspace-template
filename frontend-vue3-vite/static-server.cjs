// 极简静态文件服务器（Node 内置 http，无外部依赖），SPA fallback 到 index.html。
// 供 Vite SPA 构建产物（dist/）使用：app-cli [run].command = ["node","static-server.js"]。
const http = require('http');
const fs = require('fs');
const path = require('path');
const port = process.env.PORT || 3000;
const types = {
  '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.ico': 'image/x-icon', '.woff': 'font/woff', '.woff2': 'font/woff2',
};
const server = http.createServer((req, res) => {
  let url = req.url.split('?')[0];
  if (url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ status: 'ok', service: 'vue' }));
  }
  let file = path.join('.', url);
  if (!path.extname(url)) file = 'index.html'; // SPA fallback
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); res.end('Not found'); return; }
    res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream' });
    res.end(data);
  });
});
server.listen(port, () => console.log(`[static-server] :${port}`));

// 优雅关闭：SIGTERM/SIGINT → 停止接新连接 → 排空 in-flight 请求 → 退出。
// 与后端 SIGTERM → 排空 → 关 DB pool 的模式对齐（平台 shutdown_timeout_seconds 默认 30s）。
function shutdown(signal) {
  console.log(`[static-server] ${signal} received, shutting down...`);
  server.close(() => {
    console.log('[static-server] shutdown complete');
    process.exit(0);
  });
  // Node 18.2+：立即关闭所有空闲保活连接，加速排空。
  if (typeof server.closeAllConnections === 'function') server.closeAllConnections();
  // 兜底：5s 后强制退出，避免卡在无法关闭的连接上。
  setTimeout(() => process.exit(1), 5000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
