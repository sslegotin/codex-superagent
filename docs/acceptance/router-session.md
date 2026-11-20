# Terminal router acceptance

On 2026-11-20, a fresh terminal Codex router delivered one ready solo ticket in a disposable macOS Git repository. The router selected the installed skill, issued every coordinator command, inspected the evidence and delivered the batch. The fixture harness prepared the repository and observed the run. Codex CLI was 0.166.0, Node.js was 25.9.0, and Git was 2.50.1.

## Invocation and inputs

Installation and verification each reported 30 managed files. The approved batch `demo` at `08b58c738e8ceb14426dc7a37ba8be57ec906409` contained one ticket, `001-greeting`. Its requirement was a new `greeting.txt` containing exactly `Ready for review.` followed by one LF. Its acceptance and integration check, `node check.cjs`, compared the bytes and printed `PASS greeting bytes`. The approved check file had to remain unchanged.

From the base checkout, the only dispatch input from the fixture was:

```sh
codex exec -C . --approve-for-me --json 'Use $router to run batch demo. Drive this installed pipeline through the independent checker. Once it passes, I choose local merge for delivery. Use only this disposable project and its worktrees.'
```

The desktop host granted scoped approval to start the outer CLI. The terminal router used workspace-write with automatic approval review. Nested role sessions used the installed runtime's configured workspace-write or read-only sandbox. All four nested processes completed. The checker emitted a macOS filesystem-denial warning with an unknown path and returned `PASS`.

## Recorded outcomes

| Stage | Evidence |
| --- | --- |
| Start | Router session ending `6f42e9d3` read `.agents/skills/router/SKILL.md`, ran `run demo` and prepared ticket 001. |
| Worker | Session `5a4cf55a` produced build `0e0481f9c383274f388711244fcab38afbf64128` in the ticket worktree. |
| Tester | Session `766df6a3` recorded `E-1\|PASS` in test commit `43ef6392e7313230b82e8287474c11809bad40bf`. Its cited `evidence/E-1.txt` reports exit 0 for the byte check and for the Git diff of `check.cjs` against the approved base. |
| Reviewer | Session `5481b531` returned `APPROVE`. Reviewed submission was `f730b1a17762bd7bf6cd972c8f0d7c398a444ff6`. The router inspected the committed diff and acceptance inputs. |
| Merge and checker | `merge demo 001` landed `5864a1089df657909954748296525356ddb2b969`. Independent checker session `cb736d4b` recorded `PASS` at that exact revision. At this point `main` still pointed to the approved base. |
| Delivery | The router ran `deliver demo local`. Both `main` and `batch/demo` ended at the checked landing. The router turn exited 0, with zero waivers and a clean checkout. |

After delivery, an independent shell reran `node check.cjs` successfully and verified an empty diff for the check file. The fixture directory was `$TMPDIR/superagent-router-acceptance-1ofdc_j8/`. The outer transcript was `router.jsonl`, and the durable run record was `target/.git/superagent/demo/state.json`.
