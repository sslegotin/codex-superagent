# Board

Status: `draft` → `ready` (the user approved it) → `done` (merged into its batch branch; it reaches `main` with the batch's PR or merge).
Mode: `solo` (one worker in its own worktree) or `team` (an agent team in the main checkout).
Runs: `alongside` (can start now), `waits for NNN: reason` (needs that ticket's output), or `overlaps NNN: files` (shares files with NNN but runs alongside; whichever finishes later syncs with the batch branch first).
Batch: the batch the ticket is built and delivered in. One batch = one run of the router = one PR or one merge into `main`.

| # | Title | Status | Mode | Runs | Batch |
|---|---|---|---|---|---|
