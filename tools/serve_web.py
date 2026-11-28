#!/usr/bin/env python3
"""Serves the web build (the folder dist/ that build_web.sh writes) on this computer, with the headers and the page addresses that the pages expect, so that the browser checks and a developer's eyes see what a visitor sees.

usage: serve_web.py [--dist DIR] [--port N] [--maps DIR]... [-- COMMAND [ARG ...]]

    tools/serve_web.py                                     serve ./dist at http://127.0.0.1:8080/ until Ctrl-C
    tools/serve_web.py --port 0 -- tests/scripts/test_web_aspect.sh        serve on a free port, run COMMAND with ANTS_WEB_URL set to the address, stop

  --dist DIR   the folder to serve (default: dist of this tree)     --port N  the port on 127.0.0.1 (default 8080; 0: a free one)
  --maps DIR   a folder of map files (.lvl) that the Map Maker may list and download, as /maps/all and /maps/files/NAME (default: Original-Ants/Maps and Community-Maps of this tree, those that exist)

What it does that python's own file server does not (this is the page's side of what a real site does, and nothing of a site's own):
  - the headers: the game, the pages' scripts and styles (.html .js .css .wasm .data) are sent with `Cache-Control: no-cache, must-revalidate` (AGENTS.md rule 6: revalidated at every use, never
    kept as they are); pictures and sounds are kept for a week; every answer carries the isolation headers that the game needs (Cross-Origin-Opener-Policy: same-origin, Cross-Origin-Embedder-Policy:
    require-corp) and `X-Content-Type-Options: nosniff`;
  - the clean page addresses: /play is play.html, any other /NAME is NAME.html when the folder has it, a folder is its index.html (and one with none is a 404, never a listing), and "/" is the game
    page (index.html), or the front page that the file serve_web.json of the folder names ({"front": "NAME.html"}: a build that adds a site's pages to the folder writes it) unless the address has ?join=;
  - the maps: the list as {"format":1,"maps":[...]} and the files, from the folders of --maps (the six originals first), which is all that the Map Maker asks of a game server.
It listens on 127.0.0.1 only, serves nothing outside the folder and no game server is behind it (the game's own online part needs one and is not served). Python 3.8 or later, standard library only.
Exit status: COMMAND's, or 0 (Ctrl-C); 2 the folder or COMMAND could not be used.
"""
import argparse
import functools
import http.server
import json
import os
import re
import subprocess
import sys
import threading
import urllib.parse

REPO = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
REVALIDATED = (".html", ".js", ".css", ".wasm", ".data")       # AGENTS.md rule 6: sent with Cache-Control: no-cache, must-revalidate
KEPT = (".png", ".jpg", ".jpeg", ".gif", ".ico", ".bmp", ".wav", ".mp3", ".ogg")
MAP_FILE = re.compile(r"[ -.0-\[\]-~]{1,80}\.(?:lvl|LVL)")     # a name that is no path: no slash, no backslash
ORIGINALS = ("tiny", "small", "medium", "gauntlet", "treasure", "islands")


def map_folders(given):
    """The folders that hold map files: the ones given, else the originals' and the players' maps of this tree that exist"""
    if given:
        return given
    return [path for path in (os.path.join(REPO, "Original-Ants", "Maps"), os.path.join(REPO, "Community-Maps")) if os.path.isdir(path)]


def map_names(folders):
    names = []
    for folder in folders:
        try:
            found = sorted(n for n in os.listdir(folder) if MAP_FILE.fullmatch(n) and n not in names)
        except OSError:
            continue
        names += found
    originals = [n for n in names if n[:-4].lower() in ORIGINALS]
    return originals + [n for n in names if n not in originals]


