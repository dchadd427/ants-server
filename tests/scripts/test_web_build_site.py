#!/usr/bin/env python3
"""The site's web build (build_site.sh): the public build, then the files of the site added with its stamps. Run by ./run_tests.sh --fast and the CI.

Emscripten and the generators of the map pages, the robots and sitemap files and the skills are stood in for (made-up programs write the files that they would; their own tests, test_map_pages.py,
test_web_seo.py and test_ai_skills.py, hold them), so that the real script runs in a few seconds on a copy of the tree. What is held:
  - build_site.sh runs build_web.sh first and takes its stamps: the front page, the match history and Legal pages, the admin page and the game page carry one version, one build, one date and one address,
    and none keeps a placeholder of the build;
  - the site's half of the seam takes the place of the stub: dist/site_hooks.js is web/site/site_hooks.js and dist/mapmaker_site.js is there, while the public build alone has the stub;
  - every script and style that a page of web/ loads, as a browser builds the page once the site's hooks have written their tags, is in dist/ (the check that the Docker image has too: tests/scripts/test_web_image_files.py);
  - the folders and files of the site that the public build does not copy are there: /home/, the map pages, robots.txt and sitemap.xml, the skills.
"""
import os
import re
import shutil
import stat
import subprocess
import sys
import tempfile
import unittest

REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import test_web_build as public_build  # noqa: E402  (the stand-in for Emscripten)
import test_web_image_files as image_files  # noqa: E402  (what the pages load)

FILES = ("build_web.sh", "build_site.sh", "VERSION", "docker/resolve_build_id.sh", "asset_catalog/index.html", "asset_catalog/catalog_data.js")
FAKE_MAP_PAGES = '''import os, sys
out = sys.argv[2]
os.makedirs(os.path.join(out, "html", "map_pages"), exist_ok=True)
open(os.path.join(out, "html", "map-library.html"), "w").write("map library " + " ".join(sys.argv[3:]))
open(os.path.join(out, "addresses.txt"), "w").write("/map-library\\n")
'''
FAKE_SEO = '''import os, sys
open(os.path.join(sys.argv[2], "robots.txt"), "w").write("User-agent: *\\n")
open(os.path.join(sys.argv[2], "sitemap.xml"), "w").write("<urlset/>")
'''
FAKE_SKILLS = '''import os, sys
os.makedirs(os.path.join(sys.argv[2], "ai", "skills"), exist_ok=True)
open(os.path.join(sys.argv[2], "ai", "skills", "index.json"), "w").write("{}")
'''


def read(path):
    with open(path, encoding="utf-8", errors="replace") as f:
        return f.read()


