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
    mapmaker: { head: link('/site_nav.css'), end: ['site_nav.js', 'analytics.js', 'mapmaker_site.js'].map(script).join('') },
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

    if (failures) { console.log(failures + ' of ' + checks + ' checks failed'); process.exit(1); }
    console.log('ok: ' + checks + ' checks');
})().catch((e) => { console.log('FAIL the check stopped: ' + (e && e.stack || e)); process.exit(1); });