class Handler(http.server.SimpleHTTPRequestHandler):
    maps = []
    extensions_map = dict(http.server.SimpleHTTPRequestHandler.extensions_map, **{".wasm": "application/wasm", ".js": "text/javascript", ".webmanifest": "application/manifest+json", ".lvl": "application/octet-stream", ".LVL": "application/octet-stream"})

    def log_message(self, fmt, *args):
        if os.environ.get("ANTS_SERVE_WEB_LOG"):
            super().log_message(fmt, *args)

    def front(self):
        """the file that the folder's own serve_web.json names as its front page, when it is a file of the folder"""
        try:
            with open(os.path.join(self.directory, "serve_web.json"), encoding="utf-8") as f:
                name = json.load(f).get("front")
        except (OSError, ValueError, AttributeError):
            return None
        return name if isinstance(name, str) and re.fullmatch(r"[A-Za-z0-9_-]+\.html", name) and os.path.isfile(os.path.join(self.directory, name)) else None

    def clean(self, path, query):
        """The file that an address stands for: the page of a clean address, the index of a folder, else the address itself"""
        root = self.directory
        if path == "/":
            front = self.front()
            return "/" + front if front and "join" not in urllib.parse.parse_qs(query) else "/index.html"
        name = path[1:]
        if re.fullmatch(r"[A-Za-z0-9_-]+", name) and os.path.isfile(os.path.join(root, name + ".html")):
            return "/" + name + ".html"
        if path.endswith("/") and os.path.isfile(os.path.join(self.translate_path(path), "index.html")):
            return path + "index.html"
        return path

    def list_directory(self, path):
        self.send_error(404)          # (a folder with no index.html is no page: the site answers it with a 404, never with a listing)
        return None

    def send_list(self, body, head):
        data = json.dumps(body).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        if not head:
            self.wfile.write(data)

    def send_map(self, name, head):
        for folder in self.maps:
            path = os.path.join(folder, name)
            if os.path.isfile(path):
                with open(path, "rb") as f:
                    data = f.read()
                self.send_response(200)
                self.send_header("Content-Type", "application/octet-stream")
                self.send_header("Content-Length", str(len(data)))
                self.send_header("Cache-Control", "no-cache, must-revalidate")
                self.end_headers()
                if not head:
                    self.wfile.write(data)
                return
        self.send_error(404)

    def answer(self, head):
        parts = urllib.parse.urlsplit(self.path)
        path = urllib.parse.unquote(parts.path)
        if path in ("/maps", "/maps/all"):
            return self.send_list({"format": 1, "maps": [dict({"file": n}, **({"original": True} if n[:-4].lower() in ORIGINALS else {})) for n in map_names(self.maps)]}, head)
        if path.startswith("/maps/files/"):
            name = path[len("/maps/files/"):]
            return self.send_map(name, head) if MAP_FILE.fullmatch(name) else self.send_error(404)
        self.path = self.clean(path, parts.query)
        f = self.send_head()
        if f:
            try:
                if not head:
                    self.copyfile(f, self.wfile)
            finally:
                f.close()

    def do_GET(self):
        self.answer(False)

    def do_HEAD(self):
        self.answer(True)

    def end_headers(self):
        name = urllib.parse.urlsplit(self.path).path.lower()
        if name.endswith(REVALIDATED):
            self.send_header("Cache-Control", "no-cache, must-revalidate")
        elif name.endswith(KEPT):
            self.send_header("Cache-Control", "public, max-age=604800, no-transform")
        self.send_header("Cross-Origin-Opener-Policy", "same-origin")
        self.send_header("Cross-Origin-Embedder-Policy", "require-corp")
        self.send_header("X-Content-Type-Options", "nosniff")
        super().end_headers()


def serve(dist, port, maps):
    """(server, address): a server on 127.0.0.1 that serves the folder dist; start it with serve_forever()"""
    handler = functools.partial(type("ServeWebHandler", (Handler,), {"maps": maps}), directory=dist)
    server = http.server.ThreadingHTTPServer(("127.0.0.1", port), handler)
    return server, "http://127.0.0.1:%d/" % server.server_address[1]


def main(argv=None):
    argv = list(sys.argv[1:] if argv is None else argv)
    command = []
    if "--" in argv:
        at = argv.index("--")
        argv, command = argv[:at], argv[at + 1:]
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--dist", default=os.path.join(REPO, "dist"))
    ap.add_argument("--port", type=int, default=8080)
    ap.add_argument("--maps", action="append", default=[])
    args = ap.parse_args(argv)
    dist = os.path.abspath(args.dist)
    if not os.path.isdir(dist):
        print("serve_web: %s is not a folder (build it first: ./build_web.sh)" % dist, file=sys.stderr)
        return 2
    server, address = serve(dist, args.port, map_folders([os.path.abspath(m) for m in args.maps]))
    print("serve_web: %s serves %s" % (address, dist), flush=True)
    if not command:
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            pass
        finally:
            server.server_close()
        return 0
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        return subprocess.run(command, env=dict(os.environ, ANTS_WEB_URL=address)).returncode
    except OSError as e:
        print("serve_web: cannot run %s: %s" % (command[0], e), file=sys.stderr)
        return 2
    finally:
        server.shutdown()
        server.server_close()


if __name__ == "__main__":
    sys.exit(main())
