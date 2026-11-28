/* The site's part of the Map Maker (web/front/mapmaker_app.js gives it the page's parts when the page is up: AntsSite.mapMaker, web/site_hooks.js): the buttons "Connect an AI..." (the AI's
   part is web/front/mapmaker_ai.js with mapmaker_ai_tools.js and mapmaker_ai.css) and "Submit for approval..." (web/front/mapmaker_submit.js), and My submissions, the second tab of My maps. Both parts
   are loaded the first time they are needed, so a player who never connects an AI or sends a map never downloads them. This script puts the two buttons in the top bar where the page's markup had
   them, disabled until the page is up, and does what the page did for them before the seam. ES5. */
(function (root) {
    'use strict';
    var doc = root.document;
    function el(tag, cls, text) { var n = doc.createElement(tag); if (cls) n.className = cls; if (text !== undefined) n.textContent = text; return n; }

    // The buttons, with the blanks around them that the page's markup had (the top bar's rows are not all flex)
    function addButtons() {
        var tags = doc.getElementById('top-tags'), menu = doc.querySelector('.edmenu.dsk'), download = menu && menu.querySelector('[data-act="download"]');
        if (tags) tags.insertAdjacentHTML('afterend', '\n        <button class="btn sm ghost aik-btn dsk" type="button" data-act="ai" disabled><span class="dt" aria-hidden="true"></span><span class="lbl">Connect an AI...</span></button>');
        if (download) download.insertAdjacentHTML('afterend', '\n        <button class="btn sm" type="button" data-act="submit" disabled>Submit for approval...</button>');
    }
    addButtons();

    root.AntsSite.mapMaker = function (page) {
        var win = page.win, $ = page.$, dialogs = page.dialogs, canvas = page.canvas, tools = page.tools, core = page.core, store = page.store, limits = page.limits, mine = page.mine, map = page.map;
        var MapView = win.MapView, MapStore = win.MapStore, MapSizes = win.MapSizes, MapChecks = win.MapChecks;
        var sent = null, sentWaiting = null, sentStore = null, aiPart = null, aiWaiting = null;
        (function () {
            var idb = null;
            try { idb = win.indexedDB || null; } catch (e) { idb = null; }
            sentStore = MapStore.createSent({ idb: idb });
        })();

        // The screens for sending a map are a script of their own (mapmaker_submit.js), loaded the first time they are needed: then(true) when it is there
        function withSubmit(then) {
            if (sent) return then(true);
            if (sentWaiting) return sentWaiting.push(then);
            sentWaiting = [then];
            var tag = el('script');
            function end(ok) {
                var waiting = sentWaiting;
                function done() { sentWaiting = null; waiting.forEach(function (f) { f(ok); }); if (ok) { mine.tabs(); linkOpened(); } }
                if (ok && win.MapSubmit) { var made = win.MapSubmit.create(submitEnv(sentStore)); made.load(function () { sent = made; done(); }); } else { ok = false; done(); }
            }
            tag.src = 'front/mapmaker_submit.js'; tag.onload = function () { end(true); }; tag.onerror = function () { end(false); };
            doc.head.appendChild(tag);
        }
        function submitOr(then) {
            withSubmit(function (ok) { if (ok) then(); else dialogs.message('This part did not load', 'The part of the page that sends maps did not load. Check your connection and try again.'); });
        }
        // A status link: its tokens join this browser's, the address loses its fragment, and the list opens
        function linkOpened() {
            sent.fromAddress(win.location.hash, function () { try { win.history.replaceState(null, '', win.location.pathname + win.location.search); } catch (e) {} }, function () { mine.show('sent'); });
        }
        // What My maps is given in place of the player's submissions: the real thing once the script is there
        function sentProxy() {
            return { count: function () { return sent ? sent.count() : null; }, hide: function () { if (sent) sent.hide(); }, show: function (ui) { submitOr(function () { sent.show(ui); }); }, preload: function () { withSubmit(function () {}); } };
        }

        // Send a map for approval (mapmaker_submit.js): the bytes that are sent are the bytes the checker has just judged (the open file, as Download hands it over); the player's own copy is never touched
        function submitEnv(sentStore) {
            return {
                doc: doc, dialogs: dialogs, store: store, sent: sentStore, fetch: win.fetch ? win.fetch.bind(win) : null, Abort: win.AbortController || null, tags: page.fillTags, thumb: function (file) { return MapView.miniBase(file, 56, 56, page.canvasOf); },
                later: function (f, ms) { win.setTimeout(f, ms); }, now: function () { return Date.now(); }, clipboard: win.navigator && win.navigator.clipboard,
                parse: function (bytes) { try { var f = win.MapFile.parse(bytes); return f.ok ? f : null; } catch (e) { return null; } },
                link: function () { return win.location.origin + win.location.pathname; },
                current: function () {
                    var made = page.fileBytes();
                    if (made.error) return { error: made.error };
                    var r = core.checkMap(made.bytes, 'extended'), file = r.status === 0 && win.MapFile.parse(made.bytes);
                    if (!file || !file.ok) { page.alive(); return { error: r.status === 0 ? 'This map cannot be read.' : MapChecks.capital(r.error) + '.' }; }
                    return { name: map().name, bytes: made.bytes, file: file, report: r.json };
                },
                showFinding: function (f) { if (typeof f.row === 'number' && f.row >= 0) { canvas.showCell(f.row, f.column); $('map').focus(); } else page.showChecks(); },
                onSee: function () { mine.show('sent'); },
                onOpenCopy: function (rec, again) {
                    if (dialogs.isOpen()) return;
                    page.leave(function () {
                        var error = page.setMap(new win.Uint8Array(rec.bytes), String(rec.name).slice(0, 40));
                        if (error) dialogs.message('This copy cannot be opened', error);
                        else if (again) dialogs.message('Change your map, then send it again', 'Make your changes, then choose “Submit for approval...”. It goes to the owner as a new submission.');
                    });
                }
            };
        }

        // Connect an AI (mapmaker_ai.js, mapmaker_ai_tools.js and the style): loaded the first time the button is pressed, then kept. then(part), or then(null) when a file did not load.
        function aiEnv() {
            return {
                doc: doc, win: win, dialogs: dialogs, fetch: win.fetch ? win.fetch.bind(win) : null, host: $('top'), entry: doc.querySelector('[data-act="ai"]'), announce: function (t) { $('announce').textContent = t; },
                view: function () { return canvas.state(); }, toScreen: MapView.toScreen, wrap: $('cv'), canvasNode: $('map'),
                tools: {
                    core: core, limits: limits, pictureMax: 409600, file: function () { return map().file; }, name: function () { return map().name; }, editor: function () { return tools.editor(); }, changed: function (d) { tools.changed(d); },
                    rebase: page.rebase, stroking: function () { return canvas.isStroking(); }, later: function (f, ms) { win.setTimeout(f, ms); }, isSaved: function () { return tools.isSaved(); }, numbered: page.freeName,
                    keep: function (name, done) { page.keepAs(name, function (error) { done(error); }); },
                    keepBefore: function (done) { page.keepAs(page.freeName(Array.from(map().name).slice(0, 28).join('') + ' (before AI)'), function (error) { done(error); }); },
                    newMap: function (kind, rows, columns, name) {
                        var made = kind === 'classic' ? core.blank(rows, columns, page.blank.ground, page.blank.eggs, page.blank.minutes, 'new_map') : core.blankExtended(rows, columns, page.blank.ground, page.blank.eggs, page.blank.minutes);
                        if (made.status === 2) page.alive();
                        return made.status !== 0 ? MapSizes.refusal(made.error).text : (page.setMap(page.withLongOrders(made.bytes), name) || '');
                    },
                    mini: function (file, w, h) { return MapView.miniBase(file, w, h, page.canvasOf); }, makeCanvas: page.canvasOf,
                    library: function () { return store.libraryList(); }, fetchMap: function (file, done) { store.fetchMap(file, done); },
                    edges: function () { return win.MapEdges && win.MapGround ? { MapEdges: win.MapEdges, MapGround: win.MapGround } : null; },
                    loadFill: page.loadFill
                }
            };
        }
        function withAi(then) {
            if (aiPart) return then(aiPart);
            if (aiWaiting) return aiWaiting.push(then);
            aiWaiting = [then];
            var left = 2, bad = false, c = el('link'), t = el('script'), p = el('script');
            function one(ok) {
                bad = bad || !ok;
                if (--left) return;
                var waiting = aiWaiting; aiWaiting = null;
                if (!bad && win.MapAi && !aiPart) aiPart = win.MapAi.create(aiEnv());
                waiting.forEach(function (f) { f(bad ? null : aiPart); });
            }
            c.rel = 'stylesheet'; c.href = 'front/mapmaker_ai.css'; c.onload = function () { one(true); }; c.onerror = function () { one(false); };
            t.src = 'front/mapmaker_ai_tools.js';
            t.onload = function () { p.src = 'front/mapmaker_ai.js'; p.onload = function () { one(true); }; p.onerror = function () { one(false); }; doc.head.appendChild(p); };
            t.onerror = function () { one(false); };
            doc.head.appendChild(c); doc.head.appendChild(t);
        }

        var ACTIONS = page.actions;
        ACTIONS.ai = function () { if (dialogs.isOpen() || canvas.isStroking()) return; withAi(function (part) { if (part) part.open(); else dialogs.message('This part did not load', 'The part of the page that connects an AI did not load. Check your connection and try again.'); }); };
        ACTIONS.submit = function () { if (!dialogs.isOpen() && !canvas.isStroking()) submitOr(function () { sent.open(); }); };
        ACTIONS.subs = function () { if (!dialogs.isOpen() && !canvas.isStroking()) mine.show('sent'); };
        page.menu.push({ text: 'Connect an AI...', onClick: ACTIONS.ai }, { text: 'Submit for approval...', onClick: ACTIONS.submit }, { text: 'My submissions', onClick: ACTIONS.subs });
        page.onChange(function () { if (aiPart) aiPart.touch(); });                // (the AI part counts every change of the map, whoever made it: a call that names an old version is refused)
        page.sent(sentProxy());
        Array.prototype.forEach.call(doc.querySelectorAll('[data-act="ai"], [data-act="submit"]'), function (b) {
            var act = ACTIONS[b.getAttribute('data-act')];
            b.addEventListener('click', function () { act(); });
            b.disabled = false;
        });
        if (/^#sent=/.test(win.location.hash)) withSubmit(function () {});
    };
})(window);
