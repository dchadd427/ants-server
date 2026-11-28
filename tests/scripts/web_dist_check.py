#!/usr/bin/env python3
"""The check of a web build (the folder dist/ of build_web.sh): the files of the game, the Map Maker and the sprite and sound catalog are there, no page keeps a stamp's placeholder, the pages
name the version of this tree, and every file that a page names is in the folder. With --web ADDRESS (tools/serve_web.py serves the folder) it also asks for the pages and the big files and checks
what the server answers: the status, the revalidating Cache-Control of AGENTS.md rule 6, the isolation headers and the list of maps.

usage: web_dist_check.py DIST [--web ADDRESS]

Run by ci/web_check.sh on a real build and by tests/scripts/test_web_build.py on the folder that the build script makes when Emscripten is stood in for. Exit status 0: every check passed
("ok: N checks"); 1: a check failed (listed). It reads the pages of the tree (web/shell.html, web/mapmaker.html, asset_catalog/index.html) for the names that tests/scripts/test_web_seam.py reads there.
"""
import argparse
import os
import re
import sys
import urllib.error
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import test_web_seam as seam  # noqa: E402   (what a page names: its tags, and what the Map Maker and the game page load later by name)

REPO = seam.REPO
GAME = ("index.html", "play.html", "mapmaker.html", "index.js", "index.wasm", "index.data", "lvl_core.js", "lvl_core.wasm", "lvl_core_api.js", "site_hooks.js", "update_notice.js", "game_bar.js",
        "manifest.webmanifest", "favicon.png", "mapmaker_atlas/atlas.json", "mapmaker_atlas/ground.png", "mapmaker_atlas/objects.png", "asset_catalog/index.html", "asset_catalog/catalog_data.js")
PAGES = (("web/shell.html", "index.html"), ("web/mapmaker.html", "mapmaker.html"), ("asset_catalog/index.html", "asset_catalog/index.html"))
REVALIDATED = "no-cache, must-revalidate"
KEPT_FOR_AN_IMAGE = ("@@BUILD_TIMESTAMP@@", "@@DATA_SIZE@@")      # the game page's two placeholders that a build outside an image leaves (the page says so: the size 0 is "not known", the build time is its own)


def read(*parts):
    with open(os.path.join(*parts), encoding="utf-8", errors="replace") as f:
        return f.read()


def files(dist, fail):
    """the files that a build of the game has, the stamps, and every file that a page names"""
    checks = 0
    for name in GAME:
        checks += 1
        path = os.path.join(dist, name)
        if not os.path.isfile(path) or os.path.getsize(path) == 0:
            fail("%s is missing or empty" % name)
    version = "v" + read(REPO, "VERSION").split()[0]
    for _, built in PAGES + (("", "play.html"),):
        path = os.path.join(dist, built)
        if not os.path.isfile(path):
            continue
        text = read(path)
        checks += 1
        left = [m for m in re.findall(r"@@\w+@@", text) if m not in KEPT_FOR_AN_IMAGE]
        if left:
            fail("%s still has a placeholder of the build (%s)" % (built, left[0]))
    for built in ("index.html", "play.html", "mapmaker.html"):
        if os.path.isfile(os.path.join(dist, built)):
            checks += 1
            if version not in read(dist, built):
                fail("%s does not name the version %s" % (built, version))
    for source, built in PAGES:
        for url, _ in seam.named_files(os.path.join(REPO, source), read(REPO, source)):
            checks += 1
            where = os.path.join(dist, url.lstrip("/")) if url.startswith("/") else os.path.join(dist, os.path.dirname(built), url)
            if not os.path.isfile(where):
                fail("%s names %s, which the build does not have" % (source, url))
    return checks


def fetch(address, path):
    request = urllib.request.Request(address.rstrip("/") + path)
    try:
        with urllib.request.urlopen(request, timeout=30) as answer:
            return answer.status, answer.headers, answer.read()
    except urllib.error.HTTPError as e:
        return e.code, e.headers, b""


def routes(address, fail):
    """what a server answers for the pages and the big files of the build"""
    checks = 0
    for path in ("/", "/play", "/mapmaker", "/asset_catalog/", "/index.js", "/index.wasm", "/index.data", "/lvl_core.wasm", "/site_hooks.js", "/front/mapmaker.css"):
        status, headers, _ = fetch(address, path)
        checks += 3
        if status != 200:
            fail("GET %s answered %d" % (path, status))
            continue
        if headers.get("Cache-Control") != REVALIDATED:
            fail("GET %s: Cache-Control is %r, not %r (AGENTS.md rule 6)" % (path, headers.get("Cache-Control"), REVALIDATED))
        if headers.get("Cross-Origin-Opener-Policy") != "same-origin" or headers.get("Cross-Origin-Embedder-Policy") != "require-corp":
            fail("GET %s: the isolation headers are not there" % path)
    status, headers, body = fetch(address, "/index.wasm")
    checks += 1
    if status == 200 and not body.startswith(b"\0asm"):
        fail("GET /index.wasm is not a WebAssembly file")
    status, _, body = fetch(address, "/maps/all")
    checks += 1
    if status != 200 or b'"TINY.LVL"' not in body:
        fail("GET /maps/all did not list the original maps (status %d)" % status)
    status, _, body = fetch(address, "/maps/files/TINY.LVL")
    checks += 1
    original = os.path.join(REPO, "Original-Ants", "Maps", "TINY.LVL")
    if status != 200 or (os.path.isfile(original) and body != open(original, "rb").read()):
        fail("GET /maps/files/TINY.LVL is not the file of Original-Ants/Maps (status %d)" % status)
    checks += 1
    if fetch(address, "/nothing-is-here")[0] != 404:
        fail("an address that is no page is not a 404")
    return checks


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("dist")
    ap.add_argument("--web")
    args = ap.parse_args(argv)
    failures = []
    checks = files(os.path.abspath(args.dist), failures.append)
    if args.web:
        checks += routes(args.web, failures.append)
    for line in failures:
        print("FAIL: " + line)
    if failures:
        return 1
    print("ok: %d checks" % checks)
    return 0


if __name__ == "__main__":
    sys.exit(main())
