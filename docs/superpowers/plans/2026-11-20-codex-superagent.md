# Codex Superagent implementation plan

**Goal.** Write tickets in one Codex session and execute an explicitly requested batch from a fresh terminal router session. Deliver verified work as one batch.

**Architecture.** Git carries the approved inputs, ticket branches and durable evidence. Codex supplies the router and agent sessions. The first experiment selects the worker launch mechanism. The remaining tasks share the same workflow and acceptance checks.

**Tools.** Git, Codex CLI, Markdown skills, and Node.js CommonJS scripts with the built-in test runner. Use the [approved design](../specs/2026-11-20-codex-superagent-design.md) alongside this plan. Start from the Claude reference at `4f737df`. The proposed file locations below are relative to this repository. Use the executing-plans or subagent-driven-development workflow when implementation is requested.

## Implementation record

Implemented on the terminal using one Codex CLI session per worker worktree. The coordinator commits the changes when a role yields. A team shares its own ticket checkout under an exclusive integration lease. The board is a terminal view over the same journal used for recovery. The role lifecycle and watchdog tests cover restart, team leases, metrics, and alerts. The distribution uses the project's existing Git identity and leaves PR creation to the user.

The [terminal isolation experiment](../../tested-facts.md), [solo acceptance run](../../acceptance/solo-batch.md), [complete router session](../../acceptance/router-session.md), [mixed batch and forced restart](../../acceptance/team-recovery.md), and [setup verification](../../setup.md) record the tested surfaces and results. Desktop ticket handoff was exercised. Desktop router execution remains unverified.

## Constraints and review focus

- A writer may run in desktop or terminal. A terminal router must work. Support desktop routing once it passes the isolation and follow-up test.
- A committed, ready batch stays idle until the user names it in a run request. Record the approved base revision so later ticket edits cannot silently weaken checks.
- Review five failure cases across the tasks below. A resumed worker may land in the wrong checkout. A dependency may be outside the batch. A complete report may contain a failed check. A restart may repeat a successful merge. An upgrade may overwrite a user's edits.
- Read `AGENTS.md` before committing to this repository. Preserve upstream license and attribution when first copying code or prompts. Keep personal account settings out of the installable templates.

## 1. Select a terminal worker launch mechanism

**Deliverable.** A repeatable fixture in `tests/fixtures/isolation/` and a versioned observation in `docs/tested-facts.md`. Record CLI version, launch surface, exact invocation, base/worker commits, worktree roots, session IDs or redacted aliases, changes observed, and the selected mechanism.

- [x] Create a disposable Git repo with two worktrees at the same batch revision. Ask two native workers to edit the same relative path with distinct contents. Check the default shell directory, the target of an ordinary file edit, both diffs, and the untouched integration checkout. A successful shell `cd` alone cannot pass this test.
- [x] Resume one worker after an independent tester returns a failed check. Verify the worker remembers the requested correction and writes to its original checkout. Exercise reviewer dispatch with two workers active and record a capacity policy that allows both to finish.
- [x] If terminal native dispatch fails either test, repeat using `codex exec -C <worktree> --json` and resume by recorded session ID from the assigned directory. Record approval behavior under the user's normal sandbox. If both mechanisms fail, preserve the evidence and revisit dispatch before building the router.
- [x] Commit the fixture and observations after a successful terminal run. Desktop routing can be tested independently. Mark each surface as tested, failed, or untested.

## 2. Hand off an approved batch using Git

**Files.** `skills/write-tickets/SKILL.md`, `skills/write-tickets/templates/{BOARD,rd,eval}.md`, `skills/router/SKILL.md`, `lib/batch.cjs`, `tests/batch.test.cjs`.

- [x] Write fixtures for a ready batch, a draft, an unmet external dependency, a cycle, and a file overlap. Run `node --test tests/batch.test.cjs` and confirm the unsupported cases fail before implementing selection.
- [x] Port the reference ticket formats. Implement `selectBatch(boardText, batchName)` returning the selected tickets and their dependencies or a diagnostic. Distinguish waiting for a predecessor's output from merely touching the same file. Validate modes, duplicate IDs, missing inputs and dependency closure before starting any worker.
- [x] Make the writer record user-approved requirements, checks and batch membership in Git. Give the router an explicit run entry point that reads the approved revision. Demonstrate that a fresh router can inspect ready work without dispatch and that an explicit request dispatches only the named batch.
- [x] Repeat authoring in the desktop app and terminal. Close the writer before opening the terminal router. Confirm both outputs pass the same fixtures and commit the handoff.

