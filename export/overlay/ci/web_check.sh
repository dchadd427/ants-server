#!/usr/bin/env bash
# The "Web" check of the public repository: the web build of the game, the Map Maker and the sprite and sound catalog (build_web.sh), served as a browser would be served
# (tools/serve_web.py) and held to what the pages and the map core promise. It needs Emscripten (the CI runs it in the pinned emsdk image), python3 and node, nothing else, and starts no game server.
#
#   ci/web_check.sh [build] [check] [tests]        run from the root of the tree (or ANTS_TREE=DIR); no word runs the three, in this order
#
#   build   a fresh dist/ (build_web.sh)
#   check   the files of dist/ and what tools/serve_web.py answers for them (tests/scripts/web_dist_check.py): every file that the three pages name is there, no placeholder of the build is left,
#           the game, the pages and their scripts and styles are revalidated at every use (AGENTS.md rule 6), the isolation headers, the list of maps
#   tests   the map core's browser module (dist/lvl_core.js and .wasm) run in node on the library's maps, together with the Map Maker's pages (--require: a missing module is a failure)
# Exit status: 0 every phase passed; 1 a check failed; 2 it could not run (not at the root of a tree, a word that is no phase, a program that is missing).
set -euo pipefail

cd "${ANTS_TREE:-$PWD}"
if [ ! -f build_web.sh ] || [ ! -f tools/serve_web.py ]; then
    echo "web_check: run it from the root of the tree (there is no build_web.sh and tools/serve_web.py in $PWD)" >&2
    exit 2
fi
phases="$*"
[ -n "$phases" ] || phases="build check tests"

need() {
    command -v "$1" > /dev/null 2>&1 || { echo "web_check: $1 is not installed" >&2; exit 2; }
}

phase_build() {
    echo "==> web_check: build (a fresh dist/)"
    rm -rf dist build_web/stamps.sh
    bash ./build_web.sh
}

phase_check() {
    echo "==> web_check: check (the files of dist/, and what a server answers for them)"
    [ -d dist ] || { echo "web_check: there is no dist/: run the build phase first" >&2; exit 1; }
    python3 tools/serve_web.py --dist dist --port 0 -- sh -c 'python3 tests/scripts/web_dist_check.py dist --web "$ANTS_WEB_URL"'
}

phase_tests() {
    echo "==> web_check: tests (the map core and the Map Maker, from dist/)"
    [ -f dist/lvl_core.js ] && [ -f dist/lvl_core.wasm ] || { echo "web_check: dist/ has no lvl_core.js and lvl_core.wasm: run the build phase first" >&2; exit 1; }
    need node
    ls -l dist/lvl_core.js dist/lvl_core.wasm dist/lvl_core_api.js
    node --version
    for check in lvl_core_check web_mapmaker_core_check web_mapmaker_play_check web_mapmaker_pickup_check; do
        node "tests/scripts/${check}.js" --module dist --require
    done
}

need python3
for phase in $phases; do
    case "$phase" in
        build|check|tests) ;;
        *) echo "web_check: $phase is not a phase (build, check, tests)" >&2; exit 2 ;;
    esac
done
for phase in $phases; do
    "phase_${phase}"
done
echo "web_check: passed ($phases)"
