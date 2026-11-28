// Runs the seam between the pages of the game and a site (web/site_hooks.js, docs/PLAY_IN_BROWSER.md "The seam to a site") with the STUB alone, as a tree without a site has it: the file defines
// every hook and every hook does nothing and throws nothing; a second load of it changes nothing and a site's own object is never replaced; and the game page's own part of the hooks (the block
// ANTS_REPORT_BEGIN .. ANTS_REPORT_END of web/shell.html) works with the stub, with no object at all and with a site that throws, and asks a site for a game on this computer once, and never for a test game;
// and the page's other calls of the hooks (the start of the page, the time the game took, the entry of a finished match, the stats of a recording) are run on fakes: when each one asks, and with what;
// and the Map Maker's own part of the hook (web/front/mapmaker_app.js: what it hands to a site's part when it is up, the lines that the site adds to the phone's File menu, the count of changes, the player's
// submissions in My maps) is run the same way when its script is given.
// tests/scripts/test_web_seam.py runs this with node (the quick tier). usage: node web_seam_check.js web/site_hooks.js web/shell.html [web/front/mapmaker_app.js]     (exit 0: every check holds; every failure is printed; with the Map Maker's script its part of the hook is run too)
'use strict';
const fs = require('fs');
const vm = require('vm');

const [stubPath, shellPath, appPath] = process.argv.slice(2);
if (!stubPath || !shellPath) { console.log('usage: web_seam_check.js site_hooks.js shell.html [mapmaker_app.js]'); process.exit(2); }

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

const stub = fs.readFileSync(stubPath, 'utf8');

// One page's window: the stub is a script of it, and nothing of the document may be touched (a page that has only the stub writes nothing)
function load(window) {
    const touched = [];
    const guard = new Proxy({}, { get(_, name) { touched.push(String(name)); return () => {}; } });
    const context = vm.createContext(Object.assign({ document: guard }, window || {}));
    context.window = context;
    vm.runInContext(stub, context);
    return { context, touched };
}

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
// 1. The stub: every hook is there, and does nothing
// ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
const HOOKS = ['onPageStart', 'gameStarted', 'localGameReport', 'replayEntry', 'playCounter', 'replayStats', 'mapMaker'];
{
    const { context, touched } = load();
    const site = context.AntsSite;
    check('the stub defines window.AntsSite', !!site && typeof site === 'object');
    same('the hooks that the stub defines', Object.keys(site).sort(), HOOKS.slice().sort());
    check('every hook is a function', HOOKS.every((name) => typeof site[name] === 'function'));
    let answered = 0;
    const calls = {
        onPageStart: [{ win: context, args: [], replay: false, test: false }],
        gameStarted: [1234],
        localGameReport: [],
        replayEntry: ['ants-TREASURE-20261124-014546Z.antsrep', () => { answered++; }],
        playCounter: [{ file: 'ants-TREASURE-20261124-014546Z.antsrep', version: '1', playing: () => true }],
        replayStats: [{ file: 'ants-TREASURE-20261124-014546Z.antsrep', embed: false }],
        mapMaker: [{}]
    };
    for (const name of HOOKS) {
        let thrown = null;
        let result;
        try { result = site[name](...calls[name]); } catch (e) { thrown = e; }
        check('the hook ' + name + ' does nothing and throws nothing', thrown === null && result === undefined, thrown && thrown.message);
    }
    check('a recording\'s hook that has nothing to say never calls done', answered === 0);
    same('the stub touches nothing of the document', touched, []);
    const first = context.AntsSite;
    vm.runInContext(stub, context);
    check('a second load of the stub leaves the same object', context.AntsSite === first);
    const own = { onPageStart() {} };
    const other = load({ AntsSite: own });
    check('a site\'s own object is never replaced', other.context.AntsSite === own && Object.keys(own).join() === 'onPageStart');
}

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
// 2. The game page's report of a game on this computer: the page's part of the hook
// ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
const text = fs.readFileSync(shellPath, 'utf8');
const begin = text.indexOf('ANTS_REPORT_BEGIN');
const end = text.indexOf('ANTS_REPORT_END');
if (begin < 0 || end < begin || text.indexOf('ANTS_REPORT_BEGIN', begin + 1) >= 0) { console.log('FAIL the block ANTS_REPORT_BEGIN .. ANTS_REPORT_END is missing or twice in ' + shellPath); process.exit(1); }
const block = text.slice(text.indexOf('\n', begin) + 1, text.lastIndexOf('\n', end));

