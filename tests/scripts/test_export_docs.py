#!/usr/bin/env python3
"""The root files and the documents of the public tree (export/README.md; the lists and the links are in test_export_lists.py).

  - the files that read differently in the public repository (README.md, AGENTS.md, SECURITY.md, .gitignore, .gitattributes, .github/CODEOWNERS, .github/dependabot.yml, docs/ARCHITECTURE.md):
    the working copy is private, the overlay holds the public version, which is exported under the working copy's name and is the only one of the two that is;
  - an overlay file names nothing private (the scan of words of check_export.py finds no line in it), and says what its working copy says where the public repository needs the same
    sentence: the policy file, the owners, the ignore and attribute lines that remain, the version line;
  - the public changelog has no paragraph for operators and no commit range of the working repository: the working repository's own changelog has them, one entry for each release;
  - the notices of the server's third-party code are in their own file, and the public notices name none of it;
  - tools/release.py moves the version line of the overlay README with the one of the README.
"""
import importlib.util
import os
import re
import subprocess
import sys
import tempfile
import unittest

REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
EXPORT = os.path.join(REPO, "export")
RELEASE = os.path.join(REPO, "tools", "release.py")
OVERLAY = "export/overlay/"
DIFFERENT = ("README.md", "AGENTS.md", "SECURITY.md", ".gitignore", ".gitattributes", ".github/CODEOWNERS", ".github/dependabot.yml", "docs/ARCHITECTURE.md")


def load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    sys.path.insert(0, os.path.dirname(path))
    spec.loader.exec_module(module)
    return module


classify = load("export_classify", os.path.join(EXPORT, "classify.py"))
check_export = load("export_check", os.path.join(EXPORT, "check_export.py"))


def read(*parts):
    with open(os.path.join(REPO, *parts), encoding="utf-8") as f:
        return f.read()


def lines_of(text):
    return [line.rstrip() for line in text.splitlines()]


