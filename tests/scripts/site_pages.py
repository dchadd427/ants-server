"""The pages of the game as a browser sees them once the site's hooks have written their tags (web/site/site_hooks.js, docs/PLAY_IN_BROWSER.md "The seam to a site"), for the tests of the site's files.

The game page, the Map Maker and the sprite and sound catalog carry <script src="site_hooks.js" data-page="NAME"> twice: the first, in the head, is where the site's hook writes the links of its
styles, the second is where it writes the tags of its scripts (PAGES of that file). expanded() puts those tags in the page's text in place of the two, so that a test of the site's files (the tags
once each, in the order, the bar's script after the bar) reads the page as the browser builds it, and the public pages keep no name of the site.
"""
import ast
import os
import re

REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
HOOKS = os.path.join(REPO, "web", "site", "site_hooks.js")
TAG = re.compile(r'<script src="/?site_hooks\.js" data-page="([a-z]+)"></script>')


def read(*parts):
    with open(os.path.join(REPO, *parts), encoding="utf-8") as f:
        return f.read()


def pages():
    """PAGES of the site's hooks: { name: { 'styles': [...], 'scripts': [...] } }"""
    text = read("web", "site", "site_hooks.js")
    return ast.literal_eval(re.search(r"var PAGES = (\{.*?\n    \});", text, re.S).group(1))


def expanded(*path):
    """The text of the page at `path` (relative to the repository, by parts: expanded("web", "shell.html")) with the two tags of the hooks replaced by what the site's hooks write there"""
    text = read(*path)
    found = list(TAG.finditer(text))
    assert len(found) == 2, "%s: the hook's tag is there %d times, not twice" % (os.path.join(*path), len(found))
    head, end = found
    lists = pages()[head.group(1)]
    assert end.group(1) == head.group(1)
    styles = "".join('<link rel="stylesheet" href="%s">' % url for url in lists["styles"])
    scripts = "".join('<script src="%s"></script>' % url for url in lists["scripts"])
    return text[:head.start()] + styles + text[head.end():end.start()] + scripts + text[end.end():]
