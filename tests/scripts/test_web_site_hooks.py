#!/usr/bin/env python3
"""The site's half of the seam between the pages of the game and the site (web/site/site_hooks.js and web/site/mapmaker_site.js; docs/PLAY_IN_BROWSER.md "The seam to a site"): run by ./run_tests.sh --fast and by the CI.

The pages carry the stub's tag (web/site_hooks.js: tests/scripts/test_web_seam.py runs the pages with that alone); the image serves the site's own file in its place. What this holds the site's half to:
  - the lists of what each page loads of the site are what the pages loaded before the seam, in the same order (the game page: the bar's style and script, the counter, the hub's socket, the history, the map of
    deaths and the activity curve; the Map Maker: the bar's style and script and the counter; the catalog: the bar's style and script), every file of them is in web/ and in the image, and a page that has the
    hooks names one of the lists;
  - the image serves web/site/ at the root of the site (so its site_hooks.js is the one that a page gets) and never the stub; the local web build copies the stub and then web/site/, the CI lists both files;
  - the code RUNS in node (tests/scripts/web_site_hooks_check.js): the tags that a page gets in its head and at its end, the hooks of the game page, the Map Maker's buttons, actions, menu lines and loading;
  - the tests of the scripts that the hooks load (hub, counter, history, deaths, activity, plays, statistics) read those scripts and the pages as the browser builds them (tests/scripts/site_pages.py);
  - tests/data/web_site_hooks_mutants.json changes one thing at a time in a COPY of the files: the node check must then fail (the last class of this file; tools/mutate.py runs the same list).
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
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import site_pages  # noqa: E402
from test_web_wake_lock import location_of  # noqa: E402  (nginx's choice of a location: the one place of this helper)

CHECK = os.path.join(REPO, "tests", "scripts", "web_site_hooks_check.js")
COMMAND = "node tests/scripts/web_site_hooks_check.js web/site/site_hooks.js web/site/mapmaker_site.js web/site_hooks.js"
NODE = shutil.which("node")


def read(*parts):
    with open(os.path.join(REPO, *parts), encoding="utf-8") as f:
        return f.read()


class ThePagesAndTheLists(unittest.TestCase):
    def test_what_each_page_loads_of_the_site_is_what_it_loaded_before_the_seam(self):
        pages = site_pages.pages()
        self.assertEqual(pages["play"]["styles"], ["site_nav.css", "replay_stats.css", "death_map.css", "replay_activity.css"])
        self.assertEqual(pages["play"]["scripts"], ["site_nav.js", "analytics.js", "hub_here.js", "history_page.js", "death_map.js", "replay_activity.js"])
        self.assertEqual(pages["mapmaker"]["styles"], ["/site_nav.css"])
        self.assertEqual(pages["mapmaker"]["scripts"], ["site_nav.js", "analytics.js", "mapmaker_site.js"])
        self.assertEqual(pages["catalog"], {"styles": ["/site_nav.css"], "scripts": ["/site_nav.js"]})
        self.assertEqual(sorted(pages), ["catalog", "mapmaker", "play"])

    def test_a_page_with_the_hooks_names_a_list_loads_the_bar_once_and_its_script_after_its_markup(self):
        for page in (("web", "shell.html"), ("web", "mapmaker.html"), ("asset_catalog", "index.html")):
            loaded = site_pages.expanded(*page)                                                  # (asserts the two tags and the one name)
            name = re.search(r'data-page="([a-z]+)"', read(*page)).group(1)
            self.assertIn(name, site_pages.pages(), "/".join(page))
            self.assertEqual(len(re.findall(r'href="/?site_nav\.css"', loaded)), 1, page)
            self.assertEqual(len(re.findall(r'src="/?site_nav\.js"', loaded)), 1, page)
            self.assertLess(loaded.index('<header class="sb"'), loaded.index("site_nav.js"), "the bar's script comes after the bar: " + "/".join(page))
            self.assertLess(loaded.index("site_nav.css"), loaded.index("</head>"), page)
        mapmaker = site_pages.expanded("web", "mapmaker.html")
        self.assertLess(mapmaker.index("mapmaker_site.js"), mapmaker.index("front/mapmaker_app.js"), "the Map Maker's part is there before the page starts (the page's start is asynchronous, but not slower than a script)")
        self.assertLess(mapmaker.index("mapmaker_site.js"), mapmaker.index("lvl_core.js"))

    def test_every_file_of_the_lists_is_a_file_of_web_or_of_the_site_folder_and_copied_into_the_image(self):
        dockerfile, build, ci = read("Dockerfile"), read("build_web.sh"), read(".github", "workflows", "ci.yml")
        for page, lists in site_pages.pages().items():
            for url in lists["styles"] + lists["scripts"]:
                name = url.lstrip("/")
                in_site = os.path.isfile(os.path.join(REPO, "web", "site", name)) and not os.path.isfile(os.path.join(REPO, "web", name))
                self.assertTrue(os.path.isfile(os.path.join(REPO, "web", "site" if in_site else "", name)), "%s: %s is not a file of web/" % (page, name))
                self.assertRegex(dockerfile, r"(?m)^COPY web/%s " % re.escape(name) if not in_site else r"(?m)^COPY web/site/ /usr/share/nginx/html/$", "%s: %s is not copied into the image" % (page, name))
                self.assertRegex(ci, r"ls -l [^\n]*\b%s\b" % re.escape(name), "%s: %s is not in the CI's check of the image" % (page, name))

    def test_the_image_serves_the_site_folder_at_the_root_and_never_the_stub_and_the_local_build_copies_both(self):
        dockerfile, build, ci = read("Dockerfile"), read("build_web.sh"), read(".github", "workflows", "ci.yml")
        self.assertEqual(dockerfile.count("COPY web/site/ /usr/share/nginx/html/\n"), 1)
        self.assertEqual(re.findall(r"(?m)^(?:COPY|ADD) [^\n]*site_hooks[^\n]*", dockerfile), [], "the image serves the site's own file in the stub's place: no step copies the stub")
        self.assertLess(build.index('web/site_hooks.js" "${DIST_DIR}/"'), build.index('"${SCRIPT_DIR}/web/site"/* "${DIST_DIR}/"'), "the site's folder is copied after the stub: its file replaces it")
        self.assertIn('if [ -d "${SCRIPT_DIR}/web/site" ]; then', build)
        self.assertRegex(ci, r"ls -l [^\n]*\bsite_hooks\.js mapmaker_site\.js\b")

    def test_nginx_serves_the_hooks_by_the_rule_for_scripts_that_revalidates(self):
        for name in ("/site_hooks.js", "/mapmaker_site.js"):
            words, body = location_of(re.sub(r"(?m)#.*$", "", read("docker", "nginx.conf")), name)
            self.assertIsNotNone(words, name)
            self.assertIn('add_header Cache-Control "no-cache, must-revalidate" always;', body, "the location %s" % words)
            self.assertNotIn("expires", body)


class TheFrameModeStyle(unittest.TestCase):
    def test_the_stats_stylesheet_has_the_frame_mode_of_the_game_page(self):
        css = read("web", "replay_stats.css")                                                    # (its own stylesheet: the game page may not grow, tools/check_hygiene.py)
        self.assertIn("replay_stats.css", site_pages.pages()["play"]["styles"])
        self.assertEqual(css.count("body.embed header, body.embed #mobile-tip-banner, body.embed .mstats, body.embed #stats-btn { display: none !important; }"), 1)
        self.assertEqual(css.count("body.embed::after { content: none; }"), 1)                  # (the page's own frame line: the match page has its own)
        self.assertEqual(css.count("body.embed { padding-top: 10px; padding-left: 12px; padding-right: 12px; --side: 12px; }"), 1)


class TheMapMakerPartIsWhatThePageDidBefore(unittest.TestCase):
    """the wiring that mapmaker_app.js had before the seam for the buttons "Connect an AI..." and "Submit for approval...", My submissions and the script that sends maps, now in web/site/mapmaker_site.js"""
    site = read("web", "site", "mapmaker_site.js")
    app = read("web", "front", "mapmaker_app.js")
    page = read("web", "mapmaker.html")

    def test_the_page_has_no_button_for_them_and_names_none_of_their_files(self):
        for name in ("mapmaker_submit.js", "mapmaker_ai.js", "mapmaker_ai_tools.js", "mapmaker_ai.css", "MapSubmit", "MapAi", "createSent"):
            self.assertNotIn(name, self.app, name)
        for text in ('data-act="ai"', 'data-act="submit"', "Connect an AI", "mapmaker_submit", "mapmaker_ai"):
            self.assertNotIn(text, self.page, text)

    def test_the_site_part_has_the_buttons_the_actions_and_the_menu_lines_the_page_had(self):
        self.assertRegex(self.site, r'<button class="btn sm" type="button" data-act="submit" disabled>Submit for approval\.\.\.</button>')
        self.assertIn("tag.src = 'front/mapmaker_submit.js';", self.site)
        self.assertIn("ACTIONS.submit = function () { if (!dialogs.isOpen() && !canvas.isStroking()) submitOr(function () { sent.open(); }); };", self.site)
        self.assertIn("page.menu.push({ text: 'Connect an AI...', onClick: ACTIONS.ai }, { text: 'Submit for approval...', onClick: ACTIONS.submit }, { text: 'My submissions', onClick: ACTIONS.subs });", self.site, "the phone's Menu has all three")
        # the bytes that are sent are the bytes the dialog judged: the dialog takes both from one answer of the page
        self.assertIn("return { name: map().name, bytes: made.bytes, file: file, report: r.json };", self.site)
        # a status link keeps the token in the fragment, never in a request line; the address loses it once it is taken in
        self.assertIn("win.history.replaceState(null, '', win.location.pathname + win.location.search)", self.site)
        self.assertIn("if (/^#sent=/.test(win.location.hash)) withSubmit(function () {});", self.site)

    def test_the_menu_of_a_phone_has_the_lines_in_the_order_of_the_markup_and_the_page_lets_a_site_add_them_after_download(self):
        self.assertRegex(self.app, r"\{ text: 'Download', onClick: download \}\]\.concat\(siteMenu, \[\{ text: '\\u25b6 Play this map',")
        self.assertIn("mineEnvironment.sent = x || null; mine.tabs();", self.app, "My maps gets the player's submissions from the site's part")
        self.assertNotIn("sent: sentProxy()", self.app)

    def test_the_rules_word_is_given_by_the_ais_new_map_by_the_pages_rule_and_never_by_what_sends_a_map(self):
        self.assertEqual(self.site.count("withLongOrders"), 1)
        self.assertIn("page.setMap(page.withLongOrders(made.bytes), name)", self.site, "the AI's tool new_map makes a map by the same rule as New map (the person's unsaved work was kept first)")
        start = self.site.index("function submitEnv(")
        self.assertNotIn("LongOrders", self.site[start:self.site.index("\n        }\n", start)], "what sends a map never changes the rules word of one")

    def test_the_page_keeps_the_checks_of_the_core_that_it_had_and_the_site_part_has_its_own(self):
        self.assertEqual(self.app.count("core.checkMap("), 5, "the open map's three and the two of My maps: the one of Submit for approval is the site's part's now")
        self.assertEqual(self.site.count("core.checkMap("), 1, "the bytes that are sent are the bytes that were judged")


@unittest.skipUnless(NODE, "node is not installed: the site's half of the seam was NOT run (tests/scripts/web_site_hooks_check.js)")
class TheCodeRuns(unittest.TestCase):
    def test_the_tags_the_hooks_the_buttons_the_actions_and_the_loading(self):
        done = subprocess.run([NODE] + COMMAND.split()[1:], capture_output=True, text=True, timeout=120, cwd=REPO)
        self.assertEqual(done.returncode, 0, done.stdout[-4000:] + done.stderr[-2000:])
        self.assertRegex(done.stdout, r"ok: \d+ checks")


@unittest.skipUnless(NODE, "node is not installed: the mutants of the site's half of the seam were NOT run")
class TheChecksAreNotVacuous(unittest.TestCase):
    """the mutants of tests/data/web_site_hooks_mutants.json (the list that tools/mutate.py runs too, with `--keep-going --jobs 1`) on a COPY of the files, one at a time: each must make the check fail, and the
    copy with nothing changed must pass"""
    FILES = ["web/site/site_hooks.js", "web/site/mapmaker_site.js", "web/site_hooks.js", "tests/scripts/web_site_hooks_check.js"]

    @classmethod
    def setUpClass(cls):
        with open(os.path.join(REPO, "tests", "data", "web_site_hooks_mutants.json"), encoding="utf-8") as f:
            cls.spec = json.load(f)
        cls.folder = tempfile.mkdtemp(prefix="ants_site_hooks_mutants.")
        for name in cls.FILES:
            os.makedirs(os.path.dirname(os.path.join(cls.folder, *name.split("/"))), exist_ok=True)
            shutil.copy(os.path.join(REPO, *name.split("/")), os.path.join(cls.folder, *name.split("/")))

    @classmethod
    def tearDownClass(cls):
        shutil.rmtree(cls.folder, ignore_errors=True)

    def run_command(self, command):
        done = subprocess.run(command, shell=True, cwd=self.folder, capture_output=True, text=True, timeout=300)
        return done.returncode, done.stdout + done.stderr

    def test_the_list_is_the_one_of_the_check(self):
        self.assertEqual({m["test"] for m in self.spec["mutants"]} | {self.spec["baseline"]["test"]}, {COMMAND})

    def test_the_copy_with_nothing_changed_passes(self):
        status, out = self.run_command(COMMAND)
        self.assertEqual(status, 0, out[-3000:])

    def test_every_mutant_is_seen(self):
        ids = [m["id"] for m in self.spec["mutants"]]
        self.assertEqual(len(ids), len(set(ids)), "an id twice")
        self.assertGreaterEqual(len(ids), 8)
        missed = []
        for m in self.spec["mutants"]:
            path = os.path.join(self.folder, *m["file"].split("/"))
            with open(path, encoding="utf-8", newline="") as f:
                text = f.read()
            self.assertEqual(text.count(m["old"]), 1, "%s: %r is not in %s exactly once" % (m["id"], m["old"][:60], m["file"]))
            try:
                with open(path, "w", encoding="utf-8", newline="") as f:
                    f.write(text.replace(m["old"], m["new"]))
                status, _ = self.run_command(m["test"])
            finally:
                with open(path, "w", encoding="utf-8", newline="") as f:
                    f.write(text)
            if status == 0:
                missed.append(m["id"])
        self.assertEqual(missed, [], "the check did not see these changes")


if __name__ == "__main__":
    unittest.main()