## 3. Build, independently check and return a solo ticket

**Files.** `roles/{worker,tester,reviewer}.md`, `lib/jobs.cjs`, `lib/verify-results.cjs`, `tests/{jobs,verify-results}.test.cjs`. Extend `skills/router/SKILL.md` with the launch instructions proven in task 1.

- [x] Test that the job record binds batch, ticket, attempt, worktree, branch, worker session and submitted commit. Duplicate dispatch for an active attempt must reuse or reconcile the record. Ground commands in the selected worktree and allocate separate app resources where relevant.
- [x] Port the structured result parser. Test missing, empty and uncited evidence, stale revision, a complete report containing FAIL, NOT RUN with and without a user waiver, and an outstanding reviewer finding. Compare the submitted work against the approved check list. A changed or deleted acceptance check must go back for a decision.
- [x] Have the tester execute each check, the reviewer read the diff against the requirements, and the router inspect evidence at the submitted commit. Send failures to the original worker. Track the user's waiver against the specific ticket and check. Re-run tester and reviewer on a fix before queueing it.
- [x] Run `node --test tests/jobs.test.cjs tests/verify-results.test.cjs`. Reproduce the failed-check and fix round in the live fixture. Commit when the corrected revision is the only revision the router accepts.

## 4. Merge serially and deliver one batch

**Files.** `roles/{merger,checker}.md`, `lib/integration.cjs`, `tests/integration.test.cjs`, `docs/acceptance/solo-batch.md`.

- [x] Exercise two workers finishing together, a stale reviewed tip, a merge conflict, and failing integration checks in disposable repos. Confirm a single merger owns the integration checkout and records the last accepted revision. Reject unrelated staged or working changes before integration.
- [x] Land one approved revision at a time. Run project checks, return conflicts to the owning worker, and recover the prior batch state on failure. Have an independent checker exercise the merged behavior in its own checkout. Release waiting tickets when their dependency has landed.
- [x] Prompt once for delivery when the batch settles, summarizing completed tickets, exclusions and waivers. Exercise local merge and branch-push delivery separately. For this repo, the latter ends with a browser compare link for Sergey. Test Git delivery with a temporary bare remote.
- [x] Run `node --test tests/integration.test.cjs` and execute the design's first acceptance run. Record evidence for two concurrent workers, the corrected ticket, serial merges, checker output, and the base branch before delivery. Commit the solo milestone.

## 5. Recover runs and support team tickets

**Files.** `roles/{teammate,watchdog,reproducer}.md`, `lib/{reconcile,watchdog}.cjs`, `tests/{lifecycle,team,watchdog}.test.cjs`.

- [x] Stop a router before dispatch acknowledgement, during verification, and after Git records a merge but before job state updates. On restart, reconcile the journal with session, worktree and Git state. Test that a live worker is not duplicated and a landed commit is not merged again.
- [x] Port team ownership contracts, integration-owner checks and the shared-checkout lease. Test that a team and a merger cannot acquire it together, a second team queues, and independent solo workers continue.
- [x] Use a supported active-run timer or bounded wait to drive watchdog checks. Test a quiet worker, a repeated alert, a stale lock and a checker-reported bug. Reattach or replace workers with recorded lineage. Serialize reproducers and route confirmed fixes through the merge queue.
- [x] Run `node --test tests/lifecycle.test.cjs tests/team.test.cjs tests/watchdog.test.cjs` and one mixed live batch with a router restart. Commit after the resulting Git history and job records agree.

## 6. Install, upgrade and show progress

**Files.** `skills/setup/SKILL.md`, `scripts/setup.cjs`, `lib/{manifest,board}.cjs`, `tests/{install,lifecycle,watchdog}.test.cjs`, `README.md`, and `docs/tested-facts.md`.

- [x] Test fresh installation, rerun and upgrade in disposable target repos. Cover an existing Codex configuration, user-authored instructions, project-specific blocks, unmanaged edits and existing runtime state. Require a diff and user decision before replacing locally edited managed content.
- [x] Port the installer, inventory and project discovery. Ask for missing project commands and resource-isolation settings, then self-test the result in the target repo. Record which role and skill discovery paths actually work on the supported surfaces.
- [x] Derive metrics and board rows from the same durable job records. Show ticket dependencies, worker state and watchdog alerts. Select the live board presentation after testing the available surface. Include a terminal-readable view for the required runtime.
- [x] Run `node --test tests/*.test.cjs`, install into a clean sample project, and complete a batch using only the published setup and running instructions. Commit the supported-surface matrix with the release documentation.
