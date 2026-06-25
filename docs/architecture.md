# Architecture

WebTerminal is a compact browser-based terminal that connects a static xterm.js
UI to a local pseudo-terminal through WebSockets.

## Runtime Boundaries

- `server.js` owns the Node process, Express app, HTTP server, WebSocket server,
  and `node-pty` lifecycle.
- `public/index.html` owns browser rendering, xterm.js setup, resize messages,
  keyboard shortcuts, and click-to-move cursor behavior.
- `harness/checks/` owns repository validation and smoke checks. Harness code
  may import production code, but production code must not import harness code.
- `docs/` owns durable project knowledge. Source code should not depend on docs.

## Request Flow

1. Browser loads `/` from Express static middleware.
2. Browser opens a WebSocket to the current host.
3. Server creates a pseudo-terminal for the connection.
4. Browser sends `input` and `resize` messages.
5. Server forwards terminal output back over the socket.
6. Closing the socket kills the pseudo-terminal.

## Agent-Readable Invariants

- `/healthz` returns JSON and is safe for harness probes.
- Server creation is testable through `createWebTerminalServer()`.
- `node server.js` remains the production start command.
- The UI is intentionally single-file until there is enough complexity to split.
- WebSocket messages are JSON objects with `type` set to `input` or `resize`.

## Growth Triggers

Split `server.js` only when one of these becomes true:

- More than one runtime feature needs independent tests.
- WebSocket message validation gains multiple message families.
- Authentication, session isolation, or audit logging is added.
- Process lifecycle code becomes hard to reason about in one file.