class TheFilesThatReadDifferently(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.files = classify.tracked_files(REPO)
        cls.allow = classify.read_list(os.path.join(EXPORT, "allowlist.txt"))
        cls.private = classify.read_list(os.path.join(EXPORT, "private.txt"))
        cls.pub, cls.priv, _none, _both, _a, _p = classify.classify(cls.files, cls.allow, cls.private)
        cls.public_names = [classify.public_name(f) for f in cls.pub]

    def test_each_has_a_private_working_copy_and_a_public_version_in_the_overlay(self):
        for name in DIFFERENT:
            self.assertIn(name, self.files, name)
            self.assertIn(name, self.priv, "%s: the working copy stays private" % name)
            self.assertIn(OVERLAY + name, self.files, "%s: the public version" % name)
            self.assertIn(OVERLAY + name, self.pub, name)
            self.assertEqual(self.public_names.count(name), 1, "%s: exported once, from the overlay" % name)

    def test_an_overlay_file_names_nothing_private(self):
        for f in self.files:
            if f.startswith(OVERLAY) and f != OVERLAY + ".gitkeep":
                text = read(*f.split("/"))
                hits = [(n, k) for n, line in enumerate(text.splitlines(), 1) for k, rx in check_export.KINDS.items() if rx.search(line)]
                self.assertEqual(hits, [], f)

    def test_the_public_readme_and_the_working_one_name_the_same_version_as_the_file_VERSION(self):
        version = read("VERSION").strip()
        for path in ("README.md", OVERLAY + "README.md"):
            self.assertRegex(read(*path.split("/")), r"Current version:\s*\*{0,2}\s*v%s\b" % re.escape(version), path)

    def test_the_public_policy_is_the_same_kind_of_file(self):
        policy = read(OVERLAY + "SECURITY.md")
        self.assertIn("Report a vulnerability", policy)
        self.assertNotRegex(policy, r"[\w.+-]+@[\w-]+\.[\w.]+", "no address: a report goes through GitHub's private reporting")

    def test_the_public_owners_name_a_person_on_every_line_and_no_container_file(self):
        rules = [line.split() for line in read(OVERLAY + ".github", "CODEOWNERS").splitlines() if line.strip() and not line.startswith("#")]
        self.assertTrue(rules and all(len(r) >= 2 and all(who.startswith("@") for who in r[1:]) for r in rules), "every rule names a reviewer")
        self.assertIn("*", [r[0] for r in rules])
        self.assertEqual([r[0] for r in rules if "docker" in r[0].lower()], [])

    def test_the_public_dependabot_file_updates_actions_only(self):
        text = read(OVERLAY + ".github", "dependabot.yml")
        self.assertEqual(re.findall(r"package-ecosystem:\s*(\S+)", text), ["github-actions"])

    def test_the_public_ignore_and_attribute_files_only_drop_lines_and_reword_comments(self):
        for name in (".gitignore", ".gitattributes"):
            mine = {line for line in lines_of(read(name)) if line.strip() and not line.startswith("#")}
            theirs = [line for line in lines_of(read(OVERLAY + name)) if line.strip() and not line.startswith("#")]
            self.assertEqual([line for line in theirs if line not in mine], [], "%s: a line that only the public version has" % name)
            self.assertLess(len(theirs), len(mine), "%s: the public version has fewer lines" % name)

    def test_the_public_architecture_page_has_the_same_sections_as_the_working_one(self):
        def headings(text):
            found, fenced = [], False
            for line in text.splitlines():
                if line.startswith("```"):
                    fenced = not fenced
                elif not fenced and re.match(r"#{1,6} ", line):
                    found.append(line)
            return found
        self.assertEqual(headings(read("docs", "ARCHITECTURE.md")), headings(read(OVERLAY + "docs", "ARCHITECTURE.md")))


class TheChangelogs(unittest.TestCase):
    def test_the_public_changelog_has_no_paragraph_for_operators_and_no_commit_range(self):
        text = re.sub(r"<!--.*?-->", "", read("CHANGELOG.md"), flags=re.S)
        self.assertEqual(re.findall(r"^\*\*(For operators|Details):\*\*", text, re.M), [])
        self.assertNotIn("compare/", text)

    def test_the_working_changelog_has_an_entry_for_every_release_of_the_public_one(self):
        def headings(text):
            return re.findall(r"^## (v\d+\.\d+\.\d+ - .*)$", re.sub(r"<!--.*?-->", "", text, flags=re.S), re.M)
        public, working = headings(read("CHANGELOG.md")), headings(read("CHANGELOG_SERVER.md"))
        self.assertEqual(working, public)
        entries = re.split(r"^(?=## v)", re.sub(r"<!--.*?-->", "", read("CHANGELOG_SERVER.md"), flags=re.S), flags=re.M)[1:]
        for entry in entries:
            self.assertRegex(entry, r"\*\*Details:\*\* \[commits\]\(https://github\.com/", entry.splitlines()[0])


class TheNotices(unittest.TestCase):
    def test_the_servers_third_party_code_has_its_own_file_and_the_public_notices_name_none_of_it(self):
        public, server = read("THIRD_PARTY_NOTICES.md"), read("THIRD_PARTY_NOTICES_SERVER.md")
        for needle in ("SQLite", "DB-IP"):
            self.assertIn(needle, server, needle)
            self.assertNotIn(needle, public, needle)
        for needle in ("Mbed TLS", "Libre Franklin", "SDL2", "dr_mp3"):
            self.assertIn(needle, public, needle)


class TheReleaseTool(unittest.TestCase):
    CHANGELOG = "# What's new\n\n## Next\n\n**For players:**\n- A change.\n\n## v1.2.3 - 2026-01-01 - Old\n\n**For players:**\n- Old.\n"
    README = "# Ants\n\n**Current version: v1.2.3**\n"

    def test_the_version_line_of_the_overlay_readme_moves_with_the_readme(self):
        with tempfile.TemporaryDirectory() as root:
            for name, text in (("VERSION", "1.2.3\n"), ("CHANGELOG.md", self.CHANGELOG), ("README.md", self.README), ("export/overlay/README.md", self.README + "\nThe public one.\n")):
                path = os.path.join(root, *name.split("/"))
                os.makedirs(os.path.dirname(path), exist_ok=True)
                with open(path, "w", encoding="utf-8") as f:
                    f.write(text)
            done = subprocess.run([sys.executable, RELEASE, "1.3.0", "A title", "--root", root, "--date", "2026-02-02"], capture_output=True, text=True)
            self.assertEqual(done.returncode, 0, done.stderr)
            with open(os.path.join(root, "export", "overlay", "README.md"), encoding="utf-8") as f:
                self.assertIn("**Current version: v1.3.0**", f.read())
            with open(os.path.join(root, "README.md"), encoding="utf-8") as f:
                self.assertIn("**Current version: v1.3.0**", f.read())


if __name__ == "__main__":
    unittest.main()
