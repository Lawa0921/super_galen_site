"""Loopback-only local QA server: built RTS site plus explicit art-factory prefix.

No source/config directory exposure and no mutations, uploads or remote binding.
"""
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlsplit
import argparse

ROOT=Path(__file__).resolve().parents[3]


class Handler(SimpleHTTPRequestHandler):
    def translate_path(self,path):
        route=unquote(urlsplit(path).path)
        prefix='/art-factory/rts/'
        base=ROOT/'art-factory/rts' if route.startswith(prefix) else ROOT/'.vercel/output/static'
        relative=route[len(prefix):] if route.startswith(prefix) else route.lstrip('/')
        resolved=(base/relative).resolve()
        try:resolved.relative_to(base.resolve())
        except ValueError:return str(base/'__invalid_route__')
        return str(resolved)


if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--port',type=int,default=4322);args=parser.parse_args()
    print(f'QA preview http://127.0.0.1:{args.port}, source={ROOT}',flush=True)
    ThreadingHTTPServer(('127.0.0.1',args.port),Handler).serve_forever()
