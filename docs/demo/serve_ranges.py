#!/usr/bin/env python3
"""Servidor estatico con soporte de Range, que PMTiles necesita (ADR-22 §8).

http.server no implementa Range: MapLibre pide un trozo del archivo y recibe
el archivo entero sin content-length coherente, asi que el basemap no carga.
"""
import http.server, os, re, sys

ROOT = sys.argv[1]
PORT = int(sys.argv[2]) if len(sys.argv) > 2 else 8812

class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=ROOT, **kw)

    def log_message(self, fmt, *args):
        sys.stderr.write("%s %s\n" % (self.address_string(), fmt % args))

    def send_head(self):
        rng = self.headers.get("Range")
        if not rng:
            return super().send_head()
        path = self.translate_path(self.path)
        if not os.path.isfile(path):
            self.send_error(404)
            return None
        size = os.path.getsize(path)
        m = re.match(r"bytes=(\d*)-(\d*)$", rng.strip())
        if not m:
            self.send_error(416)
            return None
        start = int(m.group(1)) if m.group(1) else 0
        end = int(m.group(2)) if m.group(2) else size - 1
        end = min(end, size - 1)
        if start > end:
            self.send_error(416)
            return None
        f = open(path, "rb")
        f.seek(start)
        self.send_response(206)
        self.send_header("Content-Type", self.guess_type(path))
        self.send_header("Content-Range", f"bytes {start}-{end}/{size}")
        self.send_header("Content-Length", str(end - start + 1))
        self.send_header("Accept-Ranges", "bytes")
        self.end_headers()
        self._limit = end - start + 1
        return f

    def copyfile(self, src, dst):
        limit = getattr(self, "_limit", None)
        if limit is None:
            return super().copyfile(src, dst)
        remaining = limit
        while remaining > 0:
            chunk = src.read(min(64 * 1024, remaining))
            if not chunk:
                break
            dst.write(chunk)
            remaining -= len(chunk)

http.server.ThreadingHTTPServer(("127.0.0.1", PORT), Handler).serve_forever()
