#!/usr/bin/env bash
# The site's web build: the public build (build_web.sh: the game page, the Map Maker, the catalog and the map core) and then the files of the site added to dist/ with the same stamps: the front page, the
# match history and Legal pages, the bar at the top and the counter, the pages' scripts of the history, plays, hearts and the hub, the Home screens, the map pages and the robots and sitemap files, the
# admin page and the skills for a person's AI, and the site's half of the seam (web/site/, which takes the place of the stub). It is the only file that copies a file of the site (build_web.sh names none).
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BUILD_DIR="${SCRIPT_DIR}/build_web"
DIST_DIR="${SCRIPT_DIR}/dist"

bash "${SCRIPT_DIR}/build_web.sh"
. "${BUILD_DIR}/stamps.sh"      # GAME_VERSION, BUILD_ID, BUILD_DATE and SITE_ORIGIN of that build

echo "==> Adding the site to ${DIST_DIR}..."
# The map pages (docs/MAP_PAGES.md: one for each map of the library, and the index), made from the library with the same stamps and address; their sitemap (sitemap-library.xml, named by robots.txt) lists them (the image's nginx, docker/nginx.conf, serves /map/NAME and /map-library from them)
MAP_SITE="${BUILD_DIR}/map_site"
python3 "${SCRIPT_DIR}/tools/map_pages.py" "${SITE_ORIGIN}" "${MAP_SITE}" --version "${GAME_VERSION}" --build-id "${BUILD_ID}" --build-date "${BUILD_DATE}"
cp -R "${MAP_SITE}/html/." "${DIST_DIR}/"
cp -f "${SCRIPT_DIR}/web/map_pages.css" "${SCRIPT_DIR}/web/map_library.js" "${SCRIPT_DIR}/web/map_plays.js" "${DIST_DIR}/"
# robots.txt and sitemap.xml, made with the address that the pages name themselves by (docs/private/BUILD_AND_RUN_DOCKER.md "Search engines and share cards")
python3 "${SCRIPT_DIR}/tools/seo_files.py" "${SITE_ORIGIN}" "${DIST_DIR}" --pages "${MAP_SITE}/addresses.txt"
sed -e "s/@@GAME_VERSION@@/${GAME_VERSION}/g" -e "s/@@BUILD_ID@@/${BUILD_ID}/g" -e "s/@@BUILD_DATE@@/${BUILD_DATE}/g" -e "s/@@SITE_TITLE@@//g" -e "s/@@SITE_FOOTER@@//g" -e "s|@@SITE_ORIGIN@@|${SITE_ORIGIN}|g" "${SCRIPT_DIR}/web/lobby.html" > "${DIST_DIR}/lobby.html"
for PAGE in matches match legal; do                              # the pages of the match history (the list, one match) and the Legal page
    sed -e "s/@@GAME_VERSION@@/${GAME_VERSION}/g" -e "s/@@BUILD_ID@@/${BUILD_ID}/g" -e "s/@@BUILD_DATE@@/${BUILD_DATE}/g" -e "s/@@SITE_TITLE@@//g" -e "s/@@SITE_FOOTER@@//g" -e "s|@@SITE_ORIGIN@@|${SITE_ORIGIN}|g" "${SCRIPT_DIR}/web/${PAGE}.html" > "${DIST_DIR}/${PAGE}.html"
done
cp -f "${SCRIPT_DIR}/web/matches.css" "${DIST_DIR}/"                                                                                                                                                # ... their stylesheet
cp -f "${SCRIPT_DIR}/web/site_nav.css" "${DIST_DIR}/"                                                                                                                                              # the bar at the top of every page (its style and its Menu)
cp -f "${SCRIPT_DIR}/web/site_nav.js" "${DIST_DIR}/"
if [ -d "${SCRIPT_DIR}/web/site" ]; then cp -f "${SCRIPT_DIR}/web/site"/* "${DIST_DIR}/"; fi                                                                                                        # ... and the site's half, which takes its place when the tree has one
cp -f "${SCRIPT_DIR}/web/analytics.js" "${DIST_DIR}/"                                                                                                                                    # the counter of the site's visits (docs/ANALYTICS.md)
cp -f "${SCRIPT_DIR}/web/history_page.js" "${DIST_DIR}/"
cp -f "${SCRIPT_DIR}/web/match_stats.js" "${DIST_DIR}/"
cp -f "${SCRIPT_DIR}/web/match_stats.css" "${DIST_DIR}/"
cp -f "${SCRIPT_DIR}/web/death_map.js" "${DIST_DIR}/"
cp -f "${SCRIPT_DIR}/web/death_map.css" "${DIST_DIR}/"
cp -f "${SCRIPT_DIR}/web/replay_activity.js" "${SCRIPT_DIR}/web/replay_activity.css" "${DIST_DIR}/"
cp -f "${SCRIPT_DIR}/web/replay_plays.js" "${SCRIPT_DIR}/web/replay_likes.js" "${DIST_DIR}/"                                                                    # the play counter of the replay page and the plays and hearts of the match pages
cp -f "${SCRIPT_DIR}/web/replay_stats.css" "${DIST_DIR}/"
cp -f "${SCRIPT_DIR}/web/hub_here.js" "${DIST_DIR}/"
sed -e "s/@@GAME_VERSION@@/${GAME_VERSION}/g" -e "s/@@BUILD_ID@@/${BUILD_ID}/g" -e "s/@@BUILD_DATE@@/${BUILD_DATE}/g" "${SCRIPT_DIR}/web/admin.html" > "${DIST_DIR}/admin.html"   # the admin page (docs/MAP_SUBMISSIONS.md): typed by hand, with the bar and its stamps
cp -f "${SCRIPT_DIR}/web/admin.css" "${SCRIPT_DIR}/web/admin_map_pick.js" "${SCRIPT_DIR}/web/admin_bots.js" "${SCRIPT_DIR}/web/admin_analytics.js" "${SCRIPT_DIR}/web/admin_analytics.css" "${SCRIPT_DIR}/web/admin_page.js" "${DIST_DIR}/"
printf '{"front": "lobby.html"}\n' > "${DIST_DIR}/serve_web.json"      # tools/serve_web.py: the front page of this folder is the lobby
mkdir -p "${DIST_DIR}/home"
cp -f "${SCRIPT_DIR}/web/home"/* "${DIST_DIR}/home/"              # the front page's Home and Room screens (docs/HOME_SCREEN.md), served at /home/
python3 "${SCRIPT_DIR}/tools/make_ai_skills.py" --build "${DIST_DIR}"        # the skills for a person's AI (docs/MAP_AI.md, "The skills"), served at /ai/skills/

echo "========================================================"
echo " The site is in: ${DIST_DIR}"
echo " To test locally in your browser:"
echo "   python3 tools/serve_web.py --dist dist"
echo " Then navigate to: http://localhost:8080/ (the front page; the game page is /play) (the clean page addresses /matches, /match, /legal and /mapmaker are served as the image's nginx does)"
echo " (tools/web_without_docker.py builds and serves the site with nginx: docs/private/WORKFLOW_DEPLOY.md)"
echo "========================================================"
