// Runs the seam between the pages of the game and a site (web/site_hooks.js, docs/PLAY_IN_BROWSER.md "The seam to a site") with the STUB alone, as a tree without a site has it: the file defines
// every hook and every hook does nothing and throws nothing; a second load of it changes nothing and a site's own object is never replaced; and the game page's own part of the hooks (the block
// ANTS_REPORT_BEGIN .. ANTS_REPORT_END of web/shell.html) works with the stub, with no object at all and with a site that throws, and asks a site for a game on this computer once, and never for a test game.
// tests/scripts/test_web_seam.py runs this with node (the quick tier). usage: node web_seam_check.js web/site_hooks.js web/shell.html     (exit 0: every check holds; every failure is printed)
'use strict';
const fs = require('fs');
const vm = require('vm');

const [stubPath, shellPath] = process.argv.slice(2);
if (!stubPath || !shellPath) { console.log('usage: web_seam_check.js site_hooks.js shell.html'); process.exit(2); }

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

if (failures) { console.log(failures + ' of ' + checks + ' checks failed'); process.exit(1); }
console.log('ok: ' + checks + ' checks');
