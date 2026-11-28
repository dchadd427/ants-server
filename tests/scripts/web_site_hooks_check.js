// Runs the site's half of the seam (web/site/site_hooks.js and web/site/mapmaker_site.js; docs/PLAY_IN_BROWSER.md "The seam to a site") on fakes of the page, with the stub's list of hooks
// (web/site_hooks.js) as the contract:
//   1. site_hooks.js as a page runs it: in the head it gives the page its hooks (once: the second load leaves them) and writes the links of the site's styles, at the end it writes the tags of the site's
//      scripts, in the order of the lists, for the game page, the Map Maker and the catalog, and nothing for a page that it does not know;
//   2. the hooks: every hook of the stub except the Map Maker's is there, each one finds its script when it is called (a page that has none of the site's scripts does nothing, and nothing throws),
//      the start of a page and the time that the game took go to the scripts that count them, and the list of kept matches gives the entry of one match, or done(null) for every way to fail;
//   3. mapmaker_site.js: the two buttons are put in the top bar where the page's markup had them (with the blanks around them), the actions, the lines of the phone's File menu (in the order of the page's
//      markup), the second tab of My maps and the count of changes are given to the page, a press on a button runs its action, and the parts are loaded only when they are needed.
// tests/scripts/test_web_site_hooks.py runs this with node (the quick tier). usage: node web_site_hooks_check.js web/site/site_hooks.js web/site/mapmaker_site.js web/site_hooks.js     (exit 0: every check holds)
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const [hooksPath, makerPath, stubPath] = process.argv.slice(2).map((p) => path.resolve(p));
if (!stubPath) { console.log('usage: web_site_hooks_check.js site_hooks.js mapmaker_site.js stub.js'); process.exit(2); }
const SITE = require(hooksPath);

let checks = 0;
let failures = 0;
function check(label, ok, detail) {
    checks++;
    if (!ok) { failures++; console.log('FAIL ' + label + (detail === undefined ? '' : ' (' + detail + ')')); }
}
function same(label, got, want) {
    const a = JSON.stringify(got);
    const b = JSON.stringify(want);
    check(label, a === b, 'got ' + a + ', wanted ' + b);
}
const settle = () => new Promise((resolve) => setImmediate(resolve));

