# Third-party notices of the server and the site

The third-party code and data that only the game server, the chat hub and the site use. `THIRD_PARTY_NOTICES.md` lists the rest (the game's own parts, which are also in the public repository); this
file stays here, with the server. The same rule holds: the licence text of each one can be found where it says.

## Included in the repository

### SQLite (database library)

- Where: `third_party/sqlite/` (`sqlite3.c` and `sqlite3.h`, the official amalgamation, unchanged; `README.md` there names the version, the source and the hashes). Built as the static library `ants_sqlite` and linked by the dedicated server (not by the game or the web build).
- What: SQLite 3.53.4, <https://www.sqlite.org/>, by D. Richard Hipp and the SQLite developers.
- Licence: public domain. The author disclaims copyright to the source code (the blessing at the top of `sqlite3.h`); <https://www.sqlite.org/copyright.html>.

## Not in the repository (linked or downloaded by the build)

### DB-IP Lite, IP to Country Lite (the country list of the visit counter)

- Used by: the chat hub's image (`Dockerfile.hub`, `hub/geodata.py`), which fetches the monthly list from <https://download.db-ip.com/free/> when it is built and turns it into a small file; never at run time, never by the game or the web page. Without the file every country is unknown.
- Licence: Creative Commons Attribution 4.0 International (CC BY 4.0, <https://creativecommons.org/licenses/by/4.0/>). The credit that it asks for, "IP Geolocation by DB-IP" with a link to <https://db-ip.com>, is on the site's Legal page. The data is not in the repository, and no address is kept by the counter (`docs/ANALYTICS.md`).
