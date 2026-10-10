"""只读视觉核验服务：仅提供核验 HTML 和白名单图标，不暴露工作区。"""
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import re
import mimetypes
from urllib.parse import unquote

ROOT = Path(__file__).resolve().parents[1]

class ReviewHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        route = self.path.split('?', 1)[0]
        if route in ['/output/playwright/icon-review.html', '/output/playwright/combat-review.html']:
            target = ROOT / 'tools' / route.rsplit('/', 1)[-1]
            mime = 'text/html; charset=utf-8'
        elif route.startswith('/game/'):
            build = (ROOT / 'build/web-desktop').resolve()
            target = (build / unquote(route[6:] or 'index.html')).resolve()
            if not target.is_relative_to(build) or target.suffix.lower() not in ['.html','.js','.json','.css','.png','.jpg','.webp','.ttf','.woff','.woff2','.mp3','.ogg','.wav','.bin','.wasm']:
                self.send_error(404)
                return
            mime = mimetypes.guess_type(target.name)[0] or 'application/octet-stream'
        elif re.fullmatch(r'/output/playwright/(unit-|doc-|phase-|final-)[a-z0-9_-]+\.png', route):
            target = ROOT / route.lstrip('/')
            mime = 'image/png'
        elif re.fullmatch(r'/assets/resources/art/ui_icon_(skill_[a-z]+_[qer]|hex\d{2})\.png', route):
            target = ROOT / route.lstrip('/')
            mime = 'image/png'
        else:
            self.send_error(404)
            return
        if not target.is_file():
            self.send_error(404)
            return
        data = target.read_bytes()
        self.send_response(200)
        self.send_header('Content-Type', mime)
        self.send_header('Content-Length', str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def log_message(self, *_args):
        pass

if __name__ == '__main__':
    ThreadingHTTPServer(('127.0.0.1', 8316), ReviewHandler).serve_forever()
