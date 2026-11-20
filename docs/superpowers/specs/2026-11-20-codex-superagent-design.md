# Codex Superagent adoption

Design proposal for review, 2026-11-20. Behavioral reference is `sslegotin/claude-superagent` at `4f737df`, especially `docs/how-it-works.md`, the ticket templates, and the result verifier.

## Two sessions and a Git handoff

The ticket writer interviews the user and writes the same Markdown artifacts as the Claude version. Each ticket gets `specs/tickets/NNN-slug/rd.md` for requirements and `eval.md` for checks. The board at `specs/tickets/BOARD.md` records mode, dependencies, overlaps, batch and status. The writer can run in desktop or terminal. Tickets start as drafts. The user approves a batch for execution and the approved inputs are committed so workers can read them in their own checkouts.

The router runs in a separate Codex session. It can start from a fresh conversation and reconstruct the approved scope from Git. Dispatch requires both a ready batch and the user's explicit request to run that batch. The router coordinates implementation, verification, recovery and delivery. The user can close the ticket writer for the entire run.

Terminal execution is the release requirement. Desktop routing can ship when it passes the same acceptance run. A desktop ticket writer and terminal router must be able to complete a batch together.

## Worker approaches

1. **Native Codex subagents.** The preferred first experiment uses the built-in agent lifecycle for dispatch, follow-up and completion. Each solo worker needs a distinct Git worktree rooted at the selected batch commit. The spawn tool in the desktop session inspected for this design shares a workspace and exposes no per-child working directory. An instruction to change directory alone provides insufficient evidence of isolation.
2. **Separate CLI sessions.** If native dispatch cannot meet the worktree requirements in the terminal, the router creates explicit ticket worktrees from the batch branch and launches a worker with `codex exec -C <worktree> --json`. Record the worker's session ID for `codex exec resume` on a fix round. This adds process and session bookkeeping. Both approaches use the same tickets, evidence and merge rules. The installed CLI 0.166.0 advertises these commands. End-to-end behavior, including working directory and approvals after resume, needs a live test.

Use the first approach that passes in the terminal. Test native desktop routing independently if the surface exposes per-worker isolation. A desktop limitation can narrow supported entry points without changing the on-disk format or delaying terminal delivery.

## First acceptance run

Use a disposable repository with a committed base and an approved batch. Write the tickets in the desktop app, close that session, then open the terminal router. Repeat ticket authoring from the terminal using the same format.

- Confirm that preparing tickets and reopening the router leave the batch idle. Explicitly request the named batch. Capture the starting commit and the selected ticket IDs.
- Start two solo workers concurrently from that commit. Have each edit the same relative scratch path with a different value. Check each worker's default command and edit roots, Git branch, and working tree contents. Each edit must land in its assigned checkout, and the integration checkout must stay clean. Use separate app ports or test data where relevant.
- Give one worker a deliberately failing check. Have a separate tester record the failure with evidence. Return it to the original worker, confirm it resumes in the assigned checkout and fixes the code, then obtain fresh tester and reviewer reports on the corrected revision.
- The router checks results against the ticket and reads the cited evidence at the submitted revision. A missing result, missing evidence, failed check or unresolved review finding sends the ticket back. A check that could not run requires the user's explicit waiver before merge.
- Port the verifier's structured fields as well as its completeness check. In the reference implementation a complete report containing a failing check can exit zero. Exercise that case explicitly and require an approving review and acceptable results before enqueueing a merge.
- Merge accepted work serially onto the batch branch. Run integration checks and exercise the merged behavior with a checker. A conflict or failed integration check returns to the worker and leaves the last accepted batch state recoverable. Delivery requires the user's choice of one PR or one local merge. Verify the base branch stays at its starting commit until local delivery is chosen.

## Adoption sequence

1. **Prove the worker lifecycle.** Record a versioned result for the isolation and follow-up experiment. A failure selects the CLI fallback for the same experiment. Reserve enough capacity for verification when two workers are active. An exhausted agent pool must allow progress.
2. **Port ticket authoring and solo execution.** Reuse the Markdown formats, parser and evidence verifier where applicable. Add Codex role instructions, the explicit router entry point, dependency-aware dispatch, the merge queue and independent checks. Complete the first acceptance run.
3. **Port team tickets and recovery.** Preserve file ownership in a team contract and designate one integration owner. A team holds the integration checkout exclusively while solo builds can continue. Persist ticket, branch, worktree, session and revision information. Restart the router mid-batch and reconcile with Git before redispatching. Exercise a stale worker, a repeated alert and a post-merge bug with the watchdog and reproducer. Choose the periodic check mechanism using observed Codex behavior.
4. **Package and expose progress.** Adapt setup and upgrades for a target repo with existing Codex configuration. Preserve project customizations, offer a diff for locally edited managed files, and self-test the installation. Keep upstream license and attribution with reused material. Use the same durable job state for metrics and a live board. Select the board surface separately from worker dispatch after the runtime data is stable.

The first milestone covers solo tickets. Team tickets, restart recovery, watchdog, setup and the board remain part of the broader parity plan. During incremental releases, the router must report unsupported ticket modes before dispatch. Transport details, board presentation and packaging layout are proposed implementation decisions. Desktop router support remains conditional on observed behavior.
