#!/usr/bin/env python3
"""The public web build (build_web.sh), its check (ci/web_check.sh, tests/scripts/web_dist_check.py) and its server (tools/serve_web.py) run together on a tree of the public files only: run by
./run_tests.sh --fast and the CI.

Emscripten is stood in for (a folder of three small programs on the PATH makes the files that CMake and the linker would make), so that the quick tier runs the real script in a few seconds; the CI's Web
check runs it with the real compiler. The tree is a copy of what the public repository has (export/classify.py --list public, else every file of this tree), reduced to what the build reads, so a build that
copies a file of a site stops where the copy fails. What is held:
  - the build works on that tree, writes the game page (also as play.html), the Map Maker, the catalog, the map core's API and the atlas, with the version, the build and the address stamped in and no
    placeholder left, and a stamps file for a build that adds to it;
  - the seam: dist/site_hooks.js is the stub of the tree, byte for byte, and no other file of a site is in dist/;
  - the check (web_dist_check.py), run through ci/web_check.sh, passes on the build and fails on a build that lost a file or that a server answers wrongly.
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
import test_web_seam as seam  # noqa: E402  (which files the public repository has)

# What the build reads, and nothing more of the tree (the folders are copied whole, the files one by one)
FOLDERS = ("web",)
FILES = ("build_web.sh", "VERSION", "docker/resolve_build_id.sh", "asset_catalog/index.html", "asset_catalog/catalog_data.js", "tools/serve_web.py", "tests/scripts/web_dist_check.py", "tests/scripts/test_web_seam.py",
         "Original-Ants/Maps/TINY.LVL", "Original-Ants/Maps/SMALL.LVL", "Original-Ants/Maps/MEDIUM.LVL", "Original-Ants/Maps/GAUNTLET.LVL", "Original-Ants/Maps/TREASURE.LVL", "Original-Ants/Maps/ISLANDS.LVL")
CHECK_SCRIPT = ("export/overlay/ci/web_check.sh", "ci/web_check.sh")      # (where the tree that has export/ keeps it, where the public repository has it)
FAKE_ATLAS = '''import os, sys
os.makedirs(sys.argv[1], exist_ok=True)
for name in ("atlas.json", "ground.png", "objects.png"):
    open(os.path.join(sys.argv[1], name), "wb").write(b"made-up " + name.encode())
'''
# `emcmake cmake -B DIR ...` writes the files that the build of the game leaves in DIR (the page is the template of the game page: the real build puts the program's script in it)
FAKE_EMCMAKE = '''#!/bin/sh
shift
while [ $# -gt 0 ]; do if [ "$1" = "-B" ]; then B="$2"; shift; fi; shift; done
mkdir -p "$B/src/ants_app" "$B/lvl_core"
cp web/shell.html "$B/src/ants_app/index.html"
printf 'js' > "$B/src/ants_app/index.js"
printf '\\000asm made-up program' > "$B/src/ants_app/index.wasm"
printf 'data' > "$B/src/ants_app/index.data"
printf 'js' > "$B/lvl_core/lvl_core.js"
printf '\\000asm made-up core' > "$B/lvl_core/lvl_core.wasm"
'''


def read(path):
    with open(path, encoding="utf-8", errors="replace") as f:
        return f.read()


def public_tree(dest):
    """a tree of the files that the build reads, from the public files of this one"""
    public = seam.public_files()
    wanted = []
    for folder in FOLDERS:
        for root, _, names in os.walk(os.path.join(REPO, folder)):
            wanted += [os.path.relpath(os.path.join(root, n), REPO).replace(os.sep, "/") for n in names]
    wanted += FILES
    for rel in sorted(wanted):
        if public is not None and rel not in public:
            continue
        target = os.path.join(dest, rel)
        os.makedirs(os.path.dirname(target), exist_ok=True)
        shutil.copy2(os.path.join(REPO, rel), target)
    for candidate in CHECK_SCRIPT:
        if os.path.isfile(os.path.join(REPO, candidate)):
            os.makedirs(os.path.join(dest, "ci"), exist_ok=True)
            shutil.copy2(os.path.join(REPO, candidate), os.path.join(dest, CHECK_SCRIPT[1]))
            break
    os.makedirs(os.path.join(dest, "tools"), exist_ok=True)
    with open(os.path.join(dest, "tools", "map_atlas.py"), "w") as f:
        f.write(FAKE_ATLAS)


def fake_emscripten(folder):
    os.makedirs(folder, exist_ok=True)
    for name, text in (("emcmake", FAKE_EMCMAKE), ("emcc", "#!/bin/sh\nexit 0\n"), ("cmake", "#!/bin/sh\nexit 0\n")):
        path = os.path.join(folder, name)
        with open(path, "w") as f:
            f.write(text)
        os.chmod(path, os.stat(path).st_mode | stat.S_IXUSR)


class TheBuild(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.TemporaryDirectory()
        cls.tree = os.path.join(cls.tmp.name, "tree")
        cls.bin = os.path.join(cls.tmp.name, "bin")
        public_tree(cls.tree)
        fake_emscripten(cls.bin)
        cls.env = dict(os.environ, PATH=cls.bin + os.pathsep + os.environ["PATH"], ANTS_BUILD_ID="testbuild", HOME=cls.tmp.name)
        cls.env.pop("EMSDK", None)
        cls.built = subprocess.run(["bash", "build_web.sh"], cwd=cls.tree, env=cls.env, capture_output=True, text=True, timeout=300)
        cls.dist = os.path.join(cls.tree, "dist")

    @classmethod
    def tearDownClass(cls):
        cls.tmp.cleanup()

    def test_the_build_works_on_the_public_files_alone(self):
        self.assertEqual(self.built.returncode, 0, self.built.stdout + self.built.stderr)

    def test_the_game_page_is_stamped_and_is_also_play_html(self):
        text = read(os.path.join(self.dist, "index.html"))
        self.assertEqual(sorted(set(re.findall(r"@@\w+@@", text))), ["@@BUILD_TIMESTAMP@@", "@@DATA_SIZE@@"], "the two that a build outside an image leaves")
        self.assertIn("v" + read(os.path.join(REPO, "VERSION")).split()[0], text)
        self.assertIn("testbuild", text)
        self.assertEqual(text, read(os.path.join(self.dist, "play.html")))

    def test_the_map_maker_is_stamped_and_the_catalog_and_the_atlas_are_there(self):
        self.assertNotIn("@@", read(os.path.join(self.dist, "mapmaker.html")))
        for name in ("lvl_core.js", "lvl_core.wasm", "lvl_core_api.js", "mapmaker_atlas/atlas.json", "asset_catalog/index.html", "asset_catalog/catalog_data.js", "front/mapmaker_app.js", "manifest.webmanifest"):
            self.assertTrue(os.path.isfile(os.path.join(self.dist, name)), name)
        self.assertEqual(read(os.path.join(self.dist, "asset_catalog", "index.html")), read(os.path.join(REPO, "asset_catalog", "index.html")))

    def test_the_stamps_are_left_for_a_build_that_adds_to_this_one(self):
        stamps = read(os.path.join(self.tree, "build_web", "stamps.sh"))
        shell = subprocess.run(["sh", "-c", ". build_web/stamps.sh && echo \"$GAME_VERSION|$BUILD_ID|$BUILD_DATE|$SITE_ORIGIN\""], cwd=self.tree, capture_output=True, text=True)
        version, build, date, origin = shell.stdout.strip().split("|")
        self.assertEqual((version, build), ("v" + read(os.path.join(REPO, "VERSION")).split()[0], "testbuild"), stamps)
        self.assertTrue(date.endswith(" PT") and origin.startswith("http"), shell.stdout)

    def test_the_seam_is_the_stub_and_no_page_or_script_of_a_site_is_in_the_folder(self):
        with open(os.path.join(self.dist, "site_hooks.js"), "rb") as built, open(os.path.join(self.tree, "web", "site_hooks.js"), "rb") as stub:
            self.assertEqual(built.read(), stub.read())
        top = sorted(n for n in os.listdir(self.dist) if os.path.isfile(os.path.join(self.dist, n)))
        # what is in the folder is what the public tree has: a file of web/ that the public tree has not made the build fail where it was copied (the tree has the public files only)
        for name in top:
            if name in ("index.js", "index.wasm", "index.data", "index.html", "play.html", "mapmaker.html", "lvl_core.js", "lvl_core.wasm"):
                continue
            self.assertTrue(os.path.isfile(os.path.join(self.tree, "web", name)), name + " is in dist/ and is no file of web/")
        self.assertFalse(os.path.exists(os.path.join(self.dist, "serve_web.json")), "the folder names no front page: the game page is the front")


class TheCheck(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.TemporaryDirectory()
        cls.tree = os.path.join(cls.tmp.name, "tree")
        cls.bin = os.path.join(cls.tmp.name, "bin")
        public_tree(cls.tree)
        fake_emscripten(cls.bin)
        cls.env = dict(os.environ, PATH=cls.bin + os.pathsep + os.environ["PATH"], ANTS_BUILD_ID="testbuild", HOME=cls.tmp.name)
        cls.env.pop("EMSDK", None)

    @classmethod
    def tearDownClass(cls):
        cls.tmp.cleanup()

    def run_check(self, *phases):
        return subprocess.run(["bash", "ci/web_check.sh"] + list(phases), cwd=self.tree, env=self.env, capture_output=True, text=True, timeout=300)

    def test_the_build_and_the_check_pass_and_a_lost_file_or_a_wrong_header_fails_the_check(self):
        done = self.run_check("build", "check")
        self.assertEqual(done.returncode, 0, done.stdout + done.stderr)
        self.assertRegex(done.stdout, r"ok: \d+ checks")
        dist = os.path.join(self.tree, "dist")
        lost = os.path.join(dist, "front", "mapmaker_app.js")
        shutil.move(lost, lost + ".away")
        failed = self.run_check("check")
        self.assertEqual(failed.returncode, 1, failed.stdout + failed.stderr)
        self.assertIn("mapmaker_app.js", failed.stdout)
        shutil.move(lost + ".away", lost)
        with open(os.path.join(dist, "index.html"), "a") as f:
            f.write("<!-- @@GAME_VERSION@@ -->")
        failed = self.run_check("check")
        self.assertEqual(failed.returncode, 1, failed.stdout + failed.stderr)
        self.assertIn("placeholder", failed.stdout)

    def test_a_word_that_is_no_phase_and_a_folder_that_is_no_tree_are_refused_with_status_2(self):
        self.assertEqual(self.run_check("deploy").returncode, 2)
        with tempfile.TemporaryDirectory() as empty:
            done = subprocess.run(["bash", os.path.join(self.tree, "ci", "web_check.sh")], cwd=empty, capture_output=True, text=True)
            self.assertEqual(done.returncode, 2, done.stdout + done.stderr)


class TheCheckAsksTheServer(unittest.TestCase):
    def test_a_server_that_does_not_revalidate_fails_the_check(self):
        with tempfile.TemporaryDirectory() as tmp:
            tree = os.path.join(tmp, "tree")
            public_tree(tree)
            fake_emscripten(os.path.join(tmp, "bin"))
            env = dict(os.environ, PATH=os.path.join(tmp, "bin") + os.pathsep + os.environ["PATH"], ANTS_BUILD_ID="testbuild", HOME=tmp)
            self.assertEqual(subprocess.run(["bash", "build_web.sh"], cwd=tree, env=env, capture_output=True, text=True).returncode, 0)
            asking = [sys.executable, "tools/serve_web.py", "--dist", "dist", "--port", "0", "--", "sh", "-c", 'python3 tests/scripts/web_dist_check.py dist --web "$ANTS_WEB_URL"']
            done = subprocess.run(asking, cwd=tree, capture_output=True, text=True)
            self.assertEqual(done.returncode, 0, done.stdout + done.stderr)
            path = os.path.join(tree, "tools", "serve_web.py")           # (a server that has lost the rule of AGENTS.md rule 6: it revalidates nothing)
            text = read(path)
            self.assertIn('REVALIDATED = (".html"', text)
            with open(path, "w") as f:
                f.write(text.replace('REVALIDATED = (".html", ".js", ".css", ".wasm", ".data")', "REVALIDATED = ()"))
            done = subprocess.run(asking, cwd=tree, capture_output=True, text=True)
            self.assertNotEqual(done.returncode, 0, done.stdout + done.stderr)
            self.assertIn("Cache-Control", done.stdout)


if __name__ == "__main__":
    unittest.main()