// A page whose script has `antsSite` (the object that the page takes from window.AntsSite, or {}) and the test flag of the page; the block is a script of it, and its function is a global of the page, as the game's EM_JS code needs it
function page(antsSite, test) {
    const context = vm.createContext({ antsSite });
    if (test !== undefined) context.ANTS_TEST = test;
    vm.runInContext(block, context);
    return context;
}

{
    const { context } = load();
    const p = page(context.AntsSite, null);
    check('antsReportLocalGame is a global of the page', typeof p.antsReportLocalGame === 'function');
    let thrown = null;
    let result;
    try { result = p.antsReportLocalGame(); } catch (e) { thrown = e; }
    check('with the stub alone, the game calls it and nothing happens', thrown === null && result === undefined, thrown && thrown.message);
    same('with no object at all', (() => { try { return page({}, null).antsReportLocalGame(); } catch (e) { return 'threw ' + e.message; } })(), undefined);
}
{
    let reported = 0;
    const site = { localGameReport: function () { reported++; } };
    page(site, null).antsReportLocalGame();
    same('a site is asked once for each game on this computer', reported, 1);
    const p = page(site, null);
    p.antsReportLocalGame(); p.antsReportLocalGame();
    same('and again for the next one', reported, 3);
    page(site, { id: 'k7m2xq9abc12' }).antsReportLocalGame();
    same('a test game from the Map Maker is never reported', reported, 3);
    page(site, undefined).antsReportLocalGame();
    same('a page that has no test flag at all reports', reported, 4);
    let thrown = null;
    try { page({ localGameReport: function () { throw new Error('the site is down'); } }, null).antsReportLocalGame(); } catch (e) { thrown = e; }
    check('a site that throws is never the game\'s business', thrown === null, thrown && thrown.message);
}

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
// 3. The game page's other calls of the hooks: the line of the page that makes each one is run on fakes (when it asks, and with what), with a site that records its calls and with a page that has no site
// ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
const lines = text.split('\n');
function callOf(hook) {
    const found = lines.filter((l) => l.indexOf('antsSite.' + hook + '(') >= 0);
    check('the page has exactly one line that asks the site for ' + hook, found.length === 1, found.length);
    return found[0] || '';
}
// the calls that a site's hook gets from the line, in order: [[argument, ...], ...]; the page's own names (what the line reads) are given in `names`
function asked(hook, line, names, site) {
    const calls = [];
    const antsSite = site === null ? {} : { [hook]: function () { calls.push(Array.from(arguments)); } };
    vm.runInNewContext(line, Object.assign({ antsSite }, names));
    return calls;
}
{
    const line = callOf('onPageStart');
    const win = { name: 'window' };
    same('the start of the page is told once, with the window, the game\'s arguments, whether it is a recording and whether it is a test game',
        asked('onPageStart', line, { window: win, ANTS_ARGS: ['--x'], ANTS_REPLAY_MODE: true, ANTS_TEST: null }),
        [[{ win, args: ['--x'], replay: true, test: false }]]);
    same('a test game is told as a test game', asked('onPageStart', line, { window: win, ANTS_ARGS: [], ANTS_REPLAY_MODE: false, ANTS_TEST: { id: 'k7m2xq9abc12' } })[0][0].test, true);
    check('a page with no site asks nobody and throws nothing', (() => { try { asked('onPageStart', line, { window: win, ANTS_ARGS: [], ANTS_REPLAY_MODE: false, ANTS_TEST: null }, null); return true; } catch (e) { return false; } })());
}
{
    const line = callOf('gameStarted');
    same('how long the page took to start the game goes to the site, in milliseconds', asked('gameStarted', line, { window: { performance: {} }, performance: { now: () => 4321.5 } }), [[4321.5]]);
    same('a browser with no clock tells the site nothing', asked('gameStarted', line, { window: {}, performance: undefined }), []);
    check('a page with no site throws nothing', (() => { try { asked('gameStarted', line, { window: { performance: {} }, performance: { now: () => 1 } }, null); return true; } catch (e) { return false; } })());
}
{
    const line = callOf('replayEntry');
    const done = function () {};
    same('the site is asked about a finished match with the name of its file and the page\'s own answer', asked('replayEntry', line, { overFile: 'ants-TREASURE-20261124-014546Z.antsrep', done }), [['ants-TREASURE-20261124-014546Z.antsrep', done]]);
    check('a page with no site asks nobody and throws nothing', (() => { try { asked('replayEntry', line, { overFile: 'f', done }, null); return true; } catch (e) { return false; } })());
}
{
    // the stats of the match on show: only for a recording of the site's own store (a file of its own name), never for a live match, a file of the visitor's own (its address has no such name) or a page that is no recording
    const line = callOf('replayStats');
    const ask = (o) => asked('replayStats', line, Object.assign({ ANTS_REPLAY_MODE: true, ANTS_LIVE_MODE: false, ANTS_OWN_MODE: false, ANTS_REPLAY_FILE: 'ants-TREASURE-20261124-014546Z.antsrep', ANTS_EMBED: false }, o));
    same('a recording of the site\'s own store is shown with its stats', ask({}), [[{ file: 'ants-TREASURE-20261124-014546Z.antsrep', embed: false }]]);
    same('... and the frame of a match page says so (the curve alone)', ask({ ANTS_EMBED: true })[0][0].embed, true);
    same('a live match has none', ask({ ANTS_LIVE_MODE: true }), []);
    same('a file of the visitor\'s own has none (its address carries no name of the site\'s store)', ask({ ANTS_OWN_MODE: true, ANTS_REPLAY_FILE: '' }), []);
    same('a page that is no recording has none', ask({ ANTS_REPLAY_MODE: false, ANTS_REPLAY_FILE: null }), []);
    same('a recording with no file name has none', ask({ ANTS_REPLAY_FILE: '' }), []);
    check('a page with no site asks nobody and throws nothing', (() => { try { asked('replayStats', line, { ANTS_REPLAY_MODE: true, ANTS_LIVE_MODE: false, ANTS_OWN_MODE: false, ANTS_REPLAY_FILE: 'f', ANTS_EMBED: false }, null); return true; } catch (e) { return false; } })());
}

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
// 4. The Map Maker's part of the hook: what the page hands to a site's part when it is up, and what it does with what that part asks for (the page's own functions, taken out of its script and run
//    on fakes: the page needs a real canvas and the map core to run as a whole)
// ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
if (appPath) {
    const app = fs.readFileSync(appPath, 'utf8');
    const functionOf = (name) => {
        const found = new RegExp('\\n    function ' + name + '\\([^)]*\\) \\{\\n[\\s\\S]*?\\n    \\}\\n').exec(app) || new RegExp('\\n    function ' + name + '\\([^)]*\\) \\{[^\\n]*\\}\\n').exec(app);
        check('the Map Maker\'s script has the function ' + name, found !== null);
        return found ? found[0] : '';
    };
    const lineOf = (start) => {
        const found = app.split('\n').filter((l) => l.trim().indexOf(start) === 0);
        check('the Map Maker\'s script has exactly one line that starts with ' + start, found.length === 1, found.length);
        return found[0] || '';
    };
    const declared = lineOf('var siteChanges = [], siteMenu = [];');
    const menuLine = lineOf("menu: function () { dialogs.menu(").trim();
    const startLine = lineOf('if (win.AntsSite && win.AntsSite.mapMaker) win.AntsSite.mapMaker(sitePage());');
    // The page's names that a part needs and this check does not give are fakes (a function that answers with another one): the code runs on its own state, and the state that the check looks at is given
    function fakeOf(label) { const f = function () { return fakeOf(label + '()'); }; return new Proxy(f, { get: (t, k) => (k === Symbol.toPrimitive ? () => label : k === 'then' ? undefined : k in t ? t[k] : fakeOf(label + '.' + String(k))) }); }
    function run(code, scope) {
        const proxy = new Proxy(scope, { has: (t, k) => typeof k === 'string', get: (t, k) => (typeof k !== 'string' ? undefined : k in t ? t[k] : k in globalThis ? globalThis[k] : fakeOf(k)) });
        return new Function('scope', 'with (scope) { return (function () { ' + code + ' })(); }')(proxy);
    }
    const parts = declared + functionOf('siteChanged') + functionOf('edited') + functionOf('setMap') + functionOf('sitePage') + 'var ACTIONS = { go: 1, ' + menuLine + ' };';
    const rig = (scope) => run(parts + ' return { siteChanged: siteChanged, edited: edited, setMap: setMap, sitePage: sitePage, ACTIONS: ACTIONS, siteMenu: siteMenu, siteChanges: siteChanges };', scope);

    {   // a site's part is told of every change of the map and of every new map
        let told = 0;
        const bytes = new Uint8Array(4);
        const mine = { tabs() {}, hide() {} };
        const scope = { win: { clearTimeout() {}, MapFile: { parse: () => ({ ok: true }) } }, core: { checkMap: () => ({ status: 0, json: '{}' }) }, mine, canvas: { setFile() {} }, tools: { setMap() {} }, $: () => ({}), doc: {} };
        const r = rig(scope);
        r.sitePage().onChange(() => { told++; });
        r.sitePage().onChange(() => { told += 10; });
        r.edited();
        same('every change of the map is told to each part that asked, in the order that they asked', told, 11);
        r.setMap(bytes, 'A map');
        same('and every new map', told, 22);
        const refused = rig(Object.assign({}, scope, { core: { checkMap: () => ({ status: 1, error: 'no' }) } }));
        let toldRefused = 0;
        refused.sitePage().onChange(() => { toldRefused++; });
        same('a map that is refused is no change', [refused.setMap(bytes, 'x'), toldRefused], ['no', 0]);
        const unreadable = rig(Object.assign({}, scope, { win: { clearTimeout() {}, MapFile: { parse: () => ({ ok: false, error: 'bad' }) } } }));
        let toldUnreadable = 0;
        unreadable.sitePage().onChange(() => { toldUnreadable++; });
        unreadable.setMap(bytes, 'x');
        same('a map that cannot be drawn is no change either', toldUnreadable, 0);
    }
    {   // My maps gets the player's submissions from the site's part; the actions are the page's own, to which the site adds its own
        const calls = [];
        const environment = {};
        const r = rig({ mineEnvironment: environment, mine: { tabs: () => calls.push('tabs') } });
        const page = r.sitePage();
        const sent = { count: () => 3 };
        page.sent(sent);
        check('the submissions of the site\'s part take the place of the page\'s own, and My maps shows its tabs', environment.sent === sent && calls.length === 1);
        page.sent(null);
        check('... and a part that gives none (null) takes them away again', environment.sent === null && calls.length === 2);
        check('the actions that the page hands over are the page\'s own object, which the site adds its own to', page.actions === r.ACTIONS);
        check('the lines for the phone\'s File menu are the page\'s own list', page.menu === r.siteMenu);
        check('a part that asks for changes is put on the page\'s own list', (() => { const f = () => {}; page.onChange(f); return r.siteChanges.indexOf(f) >= 0; })());
    }
    {   // the phone's File menu: the lines of a site's part come after Download and before Play this map, in the order that the part gave them
        let items = null;
        const scope = { dialogs: { menu: (list) => { items = list; } }, tools: { state: () => ({ autoEdges: false }) }, win: {}, download() {}, playMap() {} };
        const r = rig(scope);
        r.siteMenu.push({ text: 'Site line one', onClick() {} }, { text: 'Site line two', onClick() {} });
        r.ACTIONS.menu();
        const words = items.map((i) => i.text || i.head || '');
        const at = (t) => words.indexOf(t);
        check('the phone\'s File menu has the page\'s own lines first, ending with Download', at('New') === 0 && at('Download') > at('Resize...'), JSON.stringify(words));
        check('the site\'s lines are right after Download', at('Site line one') === at('Download') + 1 && at('Site line two') === at('Download') + 2, JSON.stringify(words));
        check('Play this map follows them', words[at('Site line two') + 1].indexOf('Play this map') >= 0, JSON.stringify(words));
        r.siteMenu.length = 0;
        r.ACTIONS.menu();
        check('with no site\'s part the menu is the page\'s own, Play this map right after Download', items.map((i) => i.text || '')[at('Download') + 1].indexOf('Play this map') >= 0);
    }
    {   // the page calls the hook once, when it is up, with its own parts; a page with no site, or with no such hook, does without
        const asks = (AntsSite) => { const got = []; run('var sitePage = function () { return { name: "page" }; }; ' + startLine, { win: { AntsSite: AntsSite(got) } }); return got; };
        same('a site\'s part is called once with the page\'s parts', asks((got) => ({ mapMaker: (p) => got.push(p.name) })), ['page']);
        same('a page with no hook does not call', asks(() => ({})), []);
        same('a page with no site at all does not throw', (() => { try { run('var sitePage = function () { return {}; }; ' + startLine, { win: {} }); return 'ok'; } catch (e) { return e.message; } })(), 'ok');
    }
}

if (failures) { console.log(failures + ' of ' + checks + ' checks failed'); process.exit(1); }
console.log('ok: ' + checks + ' checks');
