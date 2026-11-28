/* The seam between the pages of the game (the game page, the Map Maker, the sprite and sound catalog) and the site that serves them (docs/PLAY_IN_BROWSER.md, "The seam to a site"). A page
   loads this file twice, <script src="site_hooks.js" data-page="NAME">: in its head, before the stylesheets that a site adds, and where a site's own scripts would come. This copy does
   nothing: a page that has only this file is the game and its tools, with no counter, no chat hub, no match history and no bar at the top, and every hook below is empty. A site serves its
   own file in its place: it writes the tags of its styles (in the head) and scripts (at the end) with document.write and fills in the hooks, so that no page names a file of the site.
   A page looks for each hook before it calls it: one that is not there is one that does nothing. Plain ES5. */
(function (root) {
    'use strict';
    if (root.AntsSite) return;                   // (the second load of a page)
    root.AntsSite = {
        // The game page has started: { win, args (the game's arguments), replay (a recording or a live match), test (a test game from the Map Maker) }
        onPageStart: function (info) { /* nothing */ },
        // The game is running: how many milliseconds the page took to download it and start it
        gameStarted: function (ms) { /* nothing */ },
        // A game on this computer began (the game calls the page for it at its first tick; never for a test game)
        localGameReport: function () { /* nothing */ },
        // What the site knows of the match that the file holds: done({ map, seconds, players }), or done(null); a hook that never calls done is a hook that has nothing to say
        replayEntry: function (file, done) { /* nothing */ },
        // A recording has been played for a while (never a live match or a file of the visitor's own): { file, version (the page's build), playing (a function: does it play now?) }
        playCounter: function (info) { /* nothing */ },
        // The recording on show: { file, embed (the page is the frame of another page, which has the numbers itself) }
        replayStats: function (info) { /* nothing */ },
        // The Map Maker is up (the end of its start): the parts of the page that a site's own parts work with (the page's sitePage); the site's script adds its own
        mapMaker: function (page) { /* nothing */ }
    };
})(window);
