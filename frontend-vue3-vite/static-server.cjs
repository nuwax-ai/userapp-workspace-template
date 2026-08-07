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
http.createServer((req, res) => {
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
}).listen(port, () => console.log(`[static-server] :${port}`));
