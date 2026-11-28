// Runs the one formatter of dates and times that every page shares (web/local_time.js, AntsTime; docs/PLAY_IN_BROWSER.md "Dates and times") in the time zone that the environment names (TZ=...) and checks the rule
// of the product: every date and time is the VISITOR'S own (the zone of the browser, whatever the pages' server or the maintainer uses) and is on a 12-hour clock with AM or PM, never 24 hours.
// The expected words are written out below, one table row for each zone, worked out from the zone's rules and not from this program's own functions; the zone of a run is set here (process.env.TZ,
// which every system obeys while the program runs), so the same script runs in every zone of the table, one after the other (tests/scripts/test_web_local_time.py):
//   * the clock of a moment ("10:44 AM"), 12 AM at midnight, 12 PM at noon, and no hour from 0 to 23 anywhere in the 1,440 minutes of a day;
//   * the day and the time: "Today", "Yesterday", "Tomorrow", else the date with the year only when it is not this one; a moment that is yesterday in one zone is today in another;
//   * the day number that the chat's dividers use, through the days when the clocks change; the whole date and time for a tip;
//   * the build stamp (Pacific time as build_web.sh writes it) as the visitor's clock says it, through both changes of the clocks, and text that is no stamp left as it is;
//   * a time of the day that a server keeps ("18:30") as "6:30 PM", and what a person types ("6:30 pm") as the server keeps it;
//   * a time that is no time (NaN, a string, null) says nothing.
// usage: node web_local_time_check.js web/local_time.js [ZONE]     (every zone of the table, or the one; exit 0: every check holds; every failure is printed)
'use strict';

const path = require('path');

let failed = 0;
let checks = 0;
function expect(label, got, want) {
    checks++;
    if (JSON.stringify(got) !== JSON.stringify(want)) {
        console.log('FAIL ' + label + ': ' + JSON.stringify(got) + ', wanted ' + JSON.stringify(want));
        failed++;
    }
}

if (!process.argv[2]) { console.log('usage: web_local_time_check.js local_time.js [ZONE]'); process.exit(2); }
const T = require(path.resolve(process.argv[2]));

const A = Date.UTC(2026, 10, 28, 15, 44) / 1000;      // the moment of the build stamp "2026-11-28 07:44 PT"
const B = Date.UTC(2026, 10, 28, 17, 0);              // "now" of the table, in milliseconds
const C = Date.UTC(2026, 10, 28, 3, 30) / 1000;       // 7:30 PM the evening before in Pacific time, in the early morning of the same day in Europe
// zone: [minutes that the zone is behind UTC on 2026-11-28 (the proof that the zone of the run is the zone asked for), A's clock, A's date, A with the day word as of B, C with the day word as of B]
const TABLE = {
    'America/Los_Angeles': [480, '7:44 AM', 'Nov 28', 'Today, 7:44 AM', 'Yesterday, 7:30 PM'],
    'America/New_York': [300, '10:44 AM', 'Nov 28', 'Today, 10:44 AM', 'Yesterday, 10:30 PM'],
    'Europe/Berlin': [-60, '4:44 PM', 'Nov 28', 'Today, 4:44 PM', 'Today, 4:30 AM'],
    'Asia/Kolkata': [-330, '9:14 PM', 'Nov 28', 'Today, 9:14 PM', 'Today, 9:00 AM'],
    'Asia/Tokyo': [-540, '12:44 AM', 'Nov 29', 'Today, 12:44 AM', 'Yesterday, 12:30 PM'],
    'Pacific/Auckland': [-780, '4:44 AM', 'Nov 29', 'Today, 4:44 AM', 'Yesterday, 4:30 PM'],
    'UTC': [0, '3:44 PM', 'Nov 28', 'Today, 3:44 PM', 'Today, 3:30 AM']
};
// Pacific wall clock -> seconds since 1970 (UTC), from the zone's own rules
const STAMPS = [['2026-11-28 07:44 PT', 1795880640], ['2026-07-04 12:00 PT', 1783191600], ['2026-01-02 09:30 PT', 1767375000],
    ['2026-03-08 01:59 PT', 1772963940], ['2026-03-08 03:00 PT', 1772964000], ['2026-11-01 00:30 PT', 1793518200], ['2026-11-01 02:00 PT', 1793527200],
    ['2027-03-14 01:59 PT', 1805018340], ['2027-03-14 03:00 PT', 1805018400], ['2027-11-07 00:59 PT', 1825574340], ['2027-11-07 02:00 PT', 1825581600],
    ['2025-03-09 03:00 PT', 1741514400], ['2025-11-02 02:00 PT', 1762077600]];

