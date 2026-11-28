#!/usr/bin/env python3
"""The seam between the pages of the game and a site (web/site_hooks.js, docs/PLAY_IN_BROWSER.md "The seam to a site"): run by ./run_tests.sh --fast and by the CI.

A tree with no site has only the stub, and its pages must work with it alone:
  - the stub's contract and the game page's own part of it are RUN with node (tests/scripts/web_seam_check.js): every hook is there and does nothing and throws nothing, a second load or a
    site's own object is left alone, a game on this computer is reported to a site once and a test game never, and a site that throws is never the game's business;
  - every file that the game page, the Map Maker and the sprite and sound catalog name (their tags, and the scripts and styles that the page and the Map Maker load later by name) is a file of the
    public tree: a page that names a file of a site would load nothing there (the lists of export/ in a tree that has them; every file of the tree where it has none);
  - every mutant of tests/data/seam_stub_mutants.json is noticed by that check.
"""
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import unittest

REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
STUB = os.path.join(REPO, "web", "site_hooks.js")
SHELL = os.path.join(REPO, "web", "shell.html")
CHECK = os.path.join(REPO, "tests", "scripts", "web_seam_check.js")
MUTANTS = os.path.join(REPO, "tests", "data", "seam_stub_mutants.json")

# What the build makes and the page does not carry (the game, the map core, the Map Maker's atlas)
BUILT = ("index.js", "index.wasm", "index.data", "lvl_core.js", "lvl_core.wasm")


def read(path):
    with open(path, encoding="utf-8") as f:
        return f.read()


def public_files():
    """The files that the public repository has: the lists of export/ in the tree that has them, else (None) every file of the tree"""
    exporter = os.path.join(REPO, "export", "classify.py")
    if not os.path.exists(exporter):
        return None
    done = subprocess.run([sys.executable, exporter, "--repo", REPO, "--list", "public"], capture_output=True, text=True)
    return set(line for line in done.stdout.split("\n") if line)


def named_files(page, text):
    """(where the page says it, the path in the tree) of every file that a page's tags and its loads by name give"""
    here = os.path.dirname(page)
    found = []
    for url in re.findall(r"<script[^>]*\bsrc=\"([^\"]+)\"", text) + re.findall(r"<link[^>]*\bhref=\"([^\"]+)\"", text):
        found.append(url)
    if page.endswith("mapmaker.html"):                      # (the parts that the Map Maker loads when they are needed, by name)
        app = read(os.path.join(REPO, "web", "front", "mapmaker_app.js"))
        found += ["/" + m for m in re.findall(r"'(front/[A-Za-z_]+\.(?:js|css))'", app)]
        found += ["/front/" + m for m in re.findall(r"\bscript\('([A-Za-z_]+\.js)'\)", app)]
        found += ["/front/mapmaker_%s.js" % m for m in re.findall(r"\['Map[A-Za-z]+', '([a-z]+)'\]", app)]
    if page.endswith("shell.html"):
        found += re.findall(r"\.src = '([A-Za-z_/]+\.js)\?v='", text)
    out = []
    for url in found:
        url = url.split("?")[0].split("#")[0]
        if not url or url.startswith(("http:", "https:", "@@", "data:")) or os.path.basename(url) in BUILT or url.startswith("/mapmaker_atlas"):
            continue
        if url.startswith("/asset_catalog/"):
            out.append((url, url[1:]))
        elif url.startswith("/"):
            out.append((url, "web" + url))
        else:
            out.append((url, os.path.relpath(os.path.join(here, url), REPO)))
    return out


class ThePagesNameOnlyFilesOfThePublicTree(unittest.TestCase):
    def test_every_file_that_a_page_names_is_in_the_public_tree(self):
        public = public_files()
        for page in ("web/shell.html", "web/mapmaker.html", "asset_catalog/index.html"):
            names = named_files(os.path.join(REPO, page), read(os.path.join(REPO, page)))
            self.assertGreater(len(names), 5, page)
            for url, path in names:
                with self.subTest(page=page, file=url):
                    self.assertTrue(os.path.exists(os.path.join(REPO, path)), "%s names %s, which is not in the tree" % (page, url))
                    if public is not None:
                        self.assertIn(path, public, "%s names %s, a file that the public tree does not have" % (page, url))

    def test_the_stub_is_what_every_page_loads_of_a_site_and_a_site_serves_its_own_in_its_place(self):
        for page in ("web/shell.html", "web/mapmaker.html", "asset_catalog/index.html"):
            text = read(os.path.join(REPO, page))
            tags = re.findall(r"<script[^>]*\bsrc=\"/?site_hooks\.js\"[^>]*>", text)
            self.assertEqual(len(tags), 2, page + ": once in the head and once where a site's scripts would come")
            self.assertEqual(len(set(re.findall(r'data-page="([a-z]+)"', " ".join(tags)))), 1, page + ": the same page name in both")
            self.assertLess(text.index(tags[0]), text.index("</head>"), page)
            self.assertGreater(text.rindex(tags[1]), text.index("<body"), page)


@unittest.skipUnless(shutil.which("node"), "node is not installed: the stub and the page's part of the seam were NOT run (tests/scripts/web_seam_check.js)")
class TheStubAlone(unittest.TestCase):
    def test_every_hook_does_nothing_and_the_game_page_works_with_it(self):
        done = subprocess.run([shutil.which("node"), CHECK, STUB, SHELL], capture_output=True, text=True, timeout=120)
        self.assertEqual(done.returncode, 0, done.stdout + done.stderr)
        self.assertRegex(done.stdout, r"ok: \d+ checks")

    def test_the_stub_is_ascii_plain_es5_and_writes_nothing(self):
        data = open(STUB, "rb").read()
        self.assertTrue(all(b < 128 for b in data), "ASCII")
        text = re.sub(r"/\*.*?\*/|//[^\n]*", "", data.decode("ascii"), flags=re.S)                   # (the code: the comments say what a site's file does)
        for bad in ("=>", "let ", "const ", "`", "class ", "async ", "await ", "innerHTML", "document.write", "eval(", "new Function", "localStorage", "fetch("):
            self.assertNotIn(bad, text, bad)


@unittest.skipUnless(shutil.which("node"), "node is not installed: the mutants of the stub were NOT run")
class TheChecksAreNotVacuous(unittest.TestCase):
    def test_the_check_fails_on_every_broken_copy(self):
        """tests/data/seam_stub_mutants.json (tools/mutate.py runs them too): each mutant on a copy of its file, noticed by the check"""
        spec = json.loads(read(MUTANTS))
        self.assertGreaterEqual(len(spec["mutants"]), 6)
        with tempfile.TemporaryDirectory() as tmp:
            for m in spec["mutants"]:
                with self.subTest(m["id"]):
                    text = read(os.path.join(REPO, m["file"]))
                    self.assertEqual(text.count(m["old"]), 1, "%s: the text is not in the file exactly once" % m["id"])
                    mutated = os.path.join(tmp, os.path.basename(m["file"]))
                    with open(mutated, "w", encoding="utf-8", newline="") as f:
                        f.write(text.replace(m["old"], m["new"]))
                    stub = mutated if m["file"].endswith("site_hooks.js") else STUB
                    shell = mutated if m["file"].endswith("shell.html") else SHELL
                    done = subprocess.run([shutil.which("node"), CHECK, stub, shell], capture_output=True, text=True, timeout=120)
                    self.assertNotEqual(done.returncode, 0, "the check did not notice: " + m["id"])


if __name__ == "__main__":
    unittest.main()
