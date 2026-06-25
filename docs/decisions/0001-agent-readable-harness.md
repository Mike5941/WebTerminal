# Decision 0001: Agent-Readable Harness

Status: Accepted

## Context

WebTerminal is small enough that a heavy framework would make the repository
harder to inspect. The project still needs repeatable checks and durable project
knowledge so agents can make safe changes without relying on chat history.

## Decision

Use a lightweight harness structure:

- `AGENTS.md` as the short entry map.
- `docs/` as the versioned knowledge base.
- `harness/checks/` as executable repository validation.
- `npm run check` as the default local verification command.

## Consequences

- Agents get a fast path from intent to source files.
- Important project knowledge has a stable home.
- Checks are plain Node scripts, so they run without new dependencies.
- The structure can grow later into CI, browser automation, or deeper linting.
