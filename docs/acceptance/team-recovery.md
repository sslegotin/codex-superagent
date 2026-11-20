# Mixed batch and router restart

The 2026-11-20 terminal acceptance run used a disposable Git repository named `superagent-mixed-live.M1gtua5f/project`, Node.js 25.9.0, Git 2.50.1, and Codex CLI 0.166.0. The installer copied and verified 28 managed files. The fixture committed the installed runtime, its configuration, the board, and the approved requirements and evaluations at `4cc34b31238b17e3cc3665ec46204973d52734f3` on `main`. The integration command was `node check.cjs`. The fixture required no server, ports, or mutable external data.

| Ticket | Mode | Accepted requirement | Worker session suffix | Implementation |
|---|---|---|---|---|
| 001 | team | Two separate CommonJS modules export the strings LEFT and RIGHT | e63515eb | 5dc03c6 |
| 002 | solo | A separate CommonJS module exports the string OK | 1103eb71 | 6e002e7 |

## Team handoff and restart

After an explicit `run mixed`, the operator prepared both tickets and started both worker commands in separate processes. Each used its assigned ticket worktree. The team owner wrote its contract before dispatching native subagents. Its Codex session recorded two completed `spawn_agent` calls at 07:16:35 and 07:16:39 UTC. The first delegated `left.cjs` to `/root/left` and the second delegated `right.cjs` to `/root/right`. The resulting contract names both files, both teammates, the common export interface, the integration owner and both returned paths.

A new command process reopened the batch with `run mixed` and executed `recover mixed` while both workers were active. A duplicate `agent mixed 001 worker` exited 1. A fresh read-only terminal Codex router (session suffix `914bb985`) then read the installed router skill and ran `status mixed`. It recovered the pinned base and both original session IDs from disk. The team worker was active and the solo worker had finished its build. The new router correctly reported that neither needed redispatch.

The solo tester and reviewer finished while the team ticket was still under verification. An attempted `merge mixed 002` exited 1 with `Integration checkout leased`. The integration checkout and base still pointed at the approved commit. All model roles used the installed runtime's workspace-write or read-only sandbox. The outer process had approval to start the local Codex session.

## Loss of the merge acknowledgement

Both independent reviewers returned `APPROVE`. To interrupt the real team merge, the fixture configured a local `post-merge` hook on the batch checkout. On its first landing the hook sent SIGKILL to the merger PID recorded in the journal. The command exited 137. No journal file was edited to simulate the crash.

| Ticket | Tester session suffix | Reviewer session suffix | Reviewed submission | Landing |
|---|---|---|---|---|
| 001 | 710973e7 | 1204ee82 | 67b96d9 | 0955153 |
| 002 | 685f78df | ea3230d0 | 6ba9f5e | aad735d |

Immediately afterward, `status mixed` reported `merging` for 001 with no landing SHA. Git already recorded the landing at `0955153d127bd797fb1e0affe8b26e1129309451`. A fresh `recover mixed` recovered that exact SHA and set the job to `landed`. A repeated `merge mixed 001` exited 1 with `No approved submission`. The ordinary solo merge reclaimed the stale integration lock and landed at `aad735dd0a762a1b85e30408bc1d3fe9bae9ef77`. The first-parent history contained exactly two landing commits, and each had its reviewed submission as its second parent.

## Checkout verification and local delivery

Independent checkers ran read-only in separate detached checkouts at the two landing SHAs. Sessions `f2b6e132` (001) and `776745ca` (002) each returned exactly `PASS`. The journal recorded two completed worker sessions and two checker sessions. Before delivery, `main` still pointed to `4cc34b3`. The fixture selected `deliver mixed local`, which advanced `main` to `aad735d`. Both tickets showed `done`. Git status was clean. Explicit Node assertions read all three delivered exports successfully, `node check.cjs` exited 0, and `git rev-list --first-parent --merges --count main` returned 2.

The run exposed an audit gap in the installed snapshot. Recovery restored ticket 001's landing in its job record, while the events array contained a merge event only for ticket 002. The replay check above used the Git history and each job's landing SHA.

The corrected recovery code was also run twice on a copy of the captured post-crash journal against the original Git history. Both calls returned the same accepted SHA and exactly one recovered merge event for 001.

## Fresh team run with enforced ownership and revision checks

A second installation verified 30 managed files. Its team worker (`a37e44b9`) produced `Integration owner: root` and three validated ownership rows for the two native teammates' modules and the owner's contract. Tester `c2653250` recorded `Tested-Revision: 2628109cfe8a91c8a1781d76f80d1aed8dc25c70`, which matched the built commit. Reviewer `be04ebab` returned `APPROVE`. The verifier accepted reviewed submission `11e035e6272b7b6fcaad5342b29724d185e84369` with E-1 PASS, cited evidence and zero issues. That SHA was the second parent of landing `42e2ccb3e05b9a040cb0675d65068f0c1cfed9c2`. Only the board and requirements status differed between those trees. Both modules exported their expected values in the clean landing checkout, and independent checker `6b0deef5` returned `PASS`.
