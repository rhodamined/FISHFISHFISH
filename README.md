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
- Tweego installed and available on `PATH` wherever you build the client
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

## Deploy manually to the DigitalOcean droplet

The app is hosted at `fish.sourmilk.xyz`. Nginx handles public HTTP/HTTPS and
proxies requests to Node on `127.0.0.1:3005`; PM2 keeps the Node process
running. The subdomain has its own Nginx site configuration, separate from
the existing `dirt.sourmilk.xyz` and `dirtsocketserver.sourmilk.xyz` sites.
The deployment is manually triggered from the development machine. The
script runs tests and builds with local Tweego, commits only the generated
`client/dist` files, pushes the current branch, then asks the droplet to pull
the branch and restart the app through PM2. Tweego is not needed on the
droplet.

### One-time setup

The development machine should have Node.js 22 or newer, npm, Git, and Tweego
available on `PATH`. The droplet should have Node.js 22 or newer, npm, Git,
PM2, SSH access, and `curl`. Check these tools:

```sh
node --version
npm --version
tweego --version
```

On the droplet, check `node`, `npm`, `git`, `pm2`, and `curl` as well.

The repository, `.env`, and Google credentials must be readable by the same
Linux user that runs PM2. Keep credentials private and outside version
control. The `.env` file should define `FISH_SHEETID`, `SERVICE_ACCOUNT`,
`GOOGLE_APPLICATION_CREDENTIALS`, and a strong non-default
`DASHBOARD_PASSWORD`. The Google credential file must be readable by the app
user and have permission to impersonate `SERVICE_ACCOUNT`.

Configure PM2 to start the app from the repository root, so Node loads the
root `.env` file. For example, if it has not already been registered:

```sh
cd /path/to/FISHFISHFISH
NODE_ENV=production HOST=127.0.0.1 PORT=3005 pm2 start server/index.js --name fishfishfish
pm2 startup
```

Run the command printed by `pm2 startup`, then save the process list:

```sh
pm2 save
```

Run PM2 as the same Linux user consistently; `sudo pm2` and a regular user's
`pm2` manage different process lists. The app must bind to `127.0.0.1:3005`;
do not expose port 3005 through the droplet firewall.

Add a dedicated Nginx server block for `fish.sourmilk.xyz` in
`/etc/nginx/sites-available/fish.sourmilk.xyz`:

```nginx
server {
    listen 80;
    listen [::]:80;
    server_name fish.sourmilk.xyz;

    location / {
        proxy_pass http://127.0.0.1:3005;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection $http_connection;
        proxy_buffering off;
        proxy_read_timeout 75s;
        proxy_send_timeout 75s;
    }
}
```

Enable the new site without replacing either existing site. If the enabled
link already exists, inspect it instead of overwriting it:

```sh
sudo ln -s /etc/nginx/sites-available/fish.sourmilk.xyz /etc/nginx/sites-enabled/fish.sourmilk.xyz
sudo nginx -t
sudo systemctl reload nginx
```

After confirming DNS points `fish.sourmilk.xyz` to the droplet and HTTP works,
enable HTTPS with the droplet's Certbot installation:

```sh
sudo certbot --nginx -d fish.sourmilk.xyz
```

### Updating the app

The local source changes must be committed first. The deploy script refuses a
dirty worktree so that it cannot accidentally include unrelated local edits.
The current branch must track its Git upstream, and the droplet's repository
must already be checked out to that same branch.

Configure SSH access from the development machine and set the remote repository
path and PM2 process name. For example:

```sh
export DEPLOY_TARGET=fish-droplet
export REMOTE_APP_DIR=/path/to/FISHFISHFISH
export PM2_APP_NAME=fishfishfish
npm run deploy:manual
```

`DEPLOY_TARGET` is an SSH hostname or alias; the remote account must be able to
run Git, npm, PM2, and curl in the app checkout. Run PM2 as the same Linux user
that owns the process. The script runs tests and builds the client locally,
then commits only changed `client/dist` files with the message
`Build client for deployment`. It pushes the current branch; on the droplet it
checks for a clean worktree, pulls with fast-forward-only behavior, installs
production dependencies, restarts PM2, and checks `/health`. It does not copy
or overwrite `.env` or Google credentials. Review the build commit and confirm
the deploy output and logs:

```sh
curl --fail http://127.0.0.1:3005/health
curl --fail https://fish.sourmilk.xyz/health
pm2 status
pm2 logs fishfishfish --lines 100
```

The script requires Tweego only on the development machine. Generated files
under `client/dist/` are tracked in Git; other `dist/` folders remain ignored.
If source changes are made on the droplet, commit or otherwise safely preserve
them before deploying—the script intentionally refuses to pull over a dirty
remote worktree.

The server state is held in memory, so each PM2 restart clears current player
claims and creates a new Game ID. This is a single-instance deployment; do
not run multiple app instances without adding shared persistent state.

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
