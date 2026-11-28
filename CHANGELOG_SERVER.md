# What's new for the people who run the server and the site

The notes that are not in the public changelog (`CHANGELOG.md`), one entry for each of its releases, under the same heading: **For operators:** what only the person who runs a server or the site sees (the administration page, a setting, an environment variable, the database), and **Details:** the commit range of the release in this repository. Nothing here is exported: `CHANGELOG.md` is the file that players, and the public repository, have.

Every release has an entry, for its commit range (**Details:**); the **For operators:** paragraph is there only when there is something to say. A change writes its lines under a heading that says only `## Next` (above the newest release), and the release's own pull request turns that heading into the release's heading by hand, with the commit range (`tools/release.py` does it for `CHANGELOG.md` only).

<!--
Template of an entry:

## vX.Y.Z - YYYY-MM-DD - title

**For operators:**
- one bullet each

**Details:** [commits](https://github.com/OWNER/REPOSITORY/compare/OLD...NEW)
-->

## v0.23.0 - 2026-11-28 - Your own ants stay where you sent them

**For operators:**
- Analytics: the image's build got no country list (db-ip.com answers 403 to Python's own client name); it now names itself, tries this month and the one before, and logs which list it has ([how](docs/ANALYTICS.md#the-country-list)). Analytics: the browser's `ResizeObserver loop` notes are no longer counted as page errors ([list](docs/ANALYTICS.md#what-is-not-counted-as-an-error)). Analytics: a proxy that passes no `X-Forwarded-For` makes every visitor the proxy's own address; the hub now logs it and lets that address make more than a household's 50 new visitors a day ([how](docs/ANALYTICS.md#the-door)).

**Details:** [commits](https://github.com/dchadd427/ants-server/compare/2104634d...26a6dddb)

## v0.22.3 - 2026-11-27 - Tags any time, nicknames once a day, web logs kept 14 days

**For operators:**
- The web server's logs (access and error, which name the visitor's address) are deleted after 14 days, as the Legal page says: nginx writes them in `/var/log/ants/` and the image cuts them (`docker logs ants-beta` shows no request; [how](docs/private/BUILD_AND_RUN_DOCKER.md#what-the-images-nginx-sends-checks-and-logs)).
- The hub holds a name that was given up for 7 days, no longer 30: the first time it opens a database that the earlier hub made it cuts the holds it finds to 7 days from the day each name was given up (a note in `meta` says that it is done), and a `you` frame no longer has `tagfree`; the table `nicknames` keeps its column `tag_at`, which nothing writes or reads any more ([`docs/HUB_NICKNAMES.md`](docs/HUB_NICKNAMES.md#the-rules)).

**Details:** [commits](https://github.com/dchadd427/ants-server/compare/f3ed14f2...1177b255)

## v0.22.2 - 2026-11-27 - Other players' ants drawn smoothly, site analytics

**For operators:**
- The admin page has a new tab, **Analytics**; the hub has a door for it, `POST /hub/a`, and a file, `analytics.db`; `ANTS_HUB_ANALYTICS=off` switches it off. The hub's image fetches a DB-IP country list when built: pass `ANTS_GEO_MONTH` once a month. The counter keeps no time finer than the hour and names a referrer only by its registered name (and in the permanent totals only when 3 visitors came from it); a day keeps at most 30,000 events, one address range makes at most 50 new visitors a day, and `analytics.db` is limited to 64 MiB as `hub.db` is ([`docs/ANALYTICS.md`](docs/ANALYTICS.md)).

**Details:** [commits](https://github.com/dchadd427/ants-server/compare/b599b261...0e6b3b26)

## v0.22.1 - 2026-11-27 - Smoother ants online, fewer freezes, Show ping

**For operators:**
- The log tells a slow pass of the server's main loop (over 25 ms) in one line with where its time went, `slow pass: 36.0 ms (rooms 5.1, store 21.0)`, at most one line in ten seconds ([`docs/SERVER.md`](docs/SERVER.md#the-slow-pass-log)). The replay store's look at its folder runs in 2 ms slices, and its own saves and deletes no longer call for one ([`docs/SERVER_REPLAYS.md`](docs/SERVER_REPLAYS.md)).
- For search engines the game page now names `/play` as its address (it still says `noindex`, so no `/play?...` address is listed), and a `.txt` file of the site, such as the licence text of the front page's font, sends `X-Robots-Tag: noindex` ([`docs/BUILD_AND_RUN.md`](docs/private/BUILD_AND_RUN_DOCKER.md#search-engines-and-share-cards)).

**Details:** [commits](https://github.com/dchadd427/ants-server/compare/bb9239fc...f3e8fea2)

## v0.22.0 - 2026-11-26 - Nicknames, tags and guest names, a welcome for guests, a better Play of the game and Fill a box

**For operators:**
- Moderators have `/rename NAME`, which takes a nickname and a tag away. The key `ANTS_ADMIN_GATE_SECRET` also signs the pass of a name: with it the game server keeps a nickname only when the hub signed it (without it names are checked as before). The hub adds its tables `nicknames`, `nick_hold` and `login_claim` and the column `lines.tag` by itself.

**Details:** [commits](https://github.com/dchadd427/ants-server/compare/7e54f31a...8f1fafc9)

## v0.21.6 - 2026-11-26 - Live scores, open lobbies, Top Thief and bots that fight for the flower

**Details:** [commits](https://github.com/dchadd427/ants-cross-platform/compare/717a2ef9...af4a8282)

## v0.21.5 - 2026-11-24 - The Podium results, messages on phones and smarter bots

**Details:** [commits](https://github.com/dchadd427/ants-cross-platform/compare/df4b4255...36deb771)

## v0.21.4 - 2026-11-24 - Special ants on the match page, What's new fits a phone

**Details:** [commits](https://github.com/dchadd427/ants-cross-platform/compare/3430f45a...e6b312bf)

## v0.21.3 - 2026-11-24 - Follows, private messages, replay likes and the activity curve

**For operators:**
- The game server's database moves to schema version 12 (the table `history_action`, the counts that the activity curve is drawn from, and the plays and likes of replays; the history service's own file to its version 6): an older program refuses the newer file, and the update does not copy it, so stop the server and copy `ants.db` before the update; that copy is the way back ([`docs/HEATMAPS.md`](docs/HEATMAPS.md#the-activity-curve), [`docs/REPLAY_COUNTS.md`](docs/REPLAY_COUNTS.md)).
- Plays and likes of replays: a new door of the game server (`--counts-port`, 4032 in the stack files; [`docs/REPLAY_COUNTS.md`](docs/REPLAY_COUNTS.md)) and a like gate of the hub that signs a short pass for the person's login (the admin page's key, `ANTS_ADMIN_GATE_SECRET`; without a good one likes are off and plays still count). Only numbers are kept for plays, and for a like the hub's opaque reference of the account. **Forget me** asks the door to take the person's likes back (`ANTS_HUB_COUNTS_URL`, `http://ants-server:4032` in the stack; empty it when `ANTS_COUNTS_PORT` is 0) and never depends on it: a door that does not answer is asked again by the hub for a day.
- New `follows`, `dms` (private messages, 7 days) and `reports` tables, made by the first use and deleted by Forget me; reports are read with `python -m hub.admin reports` and closed with `report-close ID`, and each report, look and close is a row of the moderators' log ([private messages](docs/HUB_MESSAGES.md)). The Legal page has a section for them.

**Details:** [commits](https://github.com/dchadd427/ants-cross-platform/compare/5e23309d...266e2c4c)

## v0.21.2 - 2026-11-23 - Invites, mentions, the bell, map pages and Random map

**For operators:**
- The hub keeps an account's last 30 alerts of 7 days and its `/ignore` list (new `alerts` and `ignores` tables, made by the first one; Forget me deletes them), and limits invitations and mentions ([the hub's document](docs/HUB_PEOPLE.md)).
- The map pages are made when the image is built (`tools/map_pages.py`, [`docs/MAP_PAGES.md`](docs/MAP_PAGES.md)) and listed in `sitemap-library.xml`; the maps that players send and you approve have no page yet.

**Details:** [commits](https://github.com/dchadd427/ants-cross-platform/compare/dc2bfafd...e0d5b1bf)

## v0.21.1 - 2026-11-23 - Connect an AI in the Map Maker

**For operators:**
- The keys are off until the hub is started with `ANTS_HUB_AI_KEYS=on`; with it off every key door answers 503 and no tab can be armed ([`docs/MAP_AI.md`](docs/MAP_AI.md)).

**Details:** [commits](https://github.com/dchadd427/ants-cross-platform/compare/2bdfe98e...d65954fa)

## v0.21.0 - 2026-11-23 - A new room, Fog of War switch, the can't-go gap

**Details:** [commits](https://github.com/dchadd427/ants-cross-platform/compare/5ed83928...d0e1305a)

## v0.20.6 - 2026-11-22 - 3D ant models test page

**Details:** [commits](https://github.com/dchadd427/ants-cross-platform/compare/857ce588...3519146b)

## v0.20.5 - 2026-11-22 - Real error pages, clean addresses, share cards

**For operators:**
- The web image builds with Emscripten 3.1.74 and the server image runs on Debian 13; /robots.txt and /sitemap.xml are real files.

**Details:** [commits](https://github.com/dchadd427/ants-cross-platform/compare/a56438f6...236540e7)

## v0.20.4 - 2026-11-21 - Encrypted desktop joins, fairer limits, the original icon

**For operators:**
- Orders are limited per seat (a large allowance for armies, a small one for other commands); a failed recording names the seat that sent the most.
- Limits per network address: 16 open rooms, 10 new rooms a minute, slower room-code guessing; `ANTS_TRUSTED_PROXIES` names the proxies whose address header is believed.
- The stack files no longer publish the unencrypted TCP game port 4001.
- Images are pinned by digest, Pillow 13.0.0 by hash, and Dependabot watches home-next.

**Details:** [commits](https://github.com/dchadd427/ants-cross-platform/compare/e615bc78...33515c3d)

## v0.20.3 - 2026-11-21 - Images in the chat can be posted

**For operators:**
- The hub's image makes its /images folder its own, so a new or still-empty images volume is writable by the hub (no manual step on the host).

**Details:** [commits](https://github.com/dchadd427/ants-cross-platform/compare/bdc4b393...0f09b20b)

## v0.20.2 - 2026-11-21 - Images in the chat

**For operators:**
- A new container, ants-img, converts images on a private network; the hub reaches it through ANTS_HUB_IMAGE_CONVERTER_URL (on by default; set it empty to turn images off). Who may post: ANTS_HUB_ROLE_IMAGES plus administrators and moderators; administrators take the right away with /noimages and give it back with /images (docs/HUB_IMAGES.md).

**Details:** [commits](https://github.com/dchadd427/ants-cross-platform/compare/88d22002...ea0bfcf6)

## v0.20.1 - 2026-11-21 - Look around during the countdown

**For operators:**
- The desktop game's listener for host migration in a LAN game takes at most 8 waiting connections, each for 5 s.

**Details:** [commits](https://github.com/dchadd427/ants-cross-platform/compare/ee60e4bf...1a591c31)

## v0.20.0 - 2026-11-20 - The room inside Home, Ready up

**For operators:**
- The relay hands a credential only once a match with two or more people has begun, at most two per player, lasting as long as the match can plus 10 minutes; it listens and relays on ANTS_TURN_EXTERNAL_IP only (an address the machine must hold) and writes its pid file to a small memory folder.
- New server option --countdown-hold-seconds (default 60; control key countdown_hold_seconds).

**Details:** [commits](https://github.com/dchadd427/ants-cross-platform/compare/5cd7452b...faa0179c)

## v0.19.3 - 2026-11-20 - Commands in the chat

**For operators:**
- Administrators can start computer-player matches from the chat with /bots (up to 10,000 in a queue, run 80 at a time with a load guard), see them with /bots status and end them with /bots stop. The hub reaches the game server through ANTS_HUB_GAME_ADMIN_URL (docs/HUB_COMMANDS.md).

**Details:** [commits](https://github.com/dchadd427/ants-cross-platform/compare/0f2ebe70...9454806f)

## v0.19.2 - 2026-11-20 - Invite only rooms, fewer stuck computer players

**For operators:**
- A schedule on the admin page can space its matches out ("Start one every X minutes"), like Start now.

**Details:** [commits](https://github.com/dchadd427/ants-cross-platform/compare/a89fd745...cd31da55)

## v0.19.1 - 2026-11-20 - Numbers over the ants without a border

**Details:** [commits](https://github.com/dchadd427/ants-cross-platform/compare/ceabe493...cf1bbe63)

## v0.19.0 - 2026-11-20 - Smoother ants online, a direct-connection switch

**For operators:**
- The relay (coturn) runs in the stack with `COMPOSE_PROFILES=relay` and the `ANTS_TURN_*` settings, including `ANTS_TURN_PORT` when another TURN server holds 3478 (docs/SERVER.md).
- The admin page's Bot matches can use any map by name, an editable rotation, and "Start one every X minutes" (database migration 10).

**Details:** [commits](https://github.com/dchadd427/ants-cross-platform/compare/06f28456...fb4e3ef0)

## v0.18.2 - 2026-11-19 - Private rooms show in Open games, locked

**Details:** [commits](https://github.com/dchadd427/ants-cross-platform/compare/cd4ac593...0b39b23a)

## v0.18.1 - 2026-11-19 - A note when a new version is out; computer players use the endgame

**Details:** [commits](https://github.com/dchadd427/ants-cross-platform/compare/1b9ed00f...bdc50e13)

## v0.18.0 - 2026-11-19 - Dropped food can be taken only once

**Details:** [commits](https://github.com/dchadd427/ants-cross-platform/compare/837d81c1...9e729c46)

## v0.17.13 - 2026-11-19 - Phone fixes: keyboard in Options, watch bar, countdown, full-screen exit

**Details:** [commits](https://github.com/dchadd427/ants-cross-platform/compare/b842a06e...11d4a225)

## v0.17.12 - 2026-11-19 - New windows, a Fullscreen button, live matches at once, alerts

**Details:** [commits](https://github.com/dchadd427/ants-cross-platform/compare/30ddce44...9548c0a5)

## v0.17.11 - 2026-11-18 - Your orders act at once online, one window for watching

**Details:** [commits](https://github.com/dchadd427/ants-cross-platform/compare/cb9b01b0...c59ad097)

## v0.17.10 - 2026-11-18 - Bot matches on the administration page, longer replay storage

**For operators:**
- **Computer-player matches can be started and scheduled from the site's administration page.** Start one or several at once, stop them, and set repeating schedules in Pacific time. Setting `ANTS_BOT_MATCH_EVERY_MIN=0` switches schedules off on the server.
- **The database moves to schema 9 on the first start.** An older server cannot open it afterward.

**Details:** [commits](https://github.com/dchadd427/ants-cross-platform/compare/109000f6...4a6b395e)

## v0.17.9 - 2026-11-18 - New pointers, Map Maker clumps and real map pictures

**Details:** [commits](https://github.com/dchadd427/ants-cross-platform/compare/7c0381af...0469f31d)

## v0.17.8 - 2026-11-17 - Hard computer players keep hitting

**Details:** [commits](https://github.com/dchadd427/ants-cross-platform/compare/48c230ad...6c9f09fc)

## v0.17.7 - 2026-11-17 - Back to the room after a match, ISLANDS bridges, Map Maker edges

**Details:** [commits](https://github.com/dchadd427/ants-cross-platform/compare/b7ff8ec0...845c2214)

## v0.17.6 - 2026-11-17 - One admin secret, and a closed admin page says why

**For operators:**
- **For the site's admins:** the admin page needs one secret setting instead of two, and when it is closed it now says which part is off. Players see no change.

**Details:** [commits](https://github.com/dchadd427/ants-cross-platform/compare/d148d9ea...711aff60)

## v0.17.5 - 2026-11-17 - A new look for the match screen, faster match history, 187 computer-player matches

**Details:** [commits](https://github.com/dchadd427/ants-cross-platform/compare/1ec8e125...dd11f9f7)

## v0.17.4 - 2026-11-17 - The screen stays on, steadier Menu, bots that cross bomb fields, a Discord admin page

**For operators:**
- **A new admin page.** Site admins sign in with Discord on the admin page to review the maps players send, handle chat bans and mutes, read the moderators' log and see how the site is doing; the old admin passwords are gone. Players see no change.

**Details:** [commits](https://github.com/dchadd427/ants-cross-platform/compare/433de635...4fb44bf6)

## v0.17.3 - 2026-11-16 - A Shift button for touch screens, moderation from the Players list, cleaner scores

**Details:** [commits](https://github.com/dchadd427/ants-cross-platform/compare/6fb219d9...81ef4f92)

## v0.17.2 - 2026-11-16 - Fairer computer players in 187, chat moderation from a phone

**Details:** [commits](https://github.com/dchadd427/ants-cross-platform/compare/da6092fb...443b5fbb)

## v0.17.1 - 2026-11-16 - Longer chat lines, bold numbers on every results column, computer players defend better against Thieves

**Details:** [commits](https://github.com/dchadd427/ants-cross-platform/compare/d63874e8...4a74eadd)

## v0.17.0 - 2026-11-15 - 187 drops nothing, leave your room from Home, a better emoji picker, bots walk round bombs

**Details:** [commits](https://github.com/dchadd427/ants-cross-platform/compare/06727fbd...2f426f13)

## v0.16.11 - 2026-11-15 - Away on the Players list, press outside a dialog to cancel, computer players that walk where they go

**Details:** [commits](https://github.com/dchadd427/ants-cross-platform/compare/25a64658...6b375eeb)

## v0.16.10 - 2026-11-15 - Chat box on one row, computer players take back power-ups and contest the ISLANDS ring

**Details:** [commits](https://github.com/dchadd427/ants-cross-platform/compare/491ca15c...c52809d1)

## v0.16.9 - 2026-11-14 - Numbers in the game's font, chat links and times, Discord server nicknames, a resizable front page

**Details:** [commits](https://github.com/dchadd427/ants-cross-platform/compare/a364d921...f2d101bf)

## Older versions (v0.16.8 and before)
