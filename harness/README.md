# Harness

The harness is the executable feedback loop for WebTerminal. It should stay
small, deterministic, and useful to both humans and agents.

## Commands

```sh
npm run check
```

Runs documentation, structure, and runtime smoke checks.

```sh
npm run check:docs
```

Verifies that the agent map and knowledge base entry points exist and stay
reasonably small.

```sh
npm run check:structure
```

Verifies project boundaries that keep the repository easy to navigate.

```sh
npm run smoke
```

Starts an in-process WebTerminal server on an ephemeral port, probes HTTP, opens
a WebSocket, and verifies pseudo-terminal output.

## Adding Checks

- Put checks in `harness/checks/`.
- Use only built-in Node modules unless a dependency is already justified.
- Prefer actionable failure messages that tell an agent what to edit.
- Add the command to `package.json` when it becomes part of normal verification.
