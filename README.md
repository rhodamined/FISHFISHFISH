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
server/
  index.js            Express and Socket.IO entry point
  socket_handlers.js  Socket event registration
  classes/            Game classes
  google_oauth.js     Google credential helper
  google_sheets.js    Google Sheets writer
```

The root `package.json` provides commands for the app. Express serves the
generated `client/dist/` files and the Socket.IO endpoint from the same
origin and port. The client loads the Socket.IO browser library from
`/socket.io/socket.io.js`.

The initial socket handshake emits `server:ready` with
`{ "connected": true }`. This confirms that the client has connected; it is
not yet a gameplay-state synchronization protocol. Gameplay events,
validation, persistence wiring, and reconnect/state recovery still need to
be designed and implemented.

Google Sheets code is server-only. `writeStateToGSheet` is available as an
integration helper but is not currently called by the server's socket
handlers or game-state classes. Importing the module does not initiate a
Google API request.

## Prerequisites

- Node.js 22 or newer
- npm
- Tweego installed and available on `PATH`

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
- Google Application Default Credentials, including the permissions needed
  to impersonate that account

Do not commit credentials or `.env` files.
