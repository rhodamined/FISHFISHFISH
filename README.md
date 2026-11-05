# FISHFISHFISH

FISHFISHFISH is a Tweego/SugarCube game with a Node.js server. Express serves
the compiled story and a separate live dashboard; Socket.IO handles Player ID
joins and dashboard updates.

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
  index.html          Live Player ID dashboard
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
- Access to a Google spreadsheet with player IDs in column B, starting at
  cell `B2` on its first worksheet (currently ten Player IDs)
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
DASHBOARD_PASSWORD=jasper
```

Keep the credentials JSON in the root `keys/` directory. Do not commit
credentials or `.env` files.

At startup, the server reads non-empty player IDs from the first worksheet's
column B, starting at `B2` and continuing to the end of the worksheet. It
trims whitespace, normalizes IDs to uppercase, and requires IDs to be
unique. If Sheets cannot be read or the data is invalid, the server reports
an error and does not start. The loader reads the whole column so more Player
IDs can be added without changing the server's data-loading logic.

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

Each game has a unique six-character alphanumeric **Game ID**, generated when
the server starts and whenever a new game begins. This identifies the game
session and is shown on the dashboard and in server logs.

The spreadsheet values are **Player IDs**: they identify individual player
slots within the current game. The player enters a Player ID in the story's
join form. The client sends `game:join` with `{ "playerId": "..." }`. On
success, the server replies with the canonical Player ID and an opaque
`playerToken`, then places the socket in that player's `player:<playerId>`
Socket.IO room. Each Player ID can be claimed by only one player. A second
player receives `player_id_taken`; the form clears the input and asks them to
try another Player ID.

Socket.IO automatically retries a dropped connection. After a successful
join, the client stores the assigned Player ID and `playerToken` in
`sessionStorage`. When the socket reconnects, it resubmits both. The server
recognizes the existing claim, restores the socket to the player's room, and
marks the player connected. If the player disconnects, their Player ID remains
claimed and the dashboard reports them as disconnected; another player
cannot take that ID.

The token is kept for the current browser tab session. This reconnect strategy
and all game status are currently in-memory/session state, not durable
identity or persistent storage. Restarting the server clears all claims and
connection statuses; players must join again.

## Dashboard status

The dashboard displays the current Game ID and one card per Player ID. Each
card shows:

- **Player status:** `Available` until an ID is claimed, then `Player joined`.
- **Connection status:** `Not connected` before a player joins, then
  `Connected` or `Disconnected` as the player's socket state changes.

The dashboard subscribes with `dashboard:subscribe` and receives the Game ID
and Player ID state through `dashboard:state`. The server broadcasts changes
to connected dashboard clients.

The dashboard requires the password `jasper` to subscribe to game state and
start a new game. Set `DASHBOARD_PASSWORD` in the server environment to
override it. A new game is started from the dashboard's **New game** button
after a confirmation. The server notifies joined players, removes their
sockets from player rooms, reloads and validates the Player IDs from Google
Sheets, generates a new Game ID, and replaces the in-memory player list. This
supports adding or changing IDs in the sheet between games. If the read or
validation fails, the current game is left intact and the dashboard reports
the refresh failure. Player clients clear their saved Player ID and token and
return to the join form. The dashboard password is a simple development gate;
deploy behind HTTPS and change the default before exposing the app publicly.

## Current scope

The Game ID, Player ID registry, and join status are held in memory. Google
Sheets is read at startup and when a new game starts; the `writeStateToGSheet`
helper is not wired into gameplay. Durable game sessions, persistent player identity,
and game-specific events remain future work. As more game data is added, the
Sheets reader and in-memory state can be extended to load and validate those
fields as part of the same startup/new-game synchronization.
