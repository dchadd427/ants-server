#!/usr/bin/env bash
# The public web build: the game page, the Map Maker, the sprite and sound catalog and the map core, into dist/. It needs Emscripten and nothing of a site: the pages load
# web/site_hooks.js (a stub that does nothing), so that a build of this file is the game and its tools and nothing else (docs/PLAY_IN_BROWSER.md, "The seam to a site"). Serve it with
# tools/serve_web.py. A tree that has a site builds it with build_site.sh, which runs this file first and adds the site's files to dist/.
set -e

echo "========================================================"
echo "    Building Ants (1998) WebAssembly / HTML5 Port       "
echo "========================================================"

if ! command -v emcmake &> /dev/null || ! command -v emcc &> /dev/null; then
    if [ -f "${EMSDK}/emsdk_env.sh" ]; then
        source "${EMSDK}/emsdk_env.sh" > /dev/null 2>&1
    elif [ -f "$HOME/emsdk/emsdk_env.sh" ]; then
        source "$HOME/emsdk/emsdk_env.sh" > /dev/null 2>&1
    fi
fi

if ! command -v emcmake &> /dev/null || ! command -v emcc &> /dev/null; then
    echo "Error: Emscripten (emcmake / emcc) is not in your PATH."
    echo ""
    echo "To install Emscripten on macOS:"
    echo "  brew install emscripten"
    echo ""
    echo "Or via the official emsdk:"
    echo "  git clone https://github.com/emscripten-core/emsdk.git"
    echo "  cd emsdk && ./emsdk install latest && ./emsdk activate latest"
    echo "  source ./emsdk_env.sh"
    exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BUILD_DIR="${SCRIPT_DIR}/build_web"
DIST_DIR="${SCRIPT_DIR}/dist"

echo "==> Configuring CMake with Emscripten..."
emcmake cmake -B "${BUILD_DIR}" \
    -DCMAKE_BUILD_TYPE=Release \
    -DBUILD_TESTS=OFF

echo "==> Building WebAssembly target (index.html, index.js, index.wasm, index.data)..."
cmake --build "${BUILD_DIR}" -j4

