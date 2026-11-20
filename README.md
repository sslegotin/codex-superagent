# Codex Superagent

Write tickets in one Codex session and run them in another. A terminal router coordinates parallel workers, independent testers and reviewers, a serial merge queue and a post-merge checker. Your Git repository holds the approved requirements, evidence and batch branch. You choose when the batch starts and how to deliver it.

## First batch

Install the setup plugin once in Codex:

```sh
codex plugin marketplace add https://github.com/sslegotin/codex-superagent.git
codex plugin add superagent@codex-superagent
```

1. Open the Git project you want to configure in a fresh Codex session and ask **“Use $superagent:setup to configure this repository.”** Setup discovers check commands and asks about the worker limit and port/data isolation. Commit the installed files in the target project. The router needs at least one commit with approved inputs. [Installation and upgrades](docs/setup.md)
2. Open the project in Codex and invoke `$write-tickets`. Describe the feature, review the requirements and checks, then ask to mark the batch ready. The writer commits the approved inputs. You can close this session.
3. From the target project's base checkout, start a fresh `codex` terminal session. Say **“Use $router to run batch text-tools”**, substituting the approved batch name. The router checks dependencies and dispatches the eligible tickets. An inspection or a ready status alone leaves a batch idle.
4. The router sends failed checks back to the same worker and tests the corrected revision again. Answer any questions about blocked requirements or checks that could not run. Once the batch settles, choose a local merge or a Git push and browser PR creation link.

To inspect progress from another terminal in the same project:

```sh
node .superagent/scripts/superagent.cjs board text-tools --watch
```

The board refreshes every three seconds. It shows the active role for each ticket, dependency waits, and alerts from the most recent watchdog round. Ten minutes without a new agent event triggers a quiet alert. An off-track alert names a changed path matching a ticket’s `Do not touch` rule. The router runs `watchdog text-tools` during active waits. You can also run that command for a fresh scan.

## How work moves through Git

| Stage | Result |
| --- | --- |
| Approve | `specs/tickets/BOARD.md` names a batch. Each numbered directory has approved `rd.md` and `eval.md` files. The router pins their commit. |
| Build | A solo ticket gets a Git branch, worktree and Codex CLI session. A team ticket gets one shared ticket checkout with a named integration owner and disjoint file assignments. The coordinator records changes using the project's Git identity and signing configuration. |
| Verify | An independent tester writes evidence against the implementation SHA. A read-only reviewer checks the requirements, diff and evidence. The router checks the report and inspects cited files before integration. Each waiver is tied to a specific check and reviewed submission. |
| Integrate | The merger builds a candidate commit, runs the project's configured checks and advances the batch branch after they pass. A checker exercises the exact landing in a separate checkout. Confirmed regressions go through reproduction, verification and integration again. |
| Recover | A journal under the common Git directory stores worktree paths, worker sessions, submitted revisions, decisions and landing receipts. Reopening the batch reconciles in-flight work with Git. Worktrees and the journal remain available after delivery for inspection. |

Use `metrics BATCH` for per-role timings, `status BATCH` for the journal, `recover BATCH` for an interrupted run and `help` for the coordinator commands. A fresh router can resume the work. Keep the router session running for periodic watchdog checks. The terminal board can remain open independently.

## Supported environments

The runtime uses Git and Node.js 18 or newer (Node 24/25 used in development). Workers use an authenticated Codex CLI. Terminal execution was exercised on macOS with Codex CLI 0.166.0. Separate CLI sessions provide per-ticket working directories. Native subagents within a team deliberately share one ticket checkout. Desktop ticket authoring can hand work to a terminal router through Git. Desktop router execution is unverified. [Tested behavior](docs/tested-facts.md) · [One router session from start to delivery](docs/acceptance/router-session.md) · [Solo batch](docs/acceptance/solo-batch.md) · [Team and recovery](docs/acceptance/team-recovery.md)

## Development

```sh
node --test tests/*.test.cjs
```

The automated suite uses disposable Git repos. The separate [live isolation fixture](tests/fixtures/isolation/README.md) exercises actual Codex sessions and consumes model usage.

Adapted from the Claude Superagent implementation and DeepSeek's super-agent prototype. [License](LICENSE) · [Third-party notices](THIRD_PARTY_NOTICES.md)
