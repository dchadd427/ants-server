# The export lists

Which files go to the public repository, and the checks that keep every file on exactly one side. Nothing here changes how the game, the server or the site are built or run.

| File | What it is |
|---|---|
| `allowlist.txt` | the paths that the export copies to the public repository (the game, its protocol, bots, replays, assets, the game page and the Map Maker page, and the tests of those) |
| `private.txt` | the paths that stay here and are never exported (the game server and its libraries, the history service, the hub, the site pages, the Docker stack and deploy files, the tests that need those, and this folder) |
| `classify.py` | the check: every tracked file is on exactly one of the two lists. It also prints the two path lists (`--list public`, `--list private`) and the allow-list as `git filter-repo` path regexes (`--filter-repo-paths`) |
| `check_export.py` | the scan of words: which public text files still name something private. **Report only** for now |
| `overlay/` | public versions of files that must read differently in the public repository (`AGENTS.md`, `README.md`, `SECURITY.md`, the CI workflow): `overlay/<path>` is exported as `<path>`. It is empty today; `overlay/.gitkeep` only keeps the folder and is never exported |

`export/` itself is private (`private.txt`): the public repository does not describe this one. The lists are the one place that says what is public; no other file repeats them.

## The check

```
python3 export/classify.py             # exit 1 and a line per file when a file is on neither list or on both
python3 export/classify.py --dead      # also the patterns that match no file
python3 export/check_export.py         # the scan of words (exit 0 always); --list names the files, --tsv FILE writes them
```

`./run_tests.sh --fast` runs both as suite 5.3, and CI runs them in the Linux job. The check reads `git ls-files`, so a new file is checked once it is added to the index.
`tests/scripts/test_export_lists.py` runs the check on made-up trees (the pattern rules, the overlay, both failures) and on this repository.

## Which list a file goes on

A new file that is on neither list fails the check, and nobody guesses: put it on one list, with the other list left alone (a pattern may be a path, `dir/**`, or a glob with `*`; a line that starts with `!` takes away what an earlier line of the same list matched).

- **Public** when it is part of the game: the simulation, the network protocol and the client's side of it, the bots, replays, assets, the application, the game page and the Map Maker page and their scripts, the original's data, the players' maps, and a test or document of those that runs and reads without anything private.
- **Private** when it belongs to the running service (the game server, the history service, the database, the control door, the hub, the site pages, the Docker stack, the deploy files), is a test or a document of those, or needs one of them to run (a test that starts a real server or links its library).
- A file that must read differently in the public repository is two files: the private one where it is, and the public one under `overlay/`.
- A file of mutants (`tests/data/*_mutants.json`) is public when no mutant of it changes a private file (a private test may still be the one that catches some of them: the file's note and the command lines of those mutants are reworded later); it is private when any mutant changes a private file.
- A script or a test that only names a private file in a comment is still public: the scan of words lists it, and the change that cuts the mention is made on its own.

## The hooks: private files that the public files read when they are there

The exported tree has no server, so the build and the test runners of the public files never name one: each reads a private file if it exists, and a tree without the file is the game, its libraries, tools and tests.

| Private file | Read by | What it holds |
|---|---|---|
| `cmake/private.cmake` | `CMakeLists.txt` (`include(cmake/private.cmake OPTIONAL)`, at its end) | the game server's libraries, programs and tests: SQLite, the database layer, the control interface, the server, the history service, the picture maker, `tests/test_db`, `test_ctl`, `test_server`, and `test_app_server` (the application tests that run a real room manager) |
| `tests/suites_server.sh` | `run_tests.sh` (`define_suites`, before the E2E suite) | the `suite` lines of the server's tests and scripts; `--fast` and the tier options select them like any other |
| `tests/scripts/costs_private.py` | `tests/scripts/run_python_tests.py` (at import) | the `COSTS`, `SHARDS` and `LINUX_ONLY` entries of the python tests that the exported tree does not have |
| `web/site/site_hooks.js`, `web/site/mapmaker_site.js` | the pages: `web/shell.html`, `web/mapmaker.html` and `asset_catalog/index.html` load `/site_hooks.js` twice (the public file `web/site_hooks.js` is a stub that does nothing; the image's two `COPY web/site/...` lines and `build_web.sh` serve the folder's files at the root, so the site's file takes the stub's place) | the site's half of the seam ([`PLAY_IN_BROWSER.md`](../docs/PLAY_IN_BROWSER.md#the-seam-to-a-site)): the styles and scripts of the bar, the counter, the hub's socket, the match history and the Map Maker's AI and sending of maps; the hooks of the game page; the Map Maker's buttons |

`tests/scripts/test_runners_private.py` holds the checks of these two runners that name private suites or tests; `test_run_tests.py` and `test_run_python_tests.py` check the rest and the hooks themselves. `tests/scripts/test_web_site_hooks.py` holds the checks of the site's half of the seam (the other tests of the site's scripts read the pages with its tags written in, through `tests/scripts/site_pages.py`); `tests/scripts/test_web_seam.py` is public: it runs the pages with the stub alone and checks that every file that they name is in the public tree.

## The scan of words

`check_export.py` counts, in every public text file, the mentions of private headers and targets, private paths and documents, private web files and tools, the program `ants_server`, the web server and the stack, and private test targets (the list `KINDS` in the script; add a name when a new private name appears). It prints the number of files and hits, by kind and by area. It does not fail until the mentions have been cut from the public files; then `--strict` makes it the gate of the export.

## What is not here yet

The scripts that make the export itself (the first export with history, the export of a release, the full check of the exported tree) and the public overlay files are added by later changes.

## Left over from the site seam (step 6)

What the seam left in the public files, for steps 7 to 9 of the split:

- `build_web.sh` copies private files (the bar's and the counter's among them, and the folder of the site's half) without asking whether they are there; a tree without them cannot build the web folder. Step 7 guards each copy.
- `web/front/player_name.js` asks the hub (`/hub/me`) for the name of a person who is logged in; step 8 or 9 moves that ask behind a hook or out of the public file. Nothing changed in its behavior here.
- With the stub alone the bar's markup (Home, Matches, Map maker, Discord) stays in the pages and has no style, because the bar's CSS is the site's: a public bar is a decision for later.
- The CSS of the AI button and of the screens for sending a map is still in `web/front/mapmaker.css`, `MapStore.createSent` is still in `mapmaker_store.js`, the page's description names "submit it for approval", and the name step's markup of the game page still has the link to the login.
- The pages tell the scan of words (`check_export.py`, kind `site-seam`) nothing of the seam's files any more; a public file that names the site's half again is counted there.
- The browser checks that serve the pages themselves (`web_site_nav_browser.js`, `web_replay_open_browser.js`, `web_live_check.py`) serve the site's folder at the root, as the image does; a tree without the folder runs them with the stub, and the hooks' checks then hold trivially.
