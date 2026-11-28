#!/usr/bin/env python3
"""The pages of the site write every date and time through web/local_time.js (docs/PLAY_IN_BROWSER.md "Dates and times"; the formatter and its mutants are held by tests/scripts/test_web_local_time.py): the
visitor's own zone on a 12-hour clock. Here, the part that needs the site's files (run by ./run_tests.sh --fast and the CI):

  - every page that has a script that calls the formatter (the bar's, the history pages', the front page's chat and helpers, the admin page's, the Map Maker's screens for sending a map and for an AI)
    loads web/local_time.js ONCE, BEFORE that script, with the site's hooks written into the game page and the Map Maker as a browser meets them (tests/scripts/site_pages.py): a page without it would
    fail where it first writes a time;
  - a script that is loaded later by another (the front page's chat, helper and name sheet by home.js, the Map Maker's two screens by its site part) has the page of its loader load it;
  - the pages that carry the build's stamp write it through the bar's script or the formatter, never as the Pacific text that the build made;
  - no script or page writes a clock of its own: the defect that the formatter removed (a page with its own 24-hour clock, UTC or a fixed zone), so that a new page cannot bring it back.
"""
import os
import re
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import site_pages  # noqa: E402  (the pages as a browser sees them once the site's hooks have written their tags)

REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
SCRIPT_TAG = re.compile(r'<script\b[^>]*\bsrc="([^"]+)"')
LAZY = {"home/home.js": ["home/chat.js", "home/cmds.js", "home/names.js"], "mapmaker_site.js": ["front/mapmaker_submit.js", "front/mapmaker_ai.js"]}      # (a script that loads others when they are needed)


def read(*parts):
    with open(os.path.join(REPO, *parts), encoding="utf-8") as f:
        return f.read()


def uses_the_formatter(src):
    name = src.lstrip("/")
    if name == "local_time.js":
        return False                                                                # (the formatter itself)
    if any(name == k or name.endswith("/" + k) for k in LAZY):
        return any(uses_the_formatter(x) for x in LAZY[next(k for k in LAZY if name == k or name.endswith("/" + k))])
    path = os.path.join(REPO, "web", *name.split("?")[0].split("/"))
    if not os.path.isfile(path):
        return False
    with open(path, encoding="utf-8") as f:
        return "AntsTime" in f.read()


def pages():
    """{name: the page's text as a browser has it}"""
    sys.path.insert(0, os.path.join(REPO, "tools"))
    try:
        import changelog_to_html
    finally:
        sys.path.pop(0)
    out = {name: read("web", name + ".html") for name in ("matches", "match", "legal", "admin", "lobby")}
    out["map page"] = read("web", "map_pages", "page.html")
    out["game page"] = site_pages.expanded("web", "shell.html")
    out["Map Maker"] = site_pages.expanded("web", "mapmaker.html")
    out["changelog"] = changelog_to_html.convert(read("CHANGELOG.md"), changelog_to_html.DEFAULT_REPO_BLOB, version="v1.2.3", build_id="abc1234", build_date="2026-01-02 09:30 PT")
    return out


class EveryPageLoadsTheFormatterBeforeWhatUsesIt(unittest.TestCase):
    def test_the_formatter_is_loaded_once_and_before_every_script_that_calls_it(self):
        for name, page in pages().items():
            with self.subTest(name):
                sources = SCRIPT_TAG.findall(page)
                mine = [i for i, s in enumerate(sources) if s.lstrip("/") == "local_time.js"]
                users = [i for i, s in enumerate(sources) if uses_the_formatter(s)]
                if "AntsTime" in re.sub(r"<script\b[^>]*\bsrc=[^>]*></script>", "", page):
                    users.append(len(sources))                                  # (the page's own code calls it: it is loaded at some place)
                self.assertTrue(users, "no script of this page calls the formatter: the page does not need it")
                self.assertEqual(len(mine), 1, "the formatter is loaded once")
                self.assertLess(mine[0], min(users), "the formatter comes before the first script that calls it: %s" % [sources[i] if i < len(sources) else "(the page's own code)" for i in users])

    def test_a_page_that_calls_the_formatter_in_its_own_code_loads_it_before_that_code(self):
        for name in ("lobby", "matches", "match"):
            page = read("web", name + ".html")
            own = [m for m in re.finditer(r"<script>(.*?)</script>", page, re.S) if "AntsTime" in m.group(1)]
            self.assertTrue(own, name)
            self.assertLess(page.index('<script src="local_time.js"></script>'), own[0].start(), name)

    def test_the_bar_and_the_footers_write_the_build_stamp_through_the_formatter(self):
        self.assertIn("AntsTime.stampText", read("web", "site_nav.js"))
        for name in ("lobby", "shell"):
            self.assertIn("AntsTime.stampNode(", read("web", name + ".html"), name)


