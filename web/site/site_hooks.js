/* The site's half of the seam between its pages and the game (web/site_hooks.js is the stub that a tree without a site has, and says what each hook is for). The image serves THIS file as
   /site_hooks.js. A page loads it twice, <script src="site_hooks.js" data-page="NAME">: in its head, where it writes the tags of the site's styles (and gives the page its hooks), and where
   the site's scripts come (the end of the page, after the markup that they work on), where it writes theirs. document.write puts a tag exactly where the script stands, so the files
   load in order and before the page's own code, as the tags of the page itself did. The lists are what each page loaded before it had the seam, in the same order.
   ES5, no module system: a page gets AntsSite, node gets module.exports (tests/scripts/test_web_site_hooks.py). */
(function (root, factory) {
    'use strict';
    var api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    else api.run(root);
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';
    // What each kind of page loads of the site: the game page (play), the Map Maker (mapmaker) and the sprite and sound catalog (catalog). Quoted keys: the tests read this table as it stands (tests/scripts/site_pages.py)
    var PAGES = {
        'play': {
            'styles': ['site_nav.css', 'replay_stats.css', 'death_map.css', 'replay_activity.css'],
            'scripts': ['site_nav.js', 'analytics.js', 'hub_here.js', 'history_page.js', 'death_map.js', 'replay_activity.js']
        },
        'mapmaker': { 'styles': ['/site_nav.css'], 'scripts': ['site_nav.js', 'analytics.js', 'mapmaker_site.js'] },
        'catalog': { 'styles': ['/site_nav.css'], 'scripts': ['/site_nav.js'] }
    };

    // The hooks of the game page (the stub's list says what the page tells and when). Each one looks for its script when it is called: a page that has none of the site's scripts does nothing.
    function hooks(win) {
        return {
            onPageStart: function (info) { if (win.AntsHubHere) win.AntsHubHere.begin(info); },
            gameStarted: function (ms) { if (win.AntsAnalytics) win.AntsAnalytics.game(ms); },
            // ANTS_REPORT_BEGIN (tests/scripts/web_report_check.js runs this function with a fake fetch and a table of failures)
            // The server counts a game on THIS computer for the numbers of the front page (docs/SERVER.md, the section on the site statistics): one POST with nothing in it; no retry, nothing on the page, and no
            // failure (no fetch, a throw, a refused or lost request, a 503) is ever the game's business. The game page does not call it for a test game from the Map Maker.
            localGameReport: function () {
                try {
                    var sent = win.fetch('/stats/local', { method: 'POST', keepalive: true });
                    if (sent && typeof sent.catch === 'function') sent.catch(function () { /* only the front page's numbers depend on it: nobody is told */ });
                } catch (e) { /* no fetch in this browser: nothing is counted */ }
            },
            // ANTS_REPORT_END
            // The public list of kept matches knows what a finished match was (the map, the time, the players): a look, and done(null) when the list or the match is not there
            replayEntry: function (file, done) {
                win.fetch('/replays', { cache: 'no-store', credentials: 'same-origin' }).then(function (response) { return response.ok ? response.json() : null; }).then(function (data) {
                    var list = data && Array.isArray(data.replays) ? data.replays : [];
                    var e = list.filter(function (x) { return x && x.file === file; })[0];
                    done(e ? { map: typeof e.map === 'string' ? e.map : '', seconds: typeof e.seconds === 'number' && isFinite(e.seconds) ? Math.floor(e.seconds) : 0,
                               players: (Array.isArray(e.players) ? e.players : []).filter(function (p) { return typeof p === 'string'; }).slice(0, 4) } : null);
                }).catch(function () { done(null); });
            },
            // PLAYS_BEGIN (tests/scripts/web_plays_check.js runs this block on a page of fakes)
            // A recording of the server's own store is one play after 10 s of playing (web/replay_plays.js, docs/REPLAYS.md "Watching a replay"): never a match that is being played, never a file of your own (the game
            // page does not call this for those); the script is fetched for these only
            playCounter: function (info) {
                if (win.AntsHistory.idOfFile(info.file)) {
                    var plays = win.document.createElement('script');
                    plays.src = 'replay_plays.js?v=' + info.version;
                    plays.onload = function () { win.AntsPlays.start(win, win.AntsHistory.idOfFile(info.file), info.playing); };
                    win.document.head.appendChild(plays);      // (a script that cannot be had counts nothing: no other part of the page waits for it)
                }
            },
            // PLAYS_END
            // The stats of the match on show (docs/REPLAYS.md "The match pages"): the server's record of it as a panel (the Stats button on a wide screen, a row under the controls on a phone); web/history_page.js.
            // The small map "Where ants died" in the panel: web/death_map.js; the activity curve of the timeline from the same record: web/replay_activity.js; the frame of a match page gets the curve and no
            // panel: that page has the numbers itself.
            replayStats: function (info) {
                if (typeof win.fetch !== 'function') return;
                win.AntsHistory.replayStats({ document: win.document, fetch: win.fetch.bind(win), file: info.file, curveOnly: info.embed, redraw: win.AntsDeathMap && win.AntsDeathMap.redraw, deathMap: win.AntsDeathMap && win.AntsDeathMap.create(win.document, function (name) { return win.getComputedStyle(win.document.documentElement).getPropertyValue(name); }, { replay: win.AntsReplay, storage: (function () { try { return win.localStorage; } catch (e) { return null; } })() }), onRecord: win.AntsActivity && function (rec) { win.AntsActivity.mount(win, rec); } });
            }
        };
    }

    // The tags of one page: the styles in its head, the scripts at its end (the first run of this file has no body yet)
    function tags(page, inHead) {
        var list = PAGES[page];
        if (!list) return '';
        return (inHead ? list.styles : list.scripts).map(function (url) {
            return inHead ? '<link rel="stylesheet" href="' + url + '">' : '<script src="' + url + '"></script>';
        }).join('');
    }

    function run(win) {
        var doc = win.document, me = doc.currentScript, page = me ? me.getAttribute('data-page') : '', inHead = !doc.body;
        if (inHead && !win.AntsSite) win.AntsSite = hooks(win);
        var text = tags(page, inHead);
        if (text) doc.write(text);
    }

    return { PAGES: PAGES, hooks: hooks, tags: tags, run: run };
});
