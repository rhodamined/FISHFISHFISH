# FISHFISHFISH

FISHFISHFISH is a Tweego/SugarCube game with a Node.js server. Express serves
the compiled story and a separate live dashboard; Socket.IO handles player
game-code joins and dashboard updates.

## Project structure

```text
client/
  project/twee/       Twee story source
  src/scripts/        Browser-side JavaScript
  src/styles/         Browser-side CSS
  src/head-content.html
  build.js            Tweego build wrapper
  dist/               Generated story and client assets
dashboard/
  index.html          Live game-code dashboard
  dashboard.js        Dashboard Socket.IO client
  dashboard.css       Dashboard styling
server/
  index.js            Express and Socket.IO entry point
  socket_handlers.js  Player and dashboard socket events
  classes/            In-memory game state and tests
  google_oauth.js     Google credential helper
  google_sheets.js    Google Sheets reader and writer
```

The root `package.json` manages the server and provides scripts to build the
client. Express serves the compiled client and Socket.IO from the same
origin. The dashboard is available at `/dashboard`.

## Requirements

- Node.js 22 or newer and npm
- Tweego installed and available on `PATH`
- Access to a Google spreadsheet containing ten unique game codes in cells
  `B2:B11` on its first worksheet
- Google Application Default Credentials and permission to impersonate the
  configured service account

The story targets SugarCube 2.36.1, the format version available in the
Tweego installation used to verify this project.

## Configure Google Sheets

Set these variables in the repository-root `.env` file:

```dotenv
FISH_SHEETID=your_spreadsheet_id
SERVICE_ACCOUNT=service-account@project.iam.gserviceaccount.com
GOOGLE_APPLICATION_CREDENTIALS=keys/your-credentials-file.json
```

Keep the credentials JSON in the root `keys/` directory. Do not commit
credentials or `.env` files.

At startup, the server reads exactly ten codes from the first worksheet's
`B2:B11` range. It trims whitespace, normalizes codes to uppercase, and
requires every entry to be non-empty and unique. If Sheets cannot be read or
the data is invalid, the server reports an error and does not start. Codes
are loaded only at startup; restart the server to load spreadsheet changes.

## Build and run

Build the Tweego story, then start the server:

```sh
npm install
npm run build:client
npm start
```

By default, the game is served at `http://localhost:3005/` and the dashboard
at `http://localhost:3005/dashboard`. Set `PORT` to use a different port.

During story development, run the Tweego watcher and server in separate
terminals:

```sh
npm run watch:client
npm start
```

Refresh the browser after the story recompiles. Run the server-state and
Socket.IO handler tests with:

```sh
npm test
```

## Player join and reconnection

The player enters a code in the story's join form. The client sends
`game:join` with `{ "code": "..." }`. On success, the server replies with the
canonical code and an opaque `playerToken`, then places the socket in that
game's Socket.IO room. Each code can be claimed by only one player. A second
player receives `game_code_taken`; the form clears the input and asks them to
try another code.

Socket.IO automatically retries a dropped connection. After a successful
join, the client stores the assigned code and `playerToken` in
`sessionStorage`. When the socket reconnects, it resubmits both. The server
recognizes the existing claim, restores the socket to the game's room, and
marks the player connected. If the player disconnects, their code remains
claimed and the dashboard reports them as disconnected; another player
cannot take that code.

The token is kept for the current browser tab session. This reconnect strategy
and all game status are currently in-memory/session state, not durable
identity or persistent storage. Restarting the server clears all claims and
connection statuses; players must join again.

## Dashboard status

The dashboard displays ten cards. Each card shows:

- **Player status:** `Available` until a code is claimed, then `Player joined`.
- **Connection status:** `Not connected` before a player joins, then
  `Connected` or `Disconnected` as the player's socket state changes.

The dashboard subscribes with `dashboard:subscribe` and receives the current
state through `dashboard:state`. The server broadcasts changes to connected
dashboard clients.

## Current scope

The game-code registry and join status are held in memory. Google Sheets is
currently read at startup; the `writeStateToGSheet` helper is not wired into
gameplay. Durable game sessions, persistent player identity, refresh of
spreadsheet data without restart, and game-specific events remain future
work.
