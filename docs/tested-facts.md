# Tested surfaces

## Terminal workers on 2026-11-20

**Selected mechanism:** one `codex exec` process per worktree. In a fresh process with its working directory set to the assigned checkout, resume the original worker by its recorded `thread.started.thread_id`. The live run used macOS, `codex-cli 0.166.0`, the local ChatGPT login and the default model configuration.

| Surface | Result | Observation |
| --- | --- | --- |
| Terminal native workers | Failed | The terminal spawn schema had no per-worker working directory. Two real children edited the integration checkout. |
| Terminal separate CLI processes | Passed | Two workers edited distinct files at the same relative path. A resumed worker fixed its original checkout after an independent failed check. |
| Desktop native dispatch and follow-up | Untested | The live workers and reviewers in this experiment all ran through the terminal CLI. |
| Desktop-authored ticket handoff | Passed | The desktop task authored one ticket and a fresh terminal router read its approved revision from Git. |
| Terminal-authored ticket handoff | Passed | A separate CLI writer authored the second ticket, exited, and left the ready work idle for explicit dispatch. |
| Installed terminal router and role prompts | Passed | The fresh router opened the installed `.agents/skills/router/SKILL.md`. The installed command loaded prompts from `.superagent/roles/` for two workers, testers, reviewers and detached checkers. |

The [solo acceptance run](acceptance/solo-batch.md) records the installed runtime, handoff, worker correction, merged revisions and local delivery.

### Native edits

The native fixture root was `$TMPDIR/codex-worker-isolation-5M8J9I`. Its `integration`, `a` and `b` worktrees all started and ended at `1c652d34a164ec59441c4e42f988fd7c72c20970`. Native child A and native child B are redacted session aliases. Both reported the integration root on their first `pwd`. A patched the relative file from `baseline` to `alpha`. B then patched it from `alpha` to `bravo`. Independent Git inspection found that only `integration/probe.txt` changed. The two ticket checkouts still contained `baseline`.

The exact native edit prompt is in the [native fixture](../tests/fixtures/isolation/native.txt). The terminal driver launched it from the disposable integration checkout with `codex exec -C . -s workspace-write --json "$prompt"`. The [fixture instructions](../tests/fixtures/isolation/README.md) show the equivalent invocation using stdin.

### Separate CLI processes

The successful fixture root was `$TMPDIR/codex-worker-isolation-akf7V1`. Physical paths reported by `pwd` on this host used `/private/var/folders/zz/s4whqwz175s_qnsb__plt1tm0000gn/T` for `$TMPDIR`. The integration checkout stayed clean at the base commit. Each worktree began from that commit, and both worker diffs contained only `probe.txt`.

| Checkout | Submitted commit | Observed content |
| --- | --- | --- |
| `integration` | `3cfa75d01252b240d024cca6db938d6a73c8a3e8` | `baseline` |
| `a`, first submission | `8df88f47ab13cecdc8c3eef39bd419e917a22bd6` | `alpha` |
| `b`, first submission | `82dfdb615367bba3f1328af12aaebfd4e0480c5c` | `bravo` |
| `a`, corrected submission | `ea73b21bd9d8d0ea0f0b11ce608d1ea6b167720b` | `corrected-bbeb9b3a36171ae7` |

The commands below use shell variables for the recorded absolute worktree path and session UUID. Prompts went through stdin. The runner set the process working directory to the same worktree on both launch and resume. It stored one private invocation record, event stream and stderr file per role in the temporary root.

```sh
codex exec -C "$worktree" -s workspace-write --json -
codex exec -C "$worktree" -s workspace-write resume --json "$worker_session" -
codex exec -C "$worktree" -s read-only --json -
```

Worker A's launch and resume both emitted the session ID ending `0be25118`. B used `b6a9ab47`. Their first shell commands printed the physical `a` and `b` paths, respectively. Completed file-change events named each checkout's own `probe.txt`. The fixture coordinator committed the observed edits in the disposable Git repository.

An independent tester (ID ending `d281cf12`) reported the first A commit and observed exit 1 on the byte comparison. The follow-up omitted the random correction value from its prompt. Worker A recovered it, printed its original checkout and edited the same relative path there. A fresh tester (ID ending `7783be84`) ran the byte comparison at the corrected commit and observed exit 0. The final reviewer (ID ending `c9f2e585`) inspected that commit and the diff against the base and reported `PASS`.

**Capacity:** the harness dispatched the read-only capacity reviewer (ID ending `dd482478`) after both workers emitted `turn.started` and before either emitted a completion event. The reviewer reported the integration checkout clean. All three completed. For this configuration, allocate two editing slots and reserve one independent verification slot. On smaller pools, queue verification until a worker yields its slot, then resume a worker after the check.

**Approval behavior:** nested CLI startup under the desktop shell sandbox failed before a turn began. Both worker processes recorded a read-only diagnostic database and `failed to initialize in-process app-server client: Operation not permitted (os error 1)`. Approval for the outer CLI/fixture process let the existing local ChatGPT session start. Worker commands still ran under `workspace-write`, and verification commands under `read-only`. The live isolation and correction run needed no approval from inside a worker turn.

**Git submission:** a separate CLI worker in `$TMPDIR/codex-worker-isolation-mybmrz/a` edited `probe.txt` successfully. Its `git add -- probe.txt` exited 128 when the sandbox prevented creation of `integration/.git/worktrees/a/index.lock`. The fixture coordinator independently confirmed an unstaged change, an empty staged diff, and the original HEAD `e25d37ea63f3b1af05df12d309719c9af4f89691`. The successful isolation run had the coordinator stage and commit each submission from the assigned checkout after the worker yielded.

The final automated fixture repeated the full run in `$TMPDIR/codex-worker-isolation-OB5wo9` and exited 0. It asserted the completed file-change target for each edit and the tester's command, expected value and exit code. From base `b30d310a0c200aa61222455fca2e997c9e7346e4` it captured A at `699d4c7074f7bbad133a973d0daf61058dfebb19`, B at `c8089f3ac6499376695a00f5fce08a3508f0a85d`, and corrected A at `0176f83905cd3933d49c53eb3b5c1f5f56f8d1a0`. A's initial and resumed session IDs both ended `c83873c9`.
