# WebTerminal Knowledge Base

This directory is the durable memory for the project. It exists so agents can
recover project intent from versioned files instead of relying on chat history.

## Index

- `architecture.md`: system boundaries and dependency direction.
- `operations.md`: local run, verification, and troubleshooting commands.
- `quality.md`: current quality grade, risks, and cleanup queue.
- `decisions/`: durable architectural decisions.
- `plans/`: active, completed, and deferred execution plans.

## Maintenance

- Keep documents short and link to deeper files when detail grows.
- Prefer concrete commands and file paths over prose-only guidance.
- Record decisions that should survive beyond one task in `decisions/`.
- Record multi-step work in `plans/` before or during execution.
