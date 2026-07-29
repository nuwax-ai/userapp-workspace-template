"""Python 后端最小 API（stdlib http.server，零依赖）。"""
import http.server
import json
import os


class Handler(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path == "/health":
            self._json({"status": "ok", "service": "python"})
        else:
            self._json({"service": "python-backend", "port": os.environ.get("PORT", "8080")})

    def _json(self, data):
        body = json.dumps(data).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(body)


if __name__ == "__main__":
    port = int(os.environ.get("PORT", "8080"))
    print(f"[python-backend] :{port}")
    http.server.HTTPServer(("0.0.0.0", port), Handler).serve_forever()
