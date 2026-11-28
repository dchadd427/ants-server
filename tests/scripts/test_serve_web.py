#!/usr/bin/env python3
"""The server of the web build (tools/serve_web.py): run by ./run_tests.sh --fast and the CI. It is started on a made-up folder and asked, as a browser asks:

  - the headers: what the game and the pages are made of (.html .js .css .wasm .data) is revalidated at every use (AGENTS.md rule 6: `Cache-Control: no-cache, must-revalidate`, and an answer to a
    conditional request is a 304 that still says so), pictures and sounds are kept for a week, and every answer, a 404 and a list too, has the isolation headers that the game needs;
  - the addresses: "/" is the game page, or the front page that the folder's serve_web.json names (unless the address has ?join=), /play and /NAME are the pages play.html and NAME.html, a folder is its
    index.html, an address that is no page is a 404, and nothing outside the folder is ever served, however the address is written;
  - the maps: the list of /maps/all (the six originals first, marked) and the files of /maps/files/NAME, and a name that is no map file is a 404;
  - the command mode: `-- COMMAND` runs it with ANTS_WEB_URL set to an address that answers, and its exit status is the command's.
"""
import http.client
import importlib.util
import json
import os
import subprocess
import sys
import tempfile
import threading
import unittest

REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
TOOL = os.path.join(REPO, "tools", "serve_web.py")
spec = importlib.util.spec_from_file_location("serve_web", TOOL)
serve_web = importlib.util.module_from_spec(spec)
spec.loader.exec_module(serve_web)

REVALIDATED = "no-cache, must-revalidate"
FILES = {
    "index.html": "game page", "play.html": "play page", "mapmaker.html": "map maker", "other.html": "another page",
    "asset_catalog/index.html": "catalog", "front/x.css": "css", "front/x.js": "js", "front/logo.png": "png", "front/x.ogg": "ogg", "index.wasm": "\0asm", "index.data": "data", "manifest.webmanifest": "{}",
}


def write(root, files):
    for name, text in files.items():
        path = os.path.join(root, name)
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "w", encoding="utf-8") as f:
            f.write(text)


class Served:
    """a server on a made-up folder: .root (the folder), .maps (the folder of map files), .host and .port"""
    def __init__(self, extra=None):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = os.path.join(self.tmp.name, "dist")
        self.maps = os.path.join(self.tmp.name, "maps")
        write(self.root, dict(FILES, **(extra or {})))
        write(self.maps, {"ZED.lvl": "z", "TINY.LVL": "tiny bytes", "SMALL.LVL": "s", "notes.txt": "no"})
        self.server, address = serve_web.serve(self.root, 0, [self.maps])
        self.host, self.port = "127.0.0.1", self.server.server_address[1]
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()

    def ask(self, path, method="GET", headers=None):
        """(status, headers, body) of a request whose address is written exactly as given"""
        connection = http.client.HTTPConnection(self.host, self.port, timeout=30)
        try:
            connection.request(method, path, headers=headers or {})
            answer = connection.getresponse()
            return answer.status, answer, answer.read()
        finally:
            connection.close()

    def close(self):
        self.server.shutdown()
        self.server.server_close()
        self.tmp.cleanup()