echo "==> Packaging into ${DIST_DIR}..."
mkdir -p "${DIST_DIR}"
# The footers of the game page and the Menu of every page with the bar at the top name the version (the file VERSION) and the build (ANTS_BUILD_ID, else the commit of this checkout, else the time), as the Docker image does
GAME_VERSION="v$(head -n 1 "${SCRIPT_DIR}/VERSION" | tr -d '[:space:]')"
BUILD_ID="$(sh "${SCRIPT_DIR}/docker/resolve_build_id.sh" "${ANTS_BUILD_ID:-}" "${SCRIPT_DIR}/.git" 2>/dev/null)"
BUILD_DATE="$(TZ=PST8PDT,M3.2.0,M11.1.0 date '+%Y-%m-%d %H:%M PT')"
# The address that the pages name themselves by (web/SITE_ORIGIN: their canonical links and share cards)
SITE_ORIGIN="$(head -n 1 "${SCRIPT_DIR}/web/SITE_ORIGIN" | tr -d '[:space:]')"
# The stamps, for a build that adds to this one (build_site.sh reads them: the pages of a site carry the same version, build and address as the game page)
printf 'GAME_VERSION=%q\nBUILD_ID=%q\nBUILD_DATE=%q\nSITE_ORIGIN=%q\n' "${GAME_VERSION}" "${BUILD_ID}" "${BUILD_DATE}" "${SITE_ORIGIN}" > "${BUILD_DIR}/stamps.sh"
sed -e "s/@@GAME_VERSION@@/${GAME_VERSION}/g" -e "s/@@BUILD_ID@@/${BUILD_ID}/g" -e "s/@@BUILD_DATE@@/${BUILD_DATE}/g" -e "s/@@SITE_TITLE@@//g" -e "s/@@SITE_FOOTER@@//g" -e "s|@@SITE_ORIGIN@@|${SITE_ORIGIN}|g" "${BUILD_DIR}/src/ants_app/index.html" > "${DIST_DIR}/index.html"
cp -f "${DIST_DIR}/index.html" "${DIST_DIR}/play.html"            # the game page at its own path (the games on this computer), as the image has it
cp -f "${SCRIPT_DIR}/web/site_hooks.js" "${DIST_DIR}/"                                                                                                                                         # the seam between the pages and a site (docs/PLAY_IN_BROWSER.md): the stub, which does nothing (a site's build puts its own file in its place)
cp -f "${SCRIPT_DIR}/web/update_notice.css" "${SCRIPT_DIR}/web/update_notice.js" "${DIST_DIR}/"                                                                           # the strip and the window of a new version (the image also has /whats_new.json, made from CHANGELOG.md: this folder has none, so the pages stay silent)
cp -f "${SCRIPT_DIR}/web/game_bar.css" "${SCRIPT_DIR}/web/game_bar.js" "${DIST_DIR}/"                                                                                    # the game page's part of the bar (its rules, the links that ask first, the keys)
cp -f "${SCRIPT_DIR}/web/replay_page.js" "${DIST_DIR}/"                                                                                                                                             # ... and the helpers they share with the game page
cp -f "${SCRIPT_DIR}/web/rejoin_key.js" "${DIST_DIR}/"
cp -f "${SCRIPT_DIR}/web/shapes.js" "${DIST_DIR}/"                                                                                                                                           # the pages' one table of the picture's shapes
cp -f "${SCRIPT_DIR}/web/shape_picker.js" "${DIST_DIR}/"                                                                                                                                     # ... and its control, a button and a list that the page makes (a native list does not open under the fullscreen mouse lock)
cp -f "${SCRIPT_DIR}/web/map_files.js" "${DIST_DIR}/"                                                                                                                                             # ... and the helpers it shares with the game page
cp -f "${SCRIPT_DIR}/web/countdown_button.js" "${DIST_DIR}/"                                                                                                                                             # ... and the countdown's Fullscreen button
cp -f "${SCRIPT_DIR}/web/alert_core.js" "${DIST_DIR}/"                                                                                                                                                   # the alerts that need no permission: the switches, the tab alert, the sound table (docs/HOME_SCREEN.md "Alerts")
cp -f "${SCRIPT_DIR}/web/hud_fullscreen.js" "${DIST_DIR}/"                                                                                                                                                # the HUD's own Fullscreen button
cp -f "${SCRIPT_DIR}/web/wake_lock.js" "${DIST_DIR}/"                                                                                                                                                    # ... and the screen that stays on while a match is played or a recording plays
cp -f "${SCRIPT_DIR}/web/local_time.js" "${DIST_DIR}/"                                                                                                                                                   # ... and the visitor's own time zone and 12-hour clock for every date and time that a page shows
cp -f "${SCRIPT_DIR}/web/p2p.js" "${DIST_DIR}/"                                                                                                                                      # the data channels to the other players (docs/P2P_HINTS.md)
cp -f "${SCRIPT_DIR}/web/touch_keys.js" "${SCRIPT_DIR}/web/touch_keys.css" "${DIST_DIR}/"                                                                                  # ... the hotkey buttons of a touch screen (made by the game page)
cp -f "${SCRIPT_DIR}/web/game_menu.js" "${SCRIPT_DIR}/web/game_menu.css" "${DIST_DIR}/"                                                                                  # ... the settings menu's panel (loaded by the game page once the game runs)
cp -f "${BUILD_DIR}/lvl_core/lvl_core.js" "${BUILD_DIR}/lvl_core/lvl_core.wasm" "${DIST_DIR}/"                                                                                    # the map core for the browser (docs/MAP_FORMAT.md, "In the browser")
cp -f "${SCRIPT_DIR}/web/lvl_core_api.js" "${DIST_DIR}/"
MAPMAKER_VERSION="v$(head -n 1 "${SCRIPT_DIR}/web/MAPMAKER_VERSION" | tr -d '[:space:]')" && grep -q "data-maker=\"${MAPMAKER_VERSION}\"" "${SCRIPT_DIR}/web/mapmaker.html"
sed -e "s/@@GAME_VERSION@@/${GAME_VERSION}/g" -e "s/@@BUILD_ID@@/${BUILD_ID}/g" -e "s/@@BUILD_DATE@@/${BUILD_DATE}/g" -e "s|@@SITE_ORIGIN@@|${SITE_ORIGIN}|g" "${SCRIPT_DIR}/web/mapmaker.html" > "${DIST_DIR}/mapmaker.html"   # the map maker (docs/MAP_EDITOR.md); its scripts are in front/
cp -f "${BUILD_DIR}/src/ants_app/index.js" "${DIST_DIR}/"
cp -f "${BUILD_DIR}/src/ants_app/index.wasm" "${DIST_DIR}/"
cp -f "${BUILD_DIR}/src/ants_app/index.data" "${DIST_DIR}/"
cp -f "${SCRIPT_DIR}/web"/favicon.* "${DIST_DIR}/"
mkdir -p "${DIST_DIR}/front" "${DIST_DIR}/app"
cp -f "${SCRIPT_DIR}/web/front"/* "${DIST_DIR}/front/"            # the pages' pictures, font and scripts (the Map Maker's and the game page's), served at /front/
cp -f "${SCRIPT_DIR}/web/manifest.webmanifest" "${DIST_DIR}/"             # the installable web app: its manifest (served at /manifest.webmanifest) ...
cp -f "${SCRIPT_DIR}/web/app"/* "${DIST_DIR}/app/"                  # ... and its icons (tools/make_app_icons.py), served at /app/
mkdir -p "${DIST_DIR}/asset_catalog"
cp -R "${SCRIPT_DIR}/asset_catalog/." "${DIST_DIR}/asset_catalog/"        # the sprite and sound catalog (/asset_catalog/) and the few big toys that the map maker fetches one by one
python3 "${SCRIPT_DIR}/tools/map_atlas.py" "${DIST_DIR}/mapmaker_atlas"        # the map maker's sprite atlas (docs/MAP_EDITOR.md, "Sprites")

echo "========================================================"
echo " Build Succeeded! Web distribution ready in: ${DIST_DIR}"
echo " To test locally in your browser:"
echo "   python3 tools/serve_web.py --dist dist"
echo " Then navigate to: http://localhost:8080/ (the game page), /mapmaker (the map maker) and /asset_catalog/ (the sprites and sounds)"
echo "========================================================"
