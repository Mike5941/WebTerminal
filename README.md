# WebTerminal

A browser-based terminal for your local machine. The frontend renders with
[xterm.js](https://xtermjs.org/); the backend spawns a real shell with
[node-pty](https://github.com/microsoft/node-pty) and streams it over a
WebSocket. Your own shell profile (`.zshrc`, prompt, aliases, etc.) is used as-is.

## Features

- Real PTY-backed shell — `vim`, `top`, tab completion, `Ctrl+R` history all work
- Multiple sessions with renamable tabs (right-click a tab to rename)
- Click to move the caret, double-click to select a word, drag to select
- `Cmd+←/→` jump to line start/end, `Cmd+Delete` clears to line start
- Right-click an output block to copy just that command's output
- "Claude Dark" color theme

## Requirements

- Node.js 18+ (developed on Node 25)
- macOS or Linux (Windows uses PowerShell via node-pty, untested)

## Setup

```sh
git clone https://github.com/Mike5941/WebTerminal.git
cd WebTerminal
npm install
npm start
```

Then open <http://127.0.0.1:3000>.

`npm install` runs a postinstall step that restores the executable bit on
node-pty's `spawn-helper` binary, so a fresh clone runs without manual fixes.

## Configuration

Override host/port with environment variables:

```sh
HOST=127.0.0.1 PORT=3001 npm start
```

By default the server binds to `127.0.0.1` only.

## Autostart at login (macOS)

To run the server automatically at login via launchd:

```sh
sh scripts/install-autostart.sh
```

The script fills in this machine's repo path automatically and loads the agent.
To remove it:

```sh
launchctl unload ~/Library/LaunchAgents/local.webterminal.plist
rm ~/Library/LaunchAgents/local.webterminal.plist
```

## Security

This server gives any connected browser a full shell with your user's
privileges. Keep it bound to `127.0.0.1` (the default) and **do not expose it to
a public network** — there is no authentication.

## Project layout

```
server.js            Express + ws + node-pty backend
public/index.html    xterm.js frontend (single file)
scripts/             Helpers (autostart, postinstall pty fix)
```

## Troubleshooting

**`Error: posix_spawnp failed`** — node-pty's `spawn-helper` lost its executable
bit. Re-run `npm install` (the postinstall fixes it) or manually:

```sh
chmod +x node_modules/node-pty/prebuilds/*/spawn-helper
```
