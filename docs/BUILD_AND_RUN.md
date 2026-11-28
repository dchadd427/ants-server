# Build and run guide

How to build and start Ants from source on macOS, Linux and Windows, how to build the web version, and how to run the Docker image that serves the beta site. The game is C++17 with CMake. Run the commands from the repository folder: the game reads its data from `Original-Ants/` relative to the current folder, so from any other folder it stops with "Failed to load CHD archive". The scripts `start_game.sh`, `start_game.bat`, `run_tests.sh` and `run_tests.bat` change to the repository folder themselves.

## Prerequisites & Dependencies

The game needs a C++17 compiler, CMake 3.16 or newer, and SDL2 and SDL2_ttf. Only the game and the application's test programs need SDL: `-DANTS_BUILD_APP=OFF` leaves them out and builds the dedicated server and the other tests without it (see "Manual CMake Build"). `ccache` and Ninja are optional.

The desktop game's encrypted link to a game server (TLS, [`NETWORK_PORT.md`](NETWORK_PORT.md#protocol-6-the-websocket-transport-and-the-pieces-of-the-dedicated-server-v0081) "The desktop game's encrypted link") needs nothing to install: Mbed TLS is in the repository (`third_party/mbedtls/`, built as the static library `ants_mbedtls` by every native build, about 10 seconds the first time; its `README.md` names the version, the source and the hash). It checks the server's certificate against the system's trusted roots, which it reads from the system: the Security framework on macOS (opened when the roots are read, not linked), the Windows certificate stores (the game links `crypt32`), and the bundle file of the distribution on Linux (`/etc/ssl/certs/ca-certificates.crt` and the other usual places; a minimal Linux image needs its `ca-certificates` package).