{   // every hour of eight years against the zone's own rules (the hour that the clocks skip and the hour that they repeat are the two that have no one answer)
    const pacific = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
    const wrong = [];
    for (let day = Date.UTC(2024, 0, 1); day < Date.UTC(2032, 0, 1); day += 86400000) {
        for (let hour = 0; hour < 24; hour++) {
            const d = new Date(day), pad = (n) => String(n).padStart(2, '0');
            const stamp = d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate()) + ' ' + pad(hour) + ':17 PT', seconds = T.stampSeconds(stamp);
            const p = {};
            pacific.formatToParts(new Date(seconds * 1000)).forEach((x) => { p[x.type] = x.value; });
            const back = p.year + '-' + p.month + '-' + p.day + ' ' + p.hour + ':' + p.minute + ' PT';
            if (back !== stamp && !(hour === 1 || hour === 2)) wrong.push(stamp + ' -> ' + back);
        }
    }
    expect('the stamp of every hour of 2024 to 2031 is the moment that has that Pacific clock (the same in every zone)', wrong.slice(0, 5), []);
}

const zones = process.argv[3] ? [process.argv[3]] : Object.keys(TABLE);
for (const zone of zones) {
    if (!TABLE[zone]) { console.log('FAIL the zone ' + JSON.stringify(zone) + ' is not in the table'); failed++; continue; }
    process.env.TZ = zone;
    run(zone, TABLE[zone]);
}
console.log('local_time (' + zones.join(', ') + '): ' + checks + ' checks, ' + failed + ' failed');
process.exit(failed ? 1 : 0);

