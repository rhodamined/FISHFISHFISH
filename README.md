# FISHFISHFISH

FISHFISHFISH is an interactive fish game built with a Tweego/SugarCube story
client and a Node.js/Express server. Socket.IO provides the real-time
client/server connection. The server is intended to own authoritative game
state, while the story handles presentation and player interaction.

## Architecture

```text
client/
  project/twee/       Twee story source
  src/scripts/        Browser-side JavaScript
  src/styles/         Browser-side CSS
  src/head-content.html
  build.js            Tweego build wrapper
  dist/               Generated story and client assets
dashboard/
  index.html          Separate live game-code dashboard
  dashboard.js        Dashboard Socket.IO client
  dashboard.css       Dashboard layout and status styling
server/
  index.js            Express and Socket.IO entry point
  socket_handlers.js  Socket event registration
  classes/            In-memory game state
  google_oauth.js     Google credential helper
  google_sheets.js    Google Sheets reader and writer
```

The root `package.json` provides commands for the app. Express serves the
generated `client/dist/` files and the Socket.IO endpoint from the same
origin and port. The separate dashboard is available at `/dashboard`. Both
browser clients load the Socket.IO library from `/socket.io/socket.io.js`.

On startup, the server reads exactly 10 game codes from cells `B2:B11` on the
first worksheet in the configured Google spreadsheet. Codes are trimmed and
compared without case sensitivity. The server validates that all ten entries
are non-empty and unique before listening; startup fails with an explicit
error if the spreadsheet cannot be read or its codes are invalid. The loaded
codes and their join status are held in memory and are not polled or refreshed
while the server is running. Restart the server to load spreadsheet changes
or clear joined status.

The initial socket handshake emits `server:ready` with
`{ "connected": true }`. Players enter a code in the story form; the client
sends it using the `game:join` Socket.IO event with `{ "code": "..." }`. The
server acknowledges a successful join with the canonical `gameCode` and a
session `playerToken`.
The token lets that same browser session reconnect without claiming another
code. Each code can be claimed by only one player token. A subsequent player
gets `{ "ok": false, "error": "game_code_taken" }`; the form clears the code
field and prompts them to try another. A successful join places the socket in
the matching Socket.IO room.

The dashboard subscribes with `dashboard:subscribe` and receives the ten
codes and their `available`/`joined` status in `dashboard:state`. The server
broadcasts updated status when a code is first claimed. Dashboard status is
live for the current server process only.

This is the initial in-memory game-code registry and join flow, not a durable
gameplay-state database. Game-session state, durable player identity,
persistence, and gameplay event handling still need to be designed.

Google Sheets code is server-only. `writeStateToGSheet` is available as an
integration helper but is not currently called by the server's socket
handlers or game-state classes. Importing the module does not initiate a
Google API request.

## Prerequisites

- Node.js 22 or newer
- npm
- Tweego installed and available on `PATH`
- A configured Google spreadsheet with ten unique game codes in `B2:B11`

The story metadata currently targets SugarCube 2.36.1, the format version
available in the installed Tweego setup used to verify this scaffold.

## Build and run

```sh
npm install
npm run build:client
npm start
```

The app is served at `http://localhost:3005` by default. Set `PORT` to change
the server port.

Run the automated server-state and socket-handler tests with `npm test`.

For iterative story development, run these in separate terminals:

```sh
npm run watch:client
npm start
```

The watch command recompiles the story when Twee sources change. Refresh the
browser to load the updated build.

## Google Sheets configuration

If/when Sheets persistence is wired into the game, configure these values in
the server environment:

- `FISH_SHEETID`: spreadsheet ID
- `SERVICE_ACCOUNT`: service account to impersonate
- `GOOGLE_APPLICATION_CREDENTIALS`: path to the credentials JSON file. With
  the file stored in the root `keys/` directory, set this relative to the
  repository root, for example `keys/<credential-file>.json`.
- Google Application Default Credentials must have the permissions needed to
  impersonate the configured service account.

Do not commit credentials or `.env` files.
