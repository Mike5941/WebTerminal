# Operations

## Local Run

```sh
npm start
```

Default address:

```text
http://127.0.0.1:3000
```

Override host or port with environment variables:

```sh
HOST=127.0.0.1 PORT=3001 npm start
```

## Verification

Run all local harness checks:

```sh
npm run check
```

Run only the runtime smoke check:

```sh
npm run smoke
```

Run individual checks:

```sh
npm run check:docs
npm run check:structure
```

## Troubleshooting

- If the browser opens but shows no prompt, run `npm run smoke` to verify the
  WebSocket and pseudo-terminal path.
- If the port is busy, rerun with a different `PORT`.
- If terminal spawning fails, confirm `SHELL` points to an installed shell.
- If CDN assets fail to load, the static page may render without xterm.js. The
  current smoke harness does not depend on CDN access.
