#!/usr/bin/env python3
"""Every date and time that a page shows is the VISITOR'S: in the zone of the visitor's browser, on a 12-hour clock with AM or PM, whatever the maintainer's zone or the device's own clock says (run by
./run_tests.sh --fast and the CI). One file writes them all, web/local_time.js (docs/PLAY_IN_BROWSER.md "Dates and times"); what is checked here:

  - the formatter RUNS (node: tests/scripts/web_local_time_check.js) in seven zones (Pacific, New York, Berlin, Kolkata, Tokyo, Auckland, UTC): the same moments as the zone's own rules give them, 12 AM and
    12 PM, the day words through the days when the clocks change, the build's Pacific stamp, the times of a schedule that a server keeps; and with a German language and a 24-hour clock on the machine;
  - every broken copy of it is noticed (tests/data/local_time_mutants.json, run on copies of the script);
  - the game page loads it before its own code, and the image, the CI's listing and the web build carry it;
The pages of the site that load it, and the scan that no page of the site writes a clock of its own, are held by tests/scripts/test_web_local_time_pages.py.
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
SCRIPT = os.path.join(REPO, "web", "local_time.js")
CHECK = os.path.join(REPO, "tests", "scripts", "web_local_time_check.js")
NODE = shutil.which("node")
ZONES = ["America/Los_Angeles", "America/New_York", "Europe/Berlin", "Asia/Kolkata", "Asia/Tokyo", "Pacific/Auckland", "UTC"]


def read(*parts):
    with open(os.path.join(REPO, *parts), encoding="utf-8") as f:
        return f.read()


def run_check(script=SCRIPT, zone=None, env=None):
    command = [NODE, CHECK, script] + ([zone] if zone else [])
    return subprocess.run(command, capture_output=True, text=True, timeout=120, env=env)


@unittest.skipUnless(NODE, "node is not installed: the formatter of times was NOT run (tests/scripts/web_local_time_check.js)")
class TheFormatterRunsInEveryZone(unittest.TestCase):
    def test_every_zone_of_the_table_in_one_run(self):
        done = run_check()
        self.assertEqual(done.returncode, 0, done.stdout + done.stderr)
        for zone in ZONES:
            self.assertIn(zone, done.stdout)
        self.assertRegex(done.stdout, r"\d+ checks, 0 failed")

    def test_each_zone_on_its_own(self):
        for zone in ZONES:
            with self.subTest(zone):
                done = run_check(zone=zone)
                self.assertEqual(done.returncode, 0, done.stdout + done.stderr)

    def test_the_machines_own_language_zone_and_clock_change_nothing(self):
        # a machine in Berlin with a German 24-hour clock, and one in Tokyo: the words are the zone of the run's own (set by the check) on a 12-hour clock
        for locale, zone in (("de_DE.UTF-8", "Europe/Berlin"), ("ja_JP.UTF-8", "Asia/Tokyo"), ("fr_FR.UTF-8", "America/New_York")):
            with self.subTest(locale):
                env = dict(os.environ, LANG=locale, LC_ALL=locale, TZ=zone)
                done = run_check(env=env)
                self.assertEqual(done.returncode, 0, done.stdout + done.stderr)

    def test_a_zone_that_the_table_does_not_know_is_a_failure_not_a_silent_pass(self):
        done = run_check(zone="Mars/Olympus")
        self.assertNotEqual(done.returncode, 0)
        self.assertIn("not in the table", done.stdout)

    def test_the_check_needs_the_script(self):
        self.assertEqual(subprocess.run([NODE, CHECK], capture_output=True, text=True, timeout=60).returncode, 2)


@unittest.skipUnless(NODE, "node is not installed: the mutants of the formatter of times were NOT run")
class TheMutantsAreNoticed(unittest.TestCase):
    def test_each_broken_copy_of_the_formatter_fails_the_check(self):
        """tests/data/local_time_mutants.json (tools/mutate.py runs it too, with `--keep-going --jobs 1`): a clock of 24 hours, of UTC, of Pacific time or of the device's language, a day counted in 24 hours or
        in UTC, the day words and the year, a stamp through the two changes of the clocks, a time of the day that a server keeps"""
        with open(os.path.join(REPO, "tests", "data", "local_time_mutants.json"), encoding="utf-8") as f:
            spec = json.load(f)
        ids = [m["id"] for m in spec["mutants"]]
        self.assertEqual(len(ids), len(set(ids)), "an id twice")
        self.assertGreaterEqual(len(ids), 40)
        text = read("web", "local_time.js")
        with tempfile.TemporaryDirectory() as tmp:
            copy = os.path.join(tmp, "local_time.js")
            for m in spec["mutants"]:
                with self.subTest(m["id"]):
                    self.assertEqual(m["file"], "web/local_time.js")
                    self.assertEqual(text.count(m["old"]), 1, "%s: the text is not in the script exactly once" % m["id"])
                    with open(copy, "w", encoding="utf-8", newline="") as f:
                        f.write(text.replace(m["old"], m["new"]))
                    self.assertNotEqual(run_check(copy).returncode, 0, "the check did not notice: " + m["id"])


class TheGamePageAndTheImage(unittest.TestCase):
    def test_the_game_page_loads_it_once_before_the_scripts_and_the_code_that_use_it(self):
        page = read("web", "shell.html")
        tags = list(re.finditer(r'<script src="local_time\.js"></script>', page))
        self.assertEqual(len(tags), 1)
        for later in ('<script src="replay_page.js"></script>', '<script src="site_hooks.js" data-page="play"></script><script src="game_bar.js">', "var ANTS_BUILD_VER"):
            self.assertIn(later, page)
            self.assertLess(tags[0].start(), page.index(later), later)

    def test_the_image_the_ci_and_the_web_build_carry_the_script(self):
        self.assertIn("COPY web/local_time.js /usr/share/nginx/html/local_time.js", read("Dockerfile"))
        self.assertRegex(read(".github", "workflows", "ci.yml"), r"hud_fullscreen\.js wake_lock\.js local_time\.js p2p\.js")
        self.assertIn('web/local_time.js" "${DIST_DIR}/"', read("build_web.sh"))


if __name__ == "__main__":
    unittest.main()
