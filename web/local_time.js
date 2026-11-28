/* The one place that writes a date or a time for a person (docs/PLAY_IN_BROWSER.md "Dates and times"). Every date and time that a page shows is in the visitor's own time zone (the browser's: the local
   methods of Date) and on a 12-hour clock with AM or PM, whatever the device's language or clock setting says: "7:32 AM", "Today, 7:32 AM", "Oct 6, 11:30 AM". A page asks this file for the words and
   writes them as text. A time is seconds since 1970 (what the servers send); `now` is a Date or milliseconds since 1970. Plain functions with no page in them, so that
   tests/scripts/web_local_time_check.js runs them in several time zones (TZ=...). ES5, no module system: a page gets AntsTime, node gets module.exports. */
(function (root) {
    'use strict';

    var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    var DAY_MS = 86400000, HOUR_MS = 3600000;
    var STAMP = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}) PT$/;           // the build stamp of the pages, in Pacific time (build_web.sh)

    function dateOf(value) {                                                 // a Date, or milliseconds since 1970, as a Date; null when it is no time
        var d = value && typeof value.getTime === 'function' ? value : typeof value === 'number' ? new Date(value) : null;
        return d && isFinite(d.getTime()) ? d : null;
    }
    function atOf(seconds) { return typeof seconds === 'number' && isFinite(seconds) ? dateOf(seconds * 1000) : null; }
    // The number of a calendar day in the visitor's zone (the days between two of them are whole numbers, whatever the clocks did in between)
    function dayNumber(date) { return Math.round(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / DAY_MS); }

    // "7:32 AM": the clock of a Date in the visitor's zone (12 AM at midnight, 12 PM at noon)
    function clockText(date) {
        var d = dateOf(date);
        if (!d) return '';
        var h = d.getHours(), m = d.getMinutes();
        return (h % 12 === 0 ? 12 : h % 12) + ':' + (m < 10 ? '0' : '') + m + (h < 12 ? ' AM' : ' PM');
    }
    // A number for the visitor's calendar day of a time (the same for every moment of that day, different for the next), or null for no time
    function dayKey(seconds) {
        var at = atOf(seconds);
        return at ? dayNumber(at) : null;
    }
    // "Oct 6": the date of a time; with `now`, "Oct 6, 2025" when it is not in the year of `now`
    function dateText(seconds, now) {
        var at = atOf(seconds), ref = dateOf(now);
        if (!at) return '';
        return MONTHS[at.getMonth()] + ' ' + at.getDate() + (ref && at.getFullYear() !== ref.getFullYear() ? ', ' + at.getFullYear() : '');
    }
    // "Today", "Yesterday", "Tomorrow", else the date as dateText writes it; `inSentence` writes the three words in small letters, for a place in the middle of a line ("banned today, 9:41 AM")
    function dayText(seconds, now, inSentence) {
        var at = atOf(seconds), ref = dateOf(now);
        if (!at || !ref) return '';
        var days = dayNumber(at) - dayNumber(ref), word = days === 0 ? 'Today' : days === -1 ? 'Yesterday' : days === 1 ? 'Tomorrow' : '';
        return word ? (inSentence ? word.toLowerCase() : word) : dateText(seconds, now);
    }
    // The day and the time: "Today, 7:32 AM", "Yesterday, 10:15 PM", "Oct 6, 11:30 AM" (the year too for another year)
    function whenText(seconds, now, inSentence) {
        var at = atOf(seconds), day = dayText(seconds, now, inSentence);
        return at && day ? day + ', ' + clockText(at) : '';
    }
    // The whole date and time, for a tip: "Oct 6, 2026, 7:32 AM"
    function fullText(seconds) {
        var at = atOf(seconds);
        return at ? MONTHS[at.getMonth()] + ' ' + at.getDate() + ', ' + at.getFullYear() + ', ' + clockText(at) : '';
    }

    // A time of the day as a server keeps it ("18:30", 24 hours, no zone) as the page says it: "6:30 PM"; '' for text of another shape. For a rule of a clock that is not the visitor's (a schedule at the Pacific clock)
    function dayClockText(text) {
        var m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(typeof text === 'string' ? text : '');
        return m ? (+m[1] % 12 === 0 ? 12 : +m[1] % 12) + ':' + m[2] + (+m[1] < 12 ? ' AM' : ' PM') : '';
    }
    // ... and back: what a person types ("6:30 PM", "6 pm", "12:05am") as the server keeps it ("18:30"); '' when it is no time of the day with AM or PM
    function dayClockParse(text) {
        var m = /^([1-9]|1[0-2])(?::([0-5]\d))? ?([ap])\.?m\.?$/i.exec(typeof text === 'string' ? text.replace(/^\s+|\s+$/g, '') : '');
        if (!m) return '';
        var h = +m[1] % 12 + (m[3].toLowerCase() === 'p' ? 12 : 0);
        return (h < 10 ? '0' : '') + h + ':' + (m[2] || '00');
    }

    // ---- the build stamp ----
    // The second Sunday of March and the first of November, as days of the month (the United States' change between standard and daylight time)
    function sunday(year, month, nth) { return 1 + (7 - new Date(Date.UTC(year, month, 1)).getUTCDay()) % 7 + 7 * (nth - 1); }
    // The moment of a build stamp ("2026-11-28 07:44 PT": the Pacific clock, as build_web.sh writes it) in seconds since 1970, or null for text of another shape
    function stampSeconds(stamp) {
        var m = STAMP.exec(typeof stamp === 'string' ? stamp : '');
        if (!m) return null;
        var y = +m[1], month = +m[2] - 1, day = +m[3], h = +m[4], min = +m[5];
        if (month < 0 || month > 11 || day < 1 || day > 31 || h > 23 || min > 59) return null;
        var wall = Date.UTC(y, month, day, h, min), from = Date.UTC(y, 2, sunday(y, 2, 2), 2), to = Date.UTC(y, 10, sunday(y, 10, 1), 2);
        return Math.floor((wall + (wall >= from && wall < to ? 7 : 8) * HOUR_MS) / 1000);
    }
    // The build stamp as the visitor's clock says it: "Nov 28, 10:44 AM" (the year too for another year); text that is no stamp stays as it is
    function stampText(stamp, now) {
        var seconds = stampSeconds(stamp);
        if (seconds === null) return typeof stamp === 'string' ? stamp : '';
        return dateText(seconds, now === undefined ? new Date() : now) + ', ' + clockText(atOf(seconds));
    }

    // A node that holds a build stamp in brackets ("(2026-11-28 07:44 PT)") says it as the visitor's clock does ("(Nov 28, 10:44 AM)"); a node with any other text is left as it is
    function stampNode(node, now) {
        var m = node && typeof node.textContent === 'string' ? /^\((.*)\)$/.exec(node.textContent) : null;
        if (m) node.textContent = '(' + stampText(m[1], now) + ')';
    }

    var api = { MONTHS: MONTHS, clockText: clockText, dayKey: dayKey, dateText: dateText, dayText: dayText, whenText: whenText, fullText: fullText, dayClockText: dayClockText, dayClockParse: dayClockParse, stampSeconds: stampSeconds, stampText: stampText, stampNode: stampNode };
    if (typeof module === 'object' && module && module.exports) module.exports = api;
    else root.AntsTime = api;
})(typeof window !== 'undefined' ? window : this);
