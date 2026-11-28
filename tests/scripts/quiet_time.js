// The page's formatter of dates and times (web/local_time.js, the global AntsTime that every page loads) for the checks of the chat and the pages round it, which compare the text of a line or a row: `quiet` is the
// real formatter whose clock says nothing (an empty time at the left of a line), so that a line's text is its name and its words, and everything else (the day words, the dates) is the real one. The
// checks of the time itself use `real`. Not a test file. usage: const time = require('./quiet_time.js'); globalThis.AntsTime = time.quiet; ... globalThis.AntsTime = time.real;
'use strict';

const path = require('path');

const real = require(path.resolve(__dirname, '..', '..', 'web', 'local_time.js'));
const quiet = Object.assign({}, real, { clockText: () => '', fullText: () => '' });

module.exports = { real, quiet };