function run(zone, row) {
    const want = row.slice(1);
    const local = (y, m, d, h, min) => new Date(y, m - 1, d, h, min || 0);        // a moment by the visitor's clock

    // ---- the visitor's own zone ----
    expect(zone + ': the zone of the run is the zone asked for', new Date(A * 1000).getTimezoneOffset(), row[0]);
    expect('the clock of a moment is in the zone of the environment', T.clockText(new Date(A * 1000)), want[0]);
    expect('a number of milliseconds is a moment too', T.clockText(A * 1000), want[0]);
    expect('the date of a moment is in the zone of the environment', T.dateText(A, B), want[1]);
    expect('the day and the time of a moment as of now', T.whenText(A, B), want[2]);
    expect('the same for a moment that is another day in some zones', T.whenText(C, B), want[3]);
    expect('a moment as of a Date', T.whenText(C, new Date(B)), want[3]);

    // ---- 12 hours, AM and PM ----
    {
        const bad = [];
        for (let m = 0; m < 1440; m++) {
            const text = T.clockText(local(2026, 6, 15, Math.floor(m / 60), m % 60));
            const hour = Math.floor(m / 60), shown = (hour % 12 === 0 ? 12 : hour % 12) + ':' + String(m % 60).padStart(2, '0') + (hour < 12 ? ' AM' : ' PM');
            if (text !== shown || !/^(1[0-2]|[1-9]):[0-5][0-9] (AM|PM)$/.test(text)) bad.push(text + ' for ' + hour + ':' + (m % 60));
        }
        expect('every minute of a day is written with 1 to 12, two digits of minutes, and AM or PM', bad, []);
        expect('midnight, the first minute, noon, the first minute after noon, the last minute', [local(2026, 6, 15, 0, 0), local(2026, 6, 15, 0, 1), local(2026, 6, 15, 12, 0), local(2026, 6, 15, 12, 1), local(2026, 6, 15, 23, 59)].map(T.clockText),
            ['12:00 AM', '12:01 AM', '12:00 PM', '12:01 PM', '11:59 PM']);
    }

    // ---- the day words ----
    {
        const now = local(2026, 11, 28, 12, 0), s = (d) => d.getTime() / 1000;
        expect('Today at both ends of the day', [T.dayText(s(local(2026, 11, 28, 0, 0)), now), T.dayText(s(local(2026, 11, 28, 23, 59)), now)], ['Today', 'Today']);
        expect('Yesterday and Tomorrow are the days before and after by the visitor\'s calendar', [T.dayText(s(local(2026, 11, 27, 23, 59)), now), T.dayText(s(local(2026, 11, 29, 0, 0)), now)], ['Yesterday', 'Tomorrow']);
        expect('another day is the date; the year only when it is not the year of now', [T.dayText(s(local(2026, 11, 26, 9, 0)), now), T.dayText(s(local(2026, 1, 3, 9, 0)), now), T.dayText(s(local(2025, 12, 31, 9, 0)), now), T.dayText(s(local(2027, 1, 1, 9, 0)), now)],
            ['Nov 26', 'Jan 3', 'Dec 31, 2025', 'Jan 1, 2027']);
        expect('the day and the time with the year', [T.whenText(s(local(2025, 10, 6, 23, 30)), now), T.whenText(s(local(2026, 10, 6, 11, 30)), now), T.whenText(s(local(2026, 11, 28, 0, 5)), now)], ['Oct 6, 2025, 11:30 PM', 'Oct 6, 11:30 AM', 'Today, 12:05 AM']);
        expect('in a sentence the three words are in small letters and nothing else changes', [T.whenText(s(local(2026, 11, 28, 9, 41)), now, true), T.whenText(s(local(2026, 11, 27, 22, 15)), now, true), T.whenText(s(local(2026, 11, 29, 7, 0)), now, true), T.whenText(s(local(2026, 10, 6, 11, 30)), now, true)],
            ['today, 9:41 AM', 'yesterday, 10:15 PM', 'tomorrow, 7:00 AM', 'Oct 6, 11:30 AM']);
        expect('the whole date and time for a tip', T.fullText(s(local(2026, 10, 6, 7, 32))), 'Oct 6, 2026, 7:32 AM');
        const at = (y, mo, d, h, mi) => new Date(y, mo, d, h, mi, 0).getTime() / 1000, noon = new Date(2026, 9, 8, 12, 0, 0);       // Oct 8, 12:00 PM by the clock of the zone
        expect('the day and the time of a match: today at both ends of the day, a minute after now', [at(2026, 9, 8, 7, 32), at(2026, 9, 8, 12, 0), at(2026, 9, 8, 0, 5), at(2026, 9, 8, 12, 1)].map((x) => T.whenText(x, noon)),
            ['Today, 7:32 AM', 'Today, 12:00 PM', 'Today, 12:05 AM', 'Today, 12:01 PM']);
        expect('yesterday evening, and the last minute of yesterday', [T.whenText(at(2026, 9, 7, 22, 15), noon), T.whenText(at(2026, 9, 7, 23, 59), noon)], ['Yesterday, 10:15 PM', 'Yesterday, 11:59 PM']);
        expect('two days ago, last month and last year are dates (the year only for another year)', [T.whenText(at(2026, 9, 6, 11, 30), noon), T.whenText(at(2026, 8, 20, 9, 5), noon), T.whenText(at(2025, 11, 31, 20, 0), noon)], ['Oct 6, 11:30 AM', 'Sep 20, 9:05 AM', 'Dec 31, 2025, 8:00 PM']);
        expect('yesterday across a month end, a year end and the autumn change of the clocks', [T.whenText(at(2026, 8, 30, 18, 0), new Date(2026, 9, 1, 8, 0, 0)), T.whenText(at(2025, 11, 31, 18, 0), new Date(2026, 0, 1, 8, 0, 0)), T.whenText(at(2026, 9, 31, 20, 0), new Date(2026, 10, 1, 9, 0, 0))],
            ['Yesterday, 6:00 PM', 'Yesterday, 6:00 PM', 'Yesterday, 8:00 PM']);
        expect('no time and not a number say nothing', [T.whenText(undefined, noon), T.whenText(NaN, noon)], ['', '']);
        // the days when the clocks change are whole days: the day of 2026-03-08 and of 2026-11-01 are one day each, and the next day is the next
        const dst = [[2026, 3, 8], [2026, 11, 1], [2026, 3, 29], [2026, 10, 25], [2026, 4, 5], [2026, 9, 27]].map((d) => {
            const first = s(local(d[0], d[1], d[2], 0, 30)), last = s(local(d[0], d[1], d[2], 23, 30)), next = s(local(d[0], d[1], d[2] + 1, 0, 30)), ref = local(d[0], d[1], d[2] + 1, 12, 0);
            return [T.dayKey(first) === T.dayKey(last), T.dayKey(next) - T.dayKey(first), T.dayText(last, ref), T.dayText(first, ref)];
        });
        expect('the day number and the words hold through the days when the clocks change', dst, dst.map(() => [true, 1, 'Yesterday', 'Yesterday']));
        expect('the day number is the visitor\'s: a moment before and after local midnight', T.dayKey(s(local(2026, 11, 28, 23, 59))) + 1, T.dayKey(s(local(2026, 11, 29, 0, 0))));
    }

    // ---- no time ----
    expect('a time that is no time says nothing', [T.clockText(NaN), T.clockText('x'), T.clockText(null), T.dateText(NaN, B), T.dateText('5', B), T.dayText(NaN, B), T.dayText(5, null), T.whenText(null, B), T.whenText(Infinity, B), T.fullText(undefined), T.dayKey(NaN), T.dayKey('1')],
        ['', '', '', '', '', '', '', '', '', '', null, null]);

    // ---- the build stamp ----
    expect('every stamp is the moment that the zone of the Pacific coast gives it, through both changes of the clocks', STAMPS.map((p) => T.stampSeconds(p[0])), STAMPS.map((p) => p[1]));
    expect('the build stamp is said by the visitor\'s clock, with the date', T.stampText('2026-11-28 07:44 PT', new Date(B)), want[1] + ', ' + want[0]);
    expect('the year is added for another year than now', T.stampText('2026-11-28 07:44 PT', Date.UTC(2027, 5, 1)), want[1] + ', 2026, ' + want[0]);
    expect('text that is no stamp stays as it is (a page that was not built, a stamp with seconds, another zone)', ['@@BUILD_DATE@@', 'today', '', '2026-11-28 07:44:30 PT', '2026-11-28 07:44 UTC', '2026-13-28 07:44 PT', '2026-11-28 24:00 PT'].map((x) => T.stampText(x, B)), ['@@BUILD_DATE@@', 'today', '', '2026-11-28 07:44:30 PT', '2026-11-28 07:44 UTC', '2026-13-28 07:44 PT', '2026-11-28 24:00 PT']);
    const nodeOf = (text) => ({ textContent: text });
    expect('a node that holds the stamp in brackets says it by the visitor\'s clock; any other text, and no node, is left as it is', [nodeOf('(2026-11-28 07:44 PT)'), nodeOf('(@@BUILD_DATE@@)'), nodeOf('(today)'), nodeOf('2026-11-28 07:44 PT'), nodeOf('')].map((n) => { T.stampNode(n, new Date(B)); return n.textContent; }).concat([T.stampNode(null), T.stampNode({})]),
        ['(' + want[1] + ', ' + want[0] + ')', '(@@BUILD_DATE@@)', '(today)', '2026-11-28 07:44 PT', '', undefined, undefined]);
    expect('a stamp that is no stamp has no moment', [T.stampSeconds('x'), T.stampSeconds(null), T.stampSeconds('2026-11-28 07:44 pt')], [null, null, null]);
    // ---- times of the day that a server keeps ----
    expect('a time of the day as the page says it', ['00:00', '00:05', '06:30', '11:59', '12:00', '12:30', '13:00', '18:30', '23:59'].map(T.dayClockText), ['12:00 AM', '12:05 AM', '6:30 AM', '11:59 AM', '12:00 PM', '12:30 PM', '1:00 PM', '6:30 PM', '11:59 PM']);
    expect('text that is no time of the day says nothing', ['24:00', '6:30', '18:60', '1830', '', null, '06:3', ' 06:30'].map(T.dayClockText), ['', '', '', '', '', '', '', '']);
    expect('what a person types, as the server keeps it', ['6:30 PM', '6:30 pm', '6 pm', '6pm', '12 AM', '12:05am', '12 PM', '12:59 p.m.', '1 A.M.', ' 11:30 PM '].map(T.dayClockParse), ['18:30', '18:30', '18:00', '18:00', '00:00', '00:05', '12:00', '12:59', '01:00', '23:30']);
    expect('without AM or PM, or no time, it is no answer', ['18:30', '6:30', '0 AM', '13 PM', '6:60 PM', '6:3 PM', '', 'noon', null].map(T.dayClockParse), ['', '', '', '', '', '', '', '', '']);
    expect('what a person types goes round the way back', ['00:00', '00:30', '09:15', '12:00', '12:45', '17:05', '23:59'].map((x) => T.dayClockParse(T.dayClockText(x))), ['00:00', '00:30', '09:15', '12:00', '12:45', '17:05', '23:59']);
}
