# WebTerminal Agent Map

This file is a map, not a handbook. Keep it short and point agents to the
smallest reliable source for the current task.

## Project Shape

- Runtime: Node.js with Express, `ws`, and `node-pty`.
- Entry point: `server.js`.
- Browser UI: `public/index.html`.
- Harness and repository checks: `harness/`.
- Durable project knowledge: `docs/`.

## Start Here

- Architecture map: `docs/architecture.md`.
- Quality status and known gaps: `docs/quality.md`.
- Local operations: `docs/operations.md`.
- Active and completed plans: `docs/plans/README.md`.
- Design decisions: `docs/decisions/`.
- Harness commands: `harness/README.md`.

## Working Rules

- Prefer small, testable server boundaries over process-global behavior.
- Keep browser-only code in `public/`; keep Node runtime code in `server.js`
  until the project grows enough to justify modules.
- Add or update a harness check when a behavior becomes important enough to
  preserve.
- Update `docs/quality.md` when you discover a persistent gap or close one.
- Keep `AGENTS.md` under 120 lines. Move details into `docs/`.

## Verification

Run this before handing off meaningful changes:

```sh
npm run check
```

For runtime behavior changes, also run:

```sh
npm run smoke
```