The project is developed on macOS and on Windows 11 (Visual Studio 2022 Build Tools). CI builds every pull request on Linux (GCC), macOS (Apple clang) and Windows (MSVC 2022 and 2026) with `-DANTS_WERROR=ON` (every warning is an error) and runs the tests there, except that a pull request of documents, web pages and their tests only skips macOS and Windows ([`WORKFLOW.md`](private/WORKFLOW_DEPLOY.md#light-checks-for-web-and-document-pull-requests)); every push to `main` runs all of it. It also builds the web image and the server image. The compilers and the SDL2 versions of each job are in the table of [`TESTING.md`](TESTING.md#continuous-integration); what to install on your own machine is in the sections below.

### macOS

Install the tools with [Homebrew](https://brew.sh/):

```bash
brew install cmake ninja
```

- Ninja builds SDL2 below; the game itself builds with any CMake generator.
- **Compiler**: Apple clang with C++17, from the Xcode Command Line Tools (`xcode-select --install`). If the build stops with an Xcode licence error, accept the licence (`sudo xcodebuild -license`) or set `DEVELOPER_DIR=/Library/Developer/CommandLineTools` for the shell that builds.
- **SDL2 and SDL2_ttf: use the real SDL2 (2.32.x), not Homebrew's `sdl2` as it is now.** The formula has become sdl2-compat, the SDL2 interface on top of SDL3. The game builds with it, but the game is written for SDL2 and its tests pin SDL2's exact behaviour: eight test programs failed under it in the first macOS run of CI (the pointer, window and canvas checks, the pixel fingerprints, one crash). The project is developed and tested with real SDL2 2.32.x. For a quick try of the game alone, `brew install sdl2 sdl2_ttf` is enough.
- If `brew install sdl2` gives you the compat layer, build SDL2 and SDL2_ttf from the release sources into a folder of your own, as the macOS job of `.github/workflows/ci.yml` does. `curl` fetches the sources. SDL2_ttf is built with HarfBuzz, as the distributions' and Homebrew's are: some tests pin text widths to the pixel.

  ```bash
  mkdir -p ~/sdl-src && cd ~/sdl-src
  curl -fsSL -o SDL2.tar.gz https://github.com/libsdl-org/SDL/releases/download/release-2.32.10/SDL2-2.32.10.tar.gz
  curl -fsSL -o SDL2_ttf.tar.gz https://github.com/libsdl-org/SDL_ttf/releases/download/release-2.24.0/SDL2_ttf-2.24.0.tar.gz
  tar xzf SDL2.tar.gz && tar xzf SDL2_ttf.tar.gz
  cmake -S SDL2-2.32.10 -B sdl2-build -G Ninja -DCMAKE_BUILD_TYPE=Release -DCMAKE_INSTALL_PREFIX="$HOME/sdl2" -DSDL_TEST=OFF
  cmake --build sdl2-build
  cmake --install sdl2-build
  cmake -S SDL2_ttf-2.24.0 -B ttf-build -G Ninja -DCMAKE_BUILD_TYPE=Release -DCMAKE_INSTALL_PREFIX="$HOME/sdl2" -DCMAKE_PREFIX_PATH="$HOME/sdl2" -DSDL2TTF_VENDORED=ON -DSDL2TTF_HARFBUZZ=ON -DSDL2TTF_SAMPLES=OFF -DCMAKE_POLICY_VERSION_MINIMUM=3.5
  cmake --build ttf-build
  cmake --install ttf-build
  ```

  Then, from the repository folder, configure the game with that SDL2 (the CI's own line also adds `-DANTS_WERROR=ON` and the ccache launcher):

  ```bash
  cmake -S . -B build -G Ninja -DCMAKE_BUILD_TYPE=Release -DCMAKE_PREFIX_PATH="$HOME/sdl2"
  ```

- **Optional**: `ccache`. CMake uses it when it finds it ("Manual CMake Build").
- **Audio**: nothing extra to install. The game mixes its sound effects and plays the MP3 soundtrack (`Original-Ants/*.mp3`) itself through SDL2's audio output, on every platform. The original's `.MID` files are loaded but not played.

### Linux

```bash
sudo apt-get update && sudo apt-get install -y cmake g++ libsdl2-dev libsdl2-ttf-dev
```

That is for Debian-based systems such as Ubuntu; other distributions need the same things (CMake, a C++17 compiler, the SDL2 and SDL2_ttf development files). CI builds with GCC 13 and installs `ninja-build` and `ccache` too. `./run_tests.sh` also needs `bash`, `python3` and `curl` (the server suite skips itself without `curl`).

### Windows

- **Compiler**: Visual Studio 2022 Build Tools, or Visual Studio, with the C++ tools (the "Desktop development with C++" workload). Visual Studio 2026 builds too: CI builds with both.
- **CMake** 3.16 or newer. The generator `Visual Studio 17 2022` needs CMake 3.21 or newer.
- **x64 only**: the SDL2 packages that CMake downloads are the x64 ones.
- **SDL2 and SDL2_ttf**: nothing to install. When CMake does not find them itself, the configure downloads the Visual C++ packages (SDL2 2.30.12, SDL2_ttf 2.22.0) from GitHub into the build folder (it needs internet access). The build copies `SDL2.dll` and `SDL2_ttf.dll` next to `ants.exe`.
- The game also links the Windows libraries `ws2_32`, `crypt32` (the system's certificate stores, for the encrypted link) and `winmm`; all come with Windows.
- Run `start_game.bat` to build and launch, or use the commands under "Manual CMake Build".

## Building and Running Locally

### Quick Launch (Desktop)

To build and launch the desktop game in one step, from the repository folder:

```bash
./start_game.sh
```

On Windows the same is `start_game.bat`, with the same options. `start_game.bat` mirrors the shell script, but no automated test runs it (one test only reads the text of its banner): if it misbehaves, its `--dry-run` output shows what it would start.

- The script builds the game every time it starts: an incremental build of the target `ants`, quick when nothing changed. When the configure or the build fails it stops with the compiler's messages, so it never starts a game from an older build.
- With no options it opens one game with the start menu, then the original's screens as always ([`CONTROLS.md`](CONTROLS.md#which-command-lines-show-the-menu) says which options skip the menu).
- Every other argument goes to every window it starts: they are the game's own options ([`COMMAND_LINE.md`](COMMAND_LINE.md)).

| Command | What starts |
|---|---|
| `./start_game.sh` | one game: the start menu, then the original's screens (add `--map-select` to start on the setup screen at once) |
| `./start_game.sh --players N` | the test rig: N windows, 2 - 4, in one networked match (four in a 2 x 2 grid, two side by side, green left and red right; `--players 1` is the one game) |
| `./start_game.sh --single` | the one game, as the default (kept for old habits) |
| `./start_game.sh --dry-run` | print the command line of every window and stop (nothing is built or started) |

**The test rig** (`--players 4` is four games on this machine, one player each, playing one networked match together):

- Window 0 hosts (green) and windows 1 - 3 join (red, blue, black). The room is open on this machine only and is not announced on the network. Every player gets a random name, a different one in each window. Each window has `--host` or `--join`, so none of them shows the start menu.
- The windows lie by color, the way the four hills lie on the Small and Treasure maps and the same as the games on the front page: **black top left, green top right, red bottom left, blue bottom right**. Fewer windows keep that order of the colors without holes: two are green left and red right, three are green, red and blue in the first three cells of the grid. Other maps put the hills elsewhere; the windows keep this layout on every map.
- Every window opens in the default 16:9 picture, created directly at its cell's rectangle (the largest 16:9 rectangle that fits the cell; `--aspect 4:3` gives 4:3 cells), so no window in another shape is ever shown.
- Choose the map and press START in the green window (top right with four windows).
- The windows do not grab the pointer: the game's own cursor shows only inside the window you point at, and the screen edge scrolls only that window. Only the window that has the focus makes sound.

A game's own options given without `--players` (`--host`, `--join`, `--bot`, `--lan-list`, `--headless`, `--screenshot`, `--map`) make it a single game: `./start_game.sh --host --name Alice` is one window. `--bot` cannot be combined with `--players 2` to `--players 4`: the extra windows are guests, and a guest runs no bots. For a game against bots use one window (`./start_game.sh --bot 1:medium`), or `--host --bot 2:medium` and let others join.

The scripts read three environment variables: `ANTS_PORT` (the rig's room, port 4001 unless set), and `ANTS_NAMES_SEED` and `ANTS_CMAKE` (`start_game.sh` only). They are in [`COMMAND_LINE.md`](COMMAND_LINE.md#environment-variables).

### Manual CMake Build

On macOS and Linux:

1. Configure CMake in release mode:
   ```bash
   cmake -B build -DCMAKE_BUILD_TYPE=Release
   ```
   (On a Mac with the SDL2 built above, add `-DCMAKE_PREFIX_PATH="$HOME/sdl2"`.)

2. Compile the project with all CPU cores:
   ```bash
   cmake --build build -j"$(sysctl -n hw.ncpu 2>/dev/null || nproc)"
   ```

3. From the repository folder, launch the game executable:
   ```bash
   ./build/src/ants_app/ants
   ```

On Windows (Command Prompt):

```cmd
cmake -B build -G "Visual Studio 17 2022" -A x64
cmake --build build --config Release -j8
build\src\ants_app\Release\ants.exe
```

- `cmake -B build` alone takes the newest Visual Studio that CMake finds, as `start_game.bat` does. A Visual Studio generator puts every program into a `Release` folder. CI configures with Ninja inside the x64 Visual C++ environment instead (`-G Ninja -DCMAKE_BUILD_TYPE=Release`), where there is no `Release` folder: `build\src\ants_app\ants.exe`.
- `start_game.bat` and `run_tests.bat` use the `cmake` on your `PATH`. When there is none, they ask `vswhere.exe` (found under `%ProgramFiles(x86)%`) for the `cmake.exe` that comes with Visual Studio (`-latest -products * -find "**\cmake.exe"`) and put its folder on the `PATH` for that run.

What the build makes:

- The default build makes the game (`ants`), the dedicated server (`ants_server`, at `build/src/ants_server/ants_server`; [`SERVER.md`](SERVER.md)) and every test program. The developer tools `map_sweep`, `bot_arena`, `lvl_tool` and `gen_food_footprints` are built only by name (`--target map_sweep`).
- `cmake --build build --target ants` builds the game alone, as `start_game.sh` does, and `--target ants_server` the server alone.

The options of the build (`-D` when CMake configures; CMake does not read them from the environment, but `build_web.sh` takes `ANTS_BUILD_ID` from it, see [Versioning and the Build Id](#versioning-and-the-build-id)):

| Option | Default | What it does |
|---|---|---|
| `-DANTS_BUILD_APP=OFF` | `ON` | leaves out the game, `ants_thumb` and the application's test programs, so the build needs no SDL2 (a build of the server alone; the server's Docker image builds `ants_thumb` too and so has SDL2) |
| `-DBUILD_TESTS=OFF` | `ON` (`OFF` for the web build) | leaves out the test programs |
| `-DANTS_WERROR=ON` | `OFF` | turns every warning into an error (`-Werror`; `/WX` with MSVC), as CI does |
| `-DANTS_USE_CCACHE=OFF` | `ON` | switches `ccache` off. With it on, CMake uses `ccache` as the compiler launcher when it finds it (on the `PATH`, or in `~/.local/bin`), so another checkout or a clean build folder compiles from the cache. It is never used with MSVC, with a launcher you set yourself, or for the web build ([`WORKFLOW.md`](WORKFLOW.md#speed-compiler-caches)) |
| `-DANTS_BUILD_ID=TEXT` | the git commit | the build id ([Versioning and the Build Id](#versioning-and-the-build-id)) |
| `-DENABLE_ASAN=ON` | `OFF` | AddressSanitizer and UBSan (below) |

### Running the Game

- macOS and Linux: `./build/src/ants_app/ants`. Windows: `start_game.bat`, or `build\src\ants_app\Release\ants.exe`.
- The window and the Dock show the original game's icon, and on Windows `ants.exe` carries it as its file icon ([`INSTALL_AS_APP.md`](INSTALL_AS_APP.md#the-icons), "The desktop game's icon").
- With no options the game opens the start menu; an option that chooses a mode, such as `--map-select`, skips it ([`CONTROLS.md`](CONTROLS.md#which-command-lines-show-the-menu)).
- A check without a window: a headless run of 60 frames that saves a screenshot (a BMP) and exits ([`COMMAND_LINE.md`](COMMAND_LINE.md#testing-headless-and-screenshots)):
  ```bash
  ./build/src/ants_app/ants --headless --frames 60 --screenshot output.bmp
  ```
  ```cmd
  build\src\ants_app\Release\ants.exe --headless --frames 60 --screenshot "output.bmp"
  ```

### Running with AddressSanitizer (ASan)

```bash
cmake -B build_asan -DCMAKE_BUILD_TYPE=Debug -DENABLE_ASAN=ON
cmake --build build_asan -j8
./build_asan/src/ants_app/ants
```

`-DENABLE_ASAN=ON` adds `-fsanitize=address,undefined`: AddressSanitizer and UBSan together. `./run_tests.sh --asan` runs the tests that way, in `build_asan` too. CI has no sanitizer job, so this is a local check.

### Running the Tests

```bash
./run_tests.sh --fast    # the quick tier, for every change
./run_tests.sh           # every suite
./run_tests.sh --list    # name the suites that a choice of options runs, and run nothing
```

On Windows, `run_tests.bat` builds the project and the E2E runner (`build_e2e`) and runs only a part of the suites: the asset decoders, `test_sim_rules` with the two simulation challengers, `test_app_integration` and the E2E runner. `ctest -N` in the build folder lists every test program, and `ctest -C Release --output-on-failure` runs them all. The E2E runner is a CMake project of its own:

```cmd
cmake -S tests/e2e -B build_e2e -G "Visual Studio 17 2022" -A x64
cmake --build build_e2e --config Release -j8
build_e2e\Release\e2e_runner.exe --all
```

The suites, the tiers and CI are in [`TESTING.md`](TESTING.md) and [`WORKFLOW.md`](WORKFLOW.md).

## Versioning and the Build Id

- The version is the one line of the file `VERSION` (`MAJOR.MINOR.PATCH`). CMake generates the C++ header `ants_app/version.hpp` from it into the build folder.
- When the version moves, and the separate rule for the network protocol number, are described in [`WORKFLOW.md`](WORKFLOW.md#version-policy) and [`NETWORK_PORT.md`](NETWORK_PORT.md).
- `./run_tests.sh --fast` fails when the top release heading of `CHANGELOG.md` or the version line of the `README.md` names another release than `VERSION`.
- The changelog is [`../CHANGELOG.md`](../CHANGELOG.md). How work goes from a commit to a release: [`WORKFLOW.md`](WORKFLOW.md).

Every build also has a **build id**, which says which build it is. Where the version and the build id show (in the examples, vX.Y.Z is the version and N the network protocol number):

| Where | What it shows |
|---|---|
| `ants --version`, `ants_server --version` | one line: the program's name, the version, the build id and the network protocol, for example `ants vX.Y.Z build abc1234 (network protocol N)`. No window and no assets; native builds only |
| the server's start-up log line | the same words, followed by the maps folder |
| the corner of the game window, next to the FPS meter (when Show FPS is on) | the version only |
| the footer of the web pages, and the last line of the Menu | "Version vX.Y.Z - build abc1234" in the footer of the front page; the same line ends the Menu of the bar at the top of the other pages, the game page and the changelog page included |

Where the id comes from:

- **A CMake build**: `-DANTS_BUILD_ID=<text>` when given, else the short git commit of the checkout (it needs a `.git` folder and `git` on the `PATH`), else `unknown`. The id is stamped at every build, so a new commit shows without a new configure.
- **The Docker images and `build_web.sh`**: the build argument `ANTS_BUILD_ID` (for `build_web.sh`, the environment variable), else the commit that the clone's `.git` files name (`HEAD`, `packed-refs` and `refs`), else the UTC time of the build, `YYYYMMDD-HHMM` (`docker/resolve_build_id.sh`; the log of a Docker build says which of the three it used).
- An id is 1 to 40 characters from letters, digits, `.`, `_` and `-`. CMake turns any other id into `unknown`; the Docker script ignores it and takes the next source.

Self-hosting with Docker (the site's image, its nginx and the stack) is described in [its own page](private/BUILD_AND_RUN_DOCKER.md).

## Building the Web Port Locally

```bash
./build_web.sh
tools/serve_web.py --dist dist
# Open http://localhost:8080 (the game page), http://localhost:8080/mapmaker (the Map Maker) and http://localhost:8080/asset_catalog/ (the sprites and sounds)
```

- `build_web.sh` needs Emscripten (`emcmake` and `emcc` on the `PATH`; it looks for `emsdk_env.sh` in `$EMSDK` and in `~/emsdk`, and says how to install Emscripten when it finds none). The Docker image uses the emsdk that the first line of `Dockerfile` pins.
- It builds without the tests and writes `dist/`: the game page as `index.html` and `play.html`, `index.js`, `index.wasm`, `index.data`, the Map Maker (`mapmaker.html`, the map core and its sprite atlas), the sprite and sound catalog (`asset_catalog/`), the favicon and `front/`. The pages load `site_hooks.js`, a stub that does nothing ([`PLAY_IN_BROWSER.md`](PLAY_IN_BROWSER.md#the-seam-to-a-site)): the build is the game and its tools, and nothing of a site.
- `index.data` packs the whole folder `Original-Ants/` as it lies on your disk (and the folder `assets/hud_art/`, the HUD's new pictures), so any other local file you keep there, such as a copy of the original program ([`ORIGINAL_PROGRAM.md`](ORIGINAL_PROGRAM.md#the-original-program-is-a-local-reference-not-part-of-the-repository)), goes into it too: do not publish or share that `dist/`. The Docker image build leaves such files out (`.dockerignore`).
- `tools/serve_web.py` (Python's standard library only) serves the folder on `127.0.0.1` as the pages expect to be served: the game, the pages and their scripts and styles are revalidated at every use (`Cache-Control: no-cache, must-revalidate`), every answer has the isolation headers, `/play` and `/mapmaker` are the pages `play.html` and `mapmaker.html`, and the list of maps and the six originals are answered for the Map Maker. `--port 0 -- COMMAND` runs a command (a browser check) against it with `ANTS_WEB_URL` set. It starts no game server: online play goes through `/ws`, which a site passes to one. What the page does: [`PLAY_IN_BROWSER.md`](PLAY_IN_BROWSER.md).
