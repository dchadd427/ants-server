#!/usr/bin/env python3
"""The public CHANGELOG.md, made from this repository's one (the file stays as it is here; nobody keeps the public text by hand).

    export/public_changelog.py [--repo DIR] [-o FILE]       prints the public text, or writes it to FILE

What it takes out of the text: every paragraph that starts with "**For operators:**" (what only the person who runs the server or the site sees) and every one that starts with "**Details:**" (the
commit range of this repository), in the entries and in the template comment at the top; then every entry that has nothing left under its heading (a release that had only lines for operators).
A paragraph is its label line and the lines after it up to the next blank line, label, heading or end of the comment. Nothing else is changed: a line for players that links a private document is
reworded in the file itself (the check of the links, `check_export.py --links`, reads this text, so it stops one).

The first export, and every sync of a release (export/README.md), writes the public file with this script. A newest release that has only lines for operators is left out like the others, and
then the public text names an older version than the file VERSION: `check_export.py --links` reports that, and the release gets a line for players.
"""
import argparse
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
LABEL = re.compile(r'^\*\*([^*:]+):\*\*')
LEFT_OUT = ('For operators', 'Details')
HEADING = re.compile(r'^## ')


def _ends_a_paragraph(line):
    return not line.strip() or LABEL.match(line) or HEADING.match(line) or line.lstrip().startswith(('<!--', '-->'))


def without_labels(lines):
    """The lines without the paragraphs of the labels in LEFT_OUT (and without the blank line that would then stand twice)."""
    out, i = [], 0
    while i < len(lines):
        m = LABEL.match(lines[i])
        if not (m and m.group(1) in LEFT_OUT):
            out.append(lines[i])
            i += 1
            continue
        i += 1
        while i < len(lines) and not _ends_a_paragraph(lines[i]):
            i += 1
        if i < len(lines) and not lines[i].strip() and (not out or not out[-1].strip()):
            i += 1
    return out


def without_empty_entries(lines):
    """The lines without the entries (a heading "## ..." outside the comments, and what follows it up to the next heading) that have only blank lines under their heading."""
    blocks, in_comment = [[]], False
    for line in lines:
        if not in_comment and HEADING.match(line):
            blocks.append([])
        blocks[-1].append(line)
        if not in_comment and '<!--' in line and '-->' not in line.split('<!--', 1)[1]:
            in_comment = True
        elif in_comment and '-->' in line:
            in_comment = False
    return [line for n, block in enumerate(blocks) if n == 0 or any(l.strip() for l in block[1:]) for line in block]


def public_text(text):
    """The public text of a CHANGELOG.md (one newline at its end)."""
    lines = without_empty_entries(without_labels(text.split('\n')))
    return '\n'.join(lines).rstrip('\n') + '\n'


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--repo', default=os.path.dirname(HERE), help='the tree whose CHANGELOG.md is read (default: the repository that holds this script)')
    ap.add_argument('-o', '--output', help='write the text to this file (default: print it)')
    args = ap.parse_args(argv)
    with open(os.path.join(args.repo, 'CHANGELOG.md'), encoding='utf-8', newline='') as fh:
        text = public_text(fh.read())
    if args.output:
        with open(args.output, 'w', encoding='utf-8', newline='') as out:
            out.write(text)
    else:
        sys.stdout.write(text)
    return 0


if __name__ == '__main__':
    sys.exit(main())