class TheBuildOfTheGame(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.site = Served()

    @classmethod
    def tearDownClass(cls):
        cls.site.close()

    def test_the_game_and_the_pages_are_revalidated_at_every_use(self):
        for path in ("/index.html", "/index.wasm", "/index.data", "/front/x.css", "/front/x.js", "/mapmaker.html"):
            status, answer, _ = self.site.ask(path)
            self.assertEqual(status, 200, path)
            self.assertEqual(answer.getheader("Cache-Control"), REVALIDATED, path)

    def test_a_conditional_request_for_a_file_that_did_not_change_is_a_304_that_says_so(self):
        _, answer, _ = self.site.ask("/index.wasm")
        status, again, _ = self.site.ask("/index.wasm", headers={"If-Modified-Since": answer.getheader("Last-Modified")})
        self.assertEqual(status, 304)
        self.assertEqual(again.getheader("Cache-Control"), REVALIDATED)

    def test_pictures_and_sounds_are_kept_for_a_week(self):
        for path in ("/front/logo.png", "/front/x.ogg"):
            self.assertEqual(self.site.ask(path)[1].getheader("Cache-Control"), "public, max-age=604800, no-transform", path)

    def test_every_answer_has_the_isolation_headers_a_404_and_a_list_too(self):
        for path in ("/", "/index.wasm", "/front/logo.png", "/manifest.webmanifest", "/maps/all", "/maps/files/TINY.LVL", "/maps/files/none.lvl", "/nothing"):
            _, answer, _ = self.site.ask(path)
            self.assertEqual(answer.getheader("Cross-Origin-Opener-Policy"), "same-origin", path)
            self.assertEqual(answer.getheader("Cross-Origin-Embedder-Policy"), "require-corp", path)
            self.assertEqual(answer.getheader("X-Content-Type-Options"), "nosniff", path)

    def test_the_program_is_sent_as_webassembly(self):
        self.assertEqual(self.site.ask("/index.wasm")[1].getheader("Content-Type"), "application/wasm")

    def test_head_has_the_headers_and_no_body(self):
        status, answer, body = self.site.ask("/index.wasm", method="HEAD")
        self.assertEqual((status, body), (200, b""))
        self.assertEqual(answer.getheader("Cache-Control"), REVALIDATED)


class TheAddresses(unittest.TestCase):
    def test_the_front_of_a_folder_with_no_site_is_the_game_page(self):
        site = Served()
        try:
            self.assertEqual(site.ask("/")[2], b"game page")
            self.assertEqual(site.ask("/play")[2], b"play page")
            self.assertEqual(site.ask("/mapmaker")[2], b"map maker")
            self.assertEqual(site.ask("/other")[2], b"another page")
            self.assertEqual(site.ask("/index.html")[2], b"game page")
            self.assertEqual(site.ask("/nothing")[0], 404)
            self.assertEqual(site.ask("/play.html?x=1")[2], b"play page")
        finally:
            site.close()

    def test_a_folder_that_names_a_front_page_shows_it_unless_the_address_names_a_game(self):
        site = Served({"serve_web.json": '{"front": "front.html"}', "front.html": "front page", "more.html": "more"})
        try:
            self.assertEqual(site.ask("/")[2], b"front page")
            self.assertEqual(site.ask("/?join=ABC")[2], b"game page")
            self.assertEqual(site.ask("/more")[2], b"more")
            self.assertEqual(site.ask("/play")[2], b"play page")
        finally:
            site.close()

    def test_a_front_page_that_is_not_a_file_of_the_folder_or_is_no_page_name_is_ignored(self):
        for text in ('{"front": "gone.html"}', '{"front": "../x.html"}', '{"front": 3}', "[1]", "not json"):
            site = Served({"serve_web.json": text})
            try:
                self.assertEqual(site.ask("/")[2], b"game page", text)
            finally:
                site.close()

    def test_a_folder_is_its_index_with_the_page_headers_and_the_address_without_a_slash_goes_to_it(self):
        site = Served()
        try:
            status, answer, body = site.ask("/asset_catalog/")
            self.assertEqual((status, body), (200, b"catalog"))
            self.assertEqual(answer.getheader("Cache-Control"), REVALIDATED)
            status, answer, _ = site.ask("/asset_catalog")
            self.assertEqual((status, answer.getheader("Location")), (301, "/asset_catalog/"))
            self.assertEqual(site.ask("/front/")[0], 404)
        finally:
            site.close()

    def test_nothing_outside_the_folder_is_served_however_the_address_is_written(self):
        site = Served()
        secret = os.path.join(site.tmp.name, "secret.txt")
        with open(secret, "w") as f:
            f.write("outside")
        try:
            for path in ("/../secret.txt", "/%2e%2e/secret.txt", "/front/../../secret.txt", "/..%2fsecret.txt", "/maps/files/../secret.txt", "/maps/files/..%2fsecret.txt", "//secret.txt", "/maps/files/secret.txt"):
                status, _, body = site.ask(path)
                self.assertNotEqual(body, b"outside", path)
                self.assertIn(status, (301, 400, 404), path)
        finally:
            site.close()


class TheMaps(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.site = Served()

    @classmethod
    def tearDownClass(cls):
        cls.site.close()

    def test_the_list_has_the_originals_first_and_marks_them(self):
        status, answer, body = self.site.ask("/maps/all")
        self.assertEqual(status, 200)
        self.assertEqual(answer.getheader("Content-Type"), "application/json")
        data = json.loads(body)
        self.assertEqual(data["format"], 1)
        self.assertEqual([m["file"] for m in data["maps"]], ["SMALL.LVL", "TINY.LVL", "ZED.lvl"])
        self.assertEqual([bool(m.get("original")) for m in data["maps"]], [True, True, False])

    def test_a_map_file_is_sent_as_it_is(self):
        status, _, body = self.site.ask("/maps/files/TINY.LVL")
        self.assertEqual((status, body), (200, b"tiny bytes"))

    def test_a_name_that_is_no_map_file_is_a_404(self):
        for name in ("notes.txt", "missing.lvl", "..", "a%2fb.lvl", ""):
            self.assertEqual(self.site.ask("/maps/files/" + name)[0], 404, name)

    def test_a_tree_with_no_folder_of_maps_has_an_empty_list(self):
        self.assertEqual(serve_web.map_names([os.path.join(self.site.tmp.name, "none")]), [])


class TheCommandMode(unittest.TestCase):
    def run_tool(self, *args):
        return subprocess.run([sys.executable, TOOL] + list(args), capture_output=True, text=True, timeout=120)

    def test_the_command_gets_an_address_that_answers_and_its_status_is_the_result(self):
        with tempfile.TemporaryDirectory() as tmp:
            write(tmp, {"index.html": "hello"})
            code = "import os, sys, urllib.request; sys.exit(0 if urllib.request.urlopen(os.environ['ANTS_WEB_URL']).read() == b'hello' else 5)"
            self.assertEqual(self.run_tool("--dist", tmp, "--port", "0", "--", sys.executable, "-c", code).returncode, 0)
            self.assertEqual(self.run_tool("--dist", tmp, "--port", "0", "--", sys.executable, "-c", "import sys; sys.exit(3)").returncode, 3)

    def test_a_missing_folder_or_command_is_refused_with_status_2(self):
        with tempfile.TemporaryDirectory() as tmp:
            self.assertEqual(self.run_tool("--dist", os.path.join(tmp, "none"), "--port", "0").returncode, 2)
            write(tmp, {"index.html": "x"})
            self.assertEqual(self.run_tool("--dist", tmp, "--port", "0", "--", os.path.join(tmp, "no-such-command")).returncode, 2)


if __name__ == "__main__":
    unittest.main()