class NoPageIsLeftOutOfTheCheck(unittest.TestCase):
    def test_every_script_that_calls_the_formatter_is_loaded_by_a_page_that_has_been_checked(self):
        """a script that calls AntsTime and that no checked page loads (a new page, a new script) is named here, so that its page is added to the list above"""
        loaded = set()
        for page in pages().values():
            loaded.update(s.lstrip("/").split("?")[0] for s in SCRIPT_TAG.findall(page))
        for k, lazy in LAZY.items():
            if k in loaded:
                loaded.update(lazy)
        mine = []
        for base, _, names in os.walk(os.path.join(REPO, "web")):
            for name in names:
                path = os.path.join(base, name)
                rel = os.path.relpath(path, os.path.join(REPO, "web")).replace(os.sep, "/")
                if name.endswith(".js") and not rel.startswith("app/") and rel != "local_time.js":
                    with open(path, encoding="utf-8", errors="replace") as f:
                        if "AntsTime" in f.read():
                            mine.append(rel)
        self.assertEqual(sorted(set(mine) - loaded), [], "a script that calls AntsTime is loaded by no page of the list")


class NoPageWritesAClockOfItsOwn(unittest.TestCase):
    """The defect: a page that writes its own time (a 24-hour clock, UTC, a zone that is fixed, or the device's language) instead of web/local_time.js, as the admin page (Pacific, 24 hours), the chat
    (the device's own hours) and the pages of the Map Maker did. A new page that does it fails here."""
    OWN = re.compile(r"getHours|getUTCHours|getMinutes|toLocaleTimeString|toLocaleDateString|Intl\.DateTimeFormat|toTimeString|toDateString|toUTCString|toISOString|getTimezoneOffset|timeZone")
    ALLOWED = {"web/local_time.js": "the one place",
               "web/admin_analytics.js": "the counter's days are Pacific days (a day is a sum that the hub made for a Pacific day): this file names the zone of the days, not of a moment"}

    def test_no_script_or_page_of_the_site_has_a_clock_of_its_own(self):
        found = []
        for base, _, names in os.walk(os.path.join(REPO, "web")):
            for name in names:
                path = os.path.join(base, name)
                rel = os.path.relpath(path, REPO).replace(os.sep, "/")
                if not name.endswith((".js", ".html")) or rel.startswith("web/app/") or rel in self.ALLOWED:
                    continue
                with open(path, encoding="utf-8", errors="replace") as f:
                    text = f.read()
                code = re.sub(r"(?m)^\s*//.*$|(?<![:'\"])//\s.*$", "", text)             # (a comment may say it)
                for hit in self.OWN.finditer(code):
                    found.append("%s: %s" % (rel, hit.group(0)))
        self.assertEqual(found, [], "a page writes a time itself: use web/local_time.js (AntsTime)")

    def test_the_one_zone_that_is_named_is_the_counters_days(self):
        text = read("web", "admin_analytics.js") if os.path.exists(os.path.join(REPO, "web", "admin_analytics.js")) else ""
        if text:
            self.assertEqual(len(re.findall(r"timeZone", text)), 1, "the Pacific day of a moment is the only use of a zone")
            self.assertNotRegex(text, r"hourCycle|hour12|hour: ", "no clock is written here")


if __name__ == "__main__":
    unittest.main()