// ---- the contract: the stub's hooks ----
const stubWindow = vm.createContext({});
stubWindow.window = stubWindow;
vm.runInContext(fs.readFileSync(stubPath, 'utf8'), stubWindow);
const CONTRACT = Object.keys(stubWindow.AntsSite);

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
// 1. What a page loads: the head, the end, the pages
// ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
function pageRun(name, inHead, existing) {
    const written = [];
    const win = { AntsSite: existing };
    win.document = { currentScript: { getAttribute: (k) => (k === 'data-page' ? name : null) }, body: inHead ? null : {}, write: (s) => { written.push(s); } };
    SITE.run(win);
    return { win, written: written.join('') };
}
const link = (u) => '<link rel="stylesheet" href="' + u + '">';
const script = (u) => '<script src="' + u + '"></script>';
const WANT = {
    play: { head: ['site_nav.css', 'replay_stats.css', 'death_map.css', 'replay_activity.css'].map(link).join(''), end: ['site_nav.js', 'analytics.js', 'hub_here.js', 'history_page.js', 'death_map.js', 'replay_activity.js'].map(script).join('') },
    mapmaker: { head: link('/site_nav.css'), end: ['local_time.js', 'site_nav.js', 'analytics.js', 'mapmaker_site.js'].map(script).join('') },
    catalog: { head: link('/site_nav.css'), end: script('/site_nav.js') }
};
for (const name of Object.keys(WANT)) {
    const head = pageRun(name, true);
    same('the head of the ' + name + ' page gets the links of the site\'s styles, in their order', head.written, WANT[name].head);
    check('... and its hooks', !!head.win.AntsSite && typeof head.win.AntsSite === 'object');
    const end = pageRun(name, false, head.win.AntsSite);
    same('the end of the ' + name + ' page gets the tags of the site\'s scripts, in their order', end.written, WANT[name].end);
    check('... and its hooks are the ones it had', end.win.AntsSite === head.win.AntsSite);
}
same('a page that the file does not know gets nothing', [pageRun('lobby', true).written, pageRun('lobby', false).written, pageRun(null, true).written], ['', '', '']);
same('the pages that the file knows', Object.keys(SITE.PAGES).sort(), Object.keys(WANT).sort());
{
    const own = { onPageStart() {} };
    check('hooks that the page has already are not replaced', pageRun('play', true, own).win.AntsSite === own);
}

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
// 2. The hooks
// ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
{
    const hooks = SITE.hooks({});
    same('every hook of the stub but the Map Maker\'s is there', Object.keys(hooks).sort(), CONTRACT.filter((k) => k !== 'mapMaker').sort());
    // a window that has none of the site's scripts (and no fetch): the hooks that tell the scripts something do nothing and throw nothing; the stats of a recording are not asked for without a fetch
    const bare = SITE.hooks({});
    const quiet = { onPageStart: [{ win: {}, args: [], replay: false, test: false }], gameStarted: [1500], localGameReport: [], replayStats: [{ file: 'f', embed: false }] };
    for (const name of Object.keys(quiet)) {
        let thrown = null;
        try { bare[name](...quiet[name]); } catch (e) { thrown = e; }
        check('the hook ' + name + ' on a window with none of the site\'s scripts does nothing', thrown === null, thrown && thrown.message);
    }
    const seen = [];
    const win = { AntsHubHere: { begin: (info) => seen.push(['begin', info]) }, AntsAnalytics: { game: (ms) => seen.push(['game', ms]) } };
    const wired = SITE.hooks(win);
    const info = { win, args: ['--x'], replay: false, test: false };
    wired.onPageStart(info);
    wired.gameStarted(2500);
    same('the start of the page goes to the script that tells the hub, as the page gave it', seen[0], ['begin', info]);
    same('the time that the game took goes to the counter', seen[1], ['game', 2500]);
}
(async () => {
    function entries(answer) {
        const asked = [];
        const win = { fetch: (url, init) => { asked.push([url, init]); return answer(); } };
        return { hooks: SITE.hooks(win), asked };
    }
    const list = { replays: [{ file: 'a.antsrep', map: 'TREASURE', seconds: 125.7, players: ['Wren', 'Pip (bot)', 7, 'C', 'D', 'E'] }, { file: 'b.antsrep' }] };
    {
        const e = entries(() => Promise.resolve({ ok: true, json: () => Promise.resolve(list) }));
        const got = [];
        e.hooks.replayEntry('a.antsrep', (x) => got.push(x));
        e.hooks.replayEntry('b.antsrep', (x) => got.push(x));
        e.hooks.replayEntry('c.antsrep', (x) => got.push(x));
        await settle();
        same('the list of kept matches is asked for with no cache and the site\'s own credentials', e.asked[0], ['/replays', { cache: 'no-store', credentials: 'same-origin' }]);
        same('the entry of a match: its map, whole seconds and at most four players that are names', got[0], { map: 'TREASURE', seconds: 125, players: ['Wren', 'Pip (bot)', 'C', 'D'] });
        same('an entry that has none of it gets empty values', got[1], { map: '', seconds: 0, players: [] });
        same('a match that is not in the list is done(null)', got[2], null);
    }
    for (const [label, answer] of [['a refusal', () => Promise.resolve({ ok: false, status: 503 })], ['a lost request', () => Promise.reject(new TypeError('Failed to fetch'))], ['an answer that is no list', () => Promise.resolve({ ok: true, json: () => Promise.resolve({ replays: 'x' }) })], ['an answer that is not JSON', () => Promise.resolve({ ok: true, json: () => Promise.reject(new SyntaxError('no')) })]]) {
        const e = entries(answer);
        const got = [];
        e.hooks.replayEntry('a.antsrep', (x) => got.push(x));
        await settle();
        same(label + ' is done(null), once', got, [null]);
    }

    // ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
    // 3. The Map Maker's part
    // ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
    function el(name) { return { name, listeners: {}, disabled: true, inserted: [], insertAdjacentHTML(where, html) { this.inserted.push([where, html]); }, addEventListener(type, f) { this.listeners[type] = f; }, getAttribute(k) { return this.attrs[k]; }, attrs: {} }; }
    function makerRig(hash) {
        const tags = el('top-tags'), download = el('download'), ai = el('ai'), submit = el('submit');
        ai.attrs = { 'data-act': 'ai' }; submit.attrs = { 'data-act': 'submit' };
        const menu = { querySelector: (q) => (q === '[data-act="download"]' ? download : null) };
        const heads = [];
        const doc = {
            getElementById: (id) => (id === 'top-tags' ? tags : null), querySelector: (q) => (q === '.edmenu.dsk' ? menu : null),
            querySelectorAll: (q) => (q === '[data-act="ai"], [data-act="submit"]' ? [ai, submit] : []),
            createElement: (tag) => ({ tag, rel: '' }), head: { appendChild: (n) => { heads.push(n); } }
        };
        const win = { AntsSite: {}, document: doc, location: { hash: hash || '', origin: 'https://x', pathname: '/mapmaker', search: '' }, indexedDB: null, Array, setTimeout: () => 0 };
        win.MapStore = { createSent: (env) => ({ env }) };
        win.MapView = { toScreen() {}, miniBase() {} }; win.MapSizes = {}; win.MapChecks = {};
        const context = vm.createContext(win);
        context.window = context;
        vm.runInContext(fs.readFileSync(makerPath, 'utf8'), context);
        return { win: context, tags, download, ai, submit, heads };
    }
    {
        const r = makerRig();
        same('the AI button goes right after the tags, with the blanks of the markup', r.tags.inserted, [['afterend', '\n        <button class="btn sm ghost aik-btn dsk" type="button" data-act="ai" disabled><span class="dt" aria-hidden="true"></span><span class="lbl">Connect an AI...</span></button>']]);
        same('the Submit button goes right after Download', r.download.inserted, [['afterend', '\n        <button class="btn sm" type="button" data-act="submit" disabled>Submit for approval...</button>']]);
        check('the script gives the page its part', typeof r.win.AntsSite.mapMaker === 'function');
        const calls = [];
        const actions = {}, menu = [], changes = [];
        let sent;
        const dialogs = { isOpen: () => false, message: (a, b) => calls.push(['message', a]) };
        const mine = { tabs: () => calls.push(['tabs']), show: (w) => calls.push(['show', w]) };
        const page = { win: r.win, $: () => ({}), dialogs, canvas: { isStroking: () => false }, tools: {}, core: {}, store: {}, limits: {}, mine, map: () => ({ name: 'My map' }), actions, menu,
                       onChange: (f) => changes.push(f), sent: (x) => { sent = x; }, blank: {} };
        r.win.AntsSite.mapMaker(page);
        same('the page is given the actions of the site', Object.keys(actions).sort(), ['ai', 'submit', 'subs']);
        same('and the lines of the phone\'s File menu, in the order of the markup', menu.map((m) => m.text), ['Connect an AI...', 'Submit for approval...', 'My submissions']);
        same('... each of them the action of the same name', menu.map((m, i) => m.onClick === [actions.ai, actions.submit, actions.subs][i]), [true, true, true]);
        check('and a function that counts the changes of the map', changes.length === 1 && typeof changes[0] === 'function');
        check('My maps is given the player\'s submissions (the tab is there from the first press, the script comes with it)', !!sent && typeof sent.count === 'function' && typeof sent.show === 'function' && typeof sent.preload === 'function' && sent.count() === null);
        check('the buttons are enabled and a press of each runs its action', !r.ai.disabled && !r.submit.disabled && typeof r.ai.listeners.click === 'function' && typeof r.submit.listeners.click === 'function');
        changes[0]();                                                                              // (no AI part yet: nothing to count, nothing thrown)
        actions.subs();
        same('My submissions opens the second tab of My maps', calls.filter((c) => c[0] === 'show'), [['show', 'sent']]);
        check('nothing is loaded before it is needed: the page of the site has not asked for a script', r.heads.length === 0);
        r.ai.listeners.click();
        same('the AI part is loaded at the first press: its style, then the tools', r.heads.map((n) => n.href || n.src), ['front/mapmaker_ai.css', 'front/mapmaker_ai_tools.js']);
    }
    {
        const r = makerRig('#sent=abc');
        const page = { win: r.win, $: () => ({}), dialogs: { isOpen: () => false, message() {} }, canvas: { isStroking: () => false }, tools: {}, core: {}, store: {}, limits: {}, mine: { tabs() {}, show() {} }, map: () => ({}), actions: {}, menu: [], onChange() {}, sent() {}, blank: {} };
        r.win.AntsSite.mapMaker(page);
        same('an address with a status link loads the part for sending maps at once', r.heads.map((n) => n.src), ['front/mapmaker_submit.js']);
    }

    // ---- the sending of maps, the AI and the page's own functions that they call, run on the real script with fakes of the page (the parts that the page hands over are recorders) ----
    function pageOf(r, over) {
        const log = [];
        const state = { open: false, stroking: false };
        const base = {
            win: r.win, $: () => ({ textContent: '' }), dialogs: { isOpen: () => state.open, message: (title) => log.push(['message', title]) }, canvas: { isStroking: () => state.stroking, showCell() {}, state: () => ({}) },
            tools: {}, core: { checkMap: () => ({ status: 0, json: '{"ok":1}' }), blank: () => ({ status: 0, bytes: new Uint8Array([1]) }), blankExtended: () => ({ status: 0, bytes: new Uint8Array([2]) }) },
            store: {}, limits: {}, mine: { tabs: () => log.push(['tabs']), show: (w) => log.push(['show', w]) }, map: () => ({ name: 'My map', file: { rows: 31 } }), actions: {}, menu: [], onChange() {}, sent() {}, blank: { ground: 1, eggs: 2, minutes: 3 },
            fileBytes: () => ({ bytes: new Uint8Array([7, 7]) }), alive: () => log.push(['alive']), setMap: (bytes, name) => { log.push(['setMap', Array.from(bytes), name]); return ''; }, withLongOrders: (bytes) => { log.push(['long']); return Uint8Array.from([9, 9]); },
            leave: (f) => f(), rebase() {}, keepAs() {}, freeName: (n) => n, loadFill() {}, canvasOf() {}, fillTags() {}, showChecks: () => log.push(['checks'])
        };
        return { page: Object.assign(base, over || {}), log, state };
    }
    function richRig(hash) {
        const r = makerRig(hash);
        r.win.MapChecks.capital = (t) => t.charAt(0).toUpperCase() + t.slice(1);
        r.win.MapFile = { parse: (bytes) => ({ ok: true, rows: 31, bytes }) };
        r.win.history = { replaceState: (...a) => { r.replaced = (r.replaced || []).concat([a]); } };
        return r;
    }
    {   // Submit for approval: loaded at the first press and never before; nothing happens over a dialog or in a stroke; one script however many presses; a script that does not load is told, and asked for again
        const r = richRig();
        const made = { creates: 0, opened: 0, env: null };
        r.win.MapSubmit = { create: (env) => { made.creates++; made.env = env; return { load: (done) => done(), open: () => { made.opened++; }, count: () => 0, hide() {}, show() {}, fromAddress() {} }; } };
        const { page, log, state } = pageOf(r);
        r.win.AntsSite.mapMaker(page);
        state.open = true; page.actions.submit();
        state.open = false; state.stroking = true; page.actions.submit();
        check('a press over a dialog or in the middle of a stroke loads nothing', r.heads.length === 0 && made.opened === 0);
        state.stroking = false;
        page.actions.submit();
        same('the first press loads the script that sends maps, and no other', r.heads.map((n) => n.src), ['front/mapmaker_submit.js']);
        check('... and opens nothing before it is there', made.opened === 0 && made.creates === 0);
        r.heads[0].onload();
        check('when it is there its screens are made once and the dialog opens', made.creates === 1 && made.opened === 1);
        check('... and My maps is told (its second tab)', log.some((l) => l[0] === 'tabs'));
        page.actions.submit();
        check('a second press opens the dialog again and loads nothing', made.opened === 2 && r.heads.length === 1 && made.creates === 1);
        state.open = true; page.actions.subs(); state.open = false; state.stroking = true; page.actions.subs(); state.stroking = false;
        check('My submissions does not open over a dialog or in a stroke', !log.some((l) => l[0] === 'show'));
        page.actions.subs();
        same('... and opens the second tab of My maps otherwise', log.filter((l) => l[0] === 'show'), [['show', 'sent']]);
        // the bytes that are sent are the bytes that were judged, in the form that Download hands over
        const sentBytes = new Uint8Array([4, 5, 6]);
        const asked = [];
        const r2 = richRig();
        const { page: page2, log: log2 } = pageOf(r2, { fileBytes: () => ({ bytes: sentBytes }), core: { checkMap: (b, kind) => { asked.push([b, kind]); return { status: 0, json: '{"ok":1}' }; } } });
        r2.win.MapSubmit = { create: (env) => { made.env = env; return { load: (done) => done(), open() {}, count: () => 0, hide() {}, show() {}, fromAddress() {} }; } };
        r2.win.AntsSite.mapMaker(page2);
        page2.actions.submit(); r2.heads[0].onload();
        const got = made.env.current();
        check('what is sent is the bytes that the checker judged, as extended', got.bytes === sentBytes && asked.length === 1 && asked[0][0] === sentBytes && asked[0][1] === 'extended', JSON.stringify([got.name, asked.length]));
        same('... with the map\'s name and the checker\'s report', [got.name, got.report], ['My map', '{"ok":1}']);
        check('the rules word of the map is never changed on its way (no conversion is asked for)', !log2.some((l) => l[0] === 'long'));
        const refused = richRig();
        const rf = pageOf(refused, { core: { checkMap: () => ({ status: 1, error: 'the map has no ants' }) } });
        refused.win.MapSubmit = { create: (env) => { made.env = env; return { load: (done) => done(), open() {}, count: () => 0, hide() {}, show() {}, fromAddress() {} }; } };
        refused.win.AntsSite.mapMaker(rf.page);
        rf.page.actions.submit(); refused.heads[0].onload();
        same('a map that the checker refuses is not sent: its reason is the answer, in a sentence', made.env.current(), { error: 'The map has no ants.' });
        check('... and the page is asked to see that its core is alive (a refusal of the core itself)', rf.log.some((l) => l[0] === 'alive'));
        check('... and a map that cannot even be written is the page\'s answer', (() => { const e = richRig(); const p = pageOf(e, { fileBytes: () => ({ error: 'Too big.' }) }); e.win.MapSubmit = { create: (env) => { made.env = env; return { load: (done) => done(), open() {}, count: () => 0, hide() {}, show() {}, fromAddress() {} }; } }; e.win.AntsSite.mapMaker(p.page); p.page.actions.submit(); e.heads[0].onload(); return JSON.stringify(made.env.current()) === JSON.stringify({ error: 'Too big.' }); })());
        // a script that does not load
        const f = richRig();
        const fp = pageOf(f);
        f.win.AntsSite.mapMaker(fp.page);
        fp.page.actions.submit();
        f.heads[0].onerror();
        check('a script that does not load is told in a dialog, in plain words', fp.log.some((l) => l[0] === 'message' && l[1] === 'This part did not load'));
        fp.page.actions.submit();
        check('... and the next press asks for it again', f.heads.length === 2 && f.heads[1].src === 'front/mapmaker_submit.js');
    }
    {   // a status link: the part is loaded at once; its token joins the browser's, the address loses its fragment, and the list opens
        const r = richRig('#sent=abc');
        r.win.location.search = '?lang=en';
        const seen = {};
        r.win.MapSubmit = { create: () => ({ load: (done) => done(), open() {}, count: () => 0, hide() {}, show() {}, fromAddress: (hash, taken, opened) => { seen.hash = hash; seen.taken = taken; seen.opened = opened; } }) };
        const { page, log } = pageOf(r);
        r.win.AntsSite.mapMaker(page);
        same('an address with a status link loads the part at once', r.heads.map((n) => n.src), ['front/mapmaker_submit.js']);
        r.heads[0].onload();
        same('the page hands the link to the part', seen.hash, '#sent=abc');
        check('the address keeps its path and its query and loses the token once it is taken in', (() => { seen.taken(); return JSON.stringify(r.replaced) === JSON.stringify([[null, '', '/mapmaker?lang=en']]); })(), JSON.stringify(r.replaced));
        seen.opened();
        check('the list of the player\'s submissions opens', log.some((l) => l[0] === 'show' && l[1] === 'sent'));
        const plain = richRig('#something-else');
        plain.win.MapSubmit = { create: () => { throw new Error('not wanted'); } };
        plain.win.AntsSite.mapMaker(pageOf(plain).page);
        check('any other fragment loads nothing', plain.heads.length === 0);
    }
    {   // Connect an AI: its style and tools first, then the part; the part counts every change of the map; the tool that makes a new map uses the page's rule for the rules word
        const r = richRig();
        const part = { opened: 0, touched: 0 };
        let aiEnv = null;
        r.win.MapAi = { create: (env) => { aiEnv = env; return { open: () => { part.opened++; }, touch: () => { part.touched++; } }; } };
        const changes = [];
        const { page, log, state } = pageOf(r, { onChange: (f) => changes.push(f) });
        r.win.AntsSite.mapMaker(page);
        state.open = true; page.actions.ai(); state.open = false;
        check('a press over a dialog loads nothing', r.heads.length === 0);
        page.actions.ai();
        same('the first press loads the style and the tools', r.heads.map((n) => n.href || n.src), ['front/mapmaker_ai.css', 'front/mapmaker_ai_tools.js']);
        r.heads[1].onload();
        same('the tools come before the part that needs them', r.heads.map((n) => n.href || n.src), ['front/mapmaker_ai.css', 'front/mapmaker_ai_tools.js', 'front/mapmaker_ai.js']);
        check('nothing opens before all three are there', part.opened === 0 && aiEnv === null);
        r.heads[0].onload(); r.heads[2].onload();
        check('the part is made once and opens', part.opened === 1 && aiEnv !== null);
        page.actions.ai();
        check('a second press opens it again and loads nothing', part.opened === 2 && r.heads.length === 3);
        changes[0]();
        check('the part counts a change of the map, whoever made it', part.touched === 1);
        // the AI's tool that makes a new map: the same rule for the rules word as the page's New map, and the person's work was kept first (the page's own functions do it)
        const result = aiEnv.tools.newMap('extended', 31, 31, 'AI map');
        same('a new map from the AI goes through the page\'s rule for the rules word', [result, log.filter((l) => l[0] === 'long').length, log.filter((l) => l[0] === 'setMap')], ['', 1, [['setMap', [9, 9], 'AI map']]]);
        const classic = aiEnv.tools.newMap('classic', 20, 20, 'Old map');
        check('a Classic map is made by the core\'s Classic call', classic === '' && log.filter((l) => l[0] === 'setMap').length === 2);
        // a part that does not load
        const bad = richRig();
        const bp = pageOf(bad);
        bad.win.AntsSite.mapMaker(bp.page);
        bp.page.actions.ai();
        bad.heads[0].onerror(); bad.heads[1].onerror();
        check('a part that does not load is told in plain words', bp.log.some((l) => l[0] === 'message' && l[1] === 'This part did not load'));
    }

    if (failures) { console.log(failures + ' of ' + checks + ' checks failed'); process.exit(1); }
    console.log('ok: ' + checks + ' checks');
})().catch((e) => { console.log('FAIL the check stopped: ' + (e && e.stack || e)); process.exit(1); });
