"""仅本机敌人验收：白名单资源与固定输出目录，不执行客户端命令。"""
from http.server import ThreadingHTTPServer
from serve_combat_review import ReviewHandler, ROOT
import base64
import json
import re

WORK = ROOT / 'docs/art/style-a/enemy-redesign'

class EnemyReview(ReviewHandler):
    def do_GET(self):
        route = self.path.split('?',1)[0]
        files = {'/enemy-review':ROOT/'tools/enemy-review.html',
                 '/collision-review':ROOT/'tools/collision-review.html',
                 '/animation-data.json':WORK/'animation-data.json',
                 '/coverage.json':WORK/'coverage.json'}
        if route not in files:
            return super().do_GET()
        data = files[route].read_bytes()
        self.send_response(200)
        self.send_header('Content-Type','text/html; charset=utf-8' if route in ('/enemy-review','/collision-review') else 'application/json')
        self.send_header('Cache-Control','no-store')
        self.send_header('Content-Length',str(len(data)))
        self.end_headers();self.wfile.write(data)

    def do_POST(self):
        if self.path != '/evidence' or not 0 < int(self.headers.get('Content-Length','0')) < 25_000_000:
            return self.send_error(400)
        data = json.loads(self.rfile.read(int(self.headers['Content-Length'])))
        name = data.get('name','')
        if not re.fullmatch(r'[a-z0-9_-]{1,70}',name):
            return self.send_error(400)
        out = ROOT/'docs/qa/contact-collision' if name.startswith('collision-') else WORK/'browser'
        out.mkdir(parents=True,exist_ok=True)
        if 'image' in data:
            binary = base64.b64decode(data['image'].split(',',1)[1],validate=True)
            if not binary.startswith(b'\x89PNG\r\n\x1a\n'): return self.send_error(400)
            (out/(name+'.png')).write_bytes(binary)
        else:
            (out/(name+'.json')).write_text(json.dumps(data['report'],ensure_ascii=False,indent=2)+'\n',encoding='utf8')
        self.send_response(200);self.end_headers();self.wfile.write(b'ok')

if __name__ == '__main__':
    ThreadingHTTPServer(('127.0.0.1',8317),EnemyReview).serve_forever()