class TheSiteBuild(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.TemporaryDirectory()
        cls.tree = os.path.join(cls.tmp.name, "tree")
        shutil.copytree(os.path.join(REPO, "web"), os.path.join(cls.tree, "web"))
        for rel in FILES:
            os.makedirs(os.path.dirname(os.path.join(cls.tree, rel)) or cls.tree, exist_ok=True)
            shutil.copy2(os.path.join(REPO, rel), os.path.join(cls.tree, rel))
        os.makedirs(os.path.join(cls.tree, "tools"))
        for name, text in (("map_atlas.py", public_build.FAKE_ATLAS), ("map_pages.py", FAKE_MAP_PAGES), ("seo_files.py", FAKE_SEO), ("make_ai_skills.py", FAKE_SKILLS)):
            with open(os.path.join(cls.tree, "tools", name), "w") as f:
                f.write(text)
        bin_folder = os.path.join(cls.tmp.name, "bin")
        public_build.fake_emscripten(bin_folder)
        env = dict(os.environ, PATH=bin_folder + os.pathsep + os.environ["PATH"], ANTS_BUILD_ID="sitebuild", HOME=cls.tmp.name)
        env.pop("EMSDK", None)
        cls.built = subprocess.run(["bash", "build_site.sh"], cwd=cls.tree, env=env, capture_output=True, text=True, timeout=300)
        cls.dist = os.path.join(cls.tree, "dist")

    @classmethod
    def tearDownClass(cls):
        cls.tmp.cleanup()

    def test_the_build_works(self):
        self.assertEqual(self.built.returncode, 0, self.built.stdout + self.built.stderr)

    def test_the_pages_of_the_site_and_the_game_page_carry_one_version_one_build_and_no_placeholder(self):
        version = "v" + read(os.path.join(REPO, "VERSION")).split()[0]
        for page in ("index.html", "lobby.html", "matches.html", "match.html", "legal.html", "admin.html", "mapmaker.html"):
            text = read(os.path.join(self.dist, page))
            self.assertEqual([m for m in re.findall(r"@@\w+@@", text) if m not in ("@@BUILD_TIMESTAMP@@", "@@DATA_SIZE@@")], [], page)
            self.assertIn(version, text, page)
            self.assertIn("sitebuild", text, page)
        built_dates = set()
        for page in ("index.html", "lobby.html", "legal.html", "admin.html"):
            built_dates.update(re.findall(r"\d{4}-\d\d-\d\d \d\d:\d\d PT", read(os.path.join(self.dist, page))))
        self.assertEqual(len(built_dates), 1, "one date of the build in every page: %s" % sorted(built_dates))

    def test_the_sites_half_of_the_seam_takes_the_place_of_the_stub(self):
        with open(os.path.join(self.dist, "site_hooks.js"), "rb") as built, open(os.path.join(REPO, "web", "site", "site_hooks.js"), "rb") as site:
            self.assertEqual(built.read(), site.read())
        self.assertTrue(os.path.isfile(os.path.join(self.dist, "mapmaker_site.js")))
        with open(os.path.join(REPO, "web", "site_hooks.js"), "rb") as stub, open(os.path.join(self.dist, "site_hooks.js"), "rb") as built:
            self.assertNotEqual(built.read(), stub.read())

    def test_every_script_and_style_that_a_page_loads_is_in_the_folder(self):
        refs = image_files.loaded_files()
        self.assertGreater(len(refs), 40)
        for ref, pages in sorted(refs.items()):
            with self.subTest(ref=ref):
                self.assertTrue(os.path.isfile(os.path.join(self.dist, ref)), "%s (loaded by %s) is not in dist/" % (ref, ", ".join(pages)))

    def test_the_server_shows_the_front_page_at_the_root_and_the_game_page_for_a_game(self):
        import importlib.util
        import threading
        import urllib.request
        spec = importlib.util.spec_from_file_location("serve_web", os.path.join(REPO, "tools", "serve_web.py"))
        serve_web = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(serve_web)
        server, address = serve_web.serve(self.dist, 0, [])
        threading.Thread(target=server.serve_forever, daemon=True).start()
        try:
            for path, page in (("", "lobby.html"), ("?join=X", "index.html"), ("play", "play.html"), ("matches", "matches.html"), ("mapmaker", "mapmaker.html")):
                with urllib.request.urlopen(address + path, timeout=30) as answer:
                    self.assertEqual(answer.read().decode("utf-8"), read(os.path.join(self.dist, page)), path)
        finally:
            server.shutdown()
            server.server_close()

    def test_what_the_public_build_does_not_copy_is_there(self):
        for name in ("home/names.js", "map-library.html", "robots.txt", "sitemap.xml", "ai/skills/index.json", "matches.css", "site_nav.js", "analytics.js", "history_page.js", "hub_here.js", "lvl_core.wasm", "asset_catalog/index.html"):
            self.assertTrue(os.path.isfile(os.path.join(self.dist, name)), name)
        self.assertIn("v", read(os.path.join(self.dist, "map-library.html")), "the map pages are made with the stamps of the build")
        self.assertIn("--build-id sitebuild", read(os.path.join(self.dist, "map-library.html")))


if __name__ == "__main__":
    unittest.main()
