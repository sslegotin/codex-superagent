# Live solo batch on 2026-11-20

The disposable `text-tools` project exercised the installed runtime with real `codex-cli 0.166.0` sessions using the existing ChatGPT login. The test project was `/private/tmp/superagent-live-solo-nJ6ZPIS6/target` on the test host. Its only project-wide check was `node scripts/smoke.cjs`. No dependencies, ports or shared databases were required.

## Install and Git handoff

1. The installer discovered the target's project instructions. `install` with fixture settings and `verify` both reported 28 verified managed files. The target used two worker slots.
2. This Codex desktop task drafted greeting ticket 001. A separate terminal writer read the write-tickets guide and created reverse ticket 002 and its board row. The terminal writer (session ID ending `9f0c8a6c`) exited with both tickets still draft and no implementation.
3. The fixture coordinator marked both solo tickets ready and committed the inputs at `31c1f1f9005ab042c1619b7a6223f9f537d270d1` on `main`. In a fresh terminal router session, the installed status command returned `No run for text-tools`, exit 1. Both tickets were ready, alongside, and no worktrees existed yet.
4. The same terminal router (ID ending `f56ee4a8`) received the explicit run request and successfully invoked the installed `run text-tools`, `prepare text-tools 001` and `prepare text-tools 002` commands. The coordinator drove the remaining role commands from the terminal. Outer process startup used scoped approval. Generated commands stayed under the role's normal sandbox.

## Concurrent execution

The journal recorded two active worker roles at 07:17 UTC in sibling checkouts `.superagent-worktrees/text-tools/001` and `002`. Their branches were `ticket/text-tools/001` and `ticket/text-tools/002`. Both workers started from the approved SHA. Each wrote its ticket ID to the same ignored relative path `.scratch/worker-id`. The integration checkout stayed clean at the approved SHA. Inspection of both commits confirmed the only source changes were the assigned CLI files.

| Ticket | Worker session suffix | Initial implementation |
| --- | --- | --- |
| 001 Greet a name | `716575cc` | `43ebbd68387e2a3207b5b3927fc4e21d0e03ab5f` |
| 002 Reverse an ASCII argument | `770deabd` | `9c8fada3efc0d989b21d6d01890f5d71a4c16339` |

## Failure and correction

The approved greeting ticket explicitly called for an incomplete first submission so the independent check would exercise the return path. The criteria in the approved commit already required ordinary and uppercase greetings. Independent tester `493fabf2` ran both commands and the smoke check. Its evidence commit `e3248f5e3dec2356334aefe4ee6204b8839357bf` contains this report:

```text
E-1 | PASS | evidence/E-1.txt
E-2 | FAIL | evidence/E-2.txt
Project smoke check | FAIL | evidence/smoke.txt
```

For E-2, `node bin/greet.cjs --loud Ada` exited 0 and printed `Hello, --loud!` instead of `HELLO, ADA!`. The smoke check exited 1. A premature merge attempt returned `No approved submission`, exit 1. The full failed report and literal output remain readable in the fixture history with `git show e3248f5:specs/tickets/001-greet/evidence/E-2.txt`.

The separate reverse tester `4af06183` recorded both passing cases at evidence commit `4adc93032a30eee23058cb25c192283bea570dc0`. The quoted input `ab c` produced bytes `63 20 62 61 0a`. The empty input produced `0a`.

Greeting reviewer `d6983977` independently reproduced the uppercase failure and returned `CHANGES NEEDED`. The router resumed worker `716575cc` with the finding. Its corrected implementation commit was `b965af20b9adcd4e8c59bbdc165a1c7aec0ebe55`. The original failure evidence remained in the ticket history.

## Integration and delivery

Reverse reviewer `84ff0385` returned `APPROVE`. The router landed the reviewed revision `8ff1201a03274cbb6d284906ec12b8d1cf47eca5` at `7a2ed777261c2d284243865b81ad3a2afa05329b` while the greeting fix was underway. Checker `60266c8f` exercised the reverse inputs, identity CLI and project smoke check in a new detached checkout, then returned `PASS`. The base branch still pointed to `31c1f1f`.

Fresh tester `fd143af5` re-ran both greeting cases and the smoke check. It captured the exact uppercase output bytes `48454c4c4f2c20414441210a` with exit 0 in evidence commit `4385d5c244f8191161ecdc918c770172a3b75c79`. Fresh reviewer `f093f740` returned `APPROVE`. The corrected greeting submission `968f950f16f81fe7d755ec3a99cb37f182ae29a1` became the second parent of landing `8ad31bffc1e96fecfbe5192160cc455f8415aeac`. The first parent was the reverse landing. Both approved evaluations remained byte-identical in the ticket submissions.

Final checker `accb9439` returned `PASS` in its own detached checkout at the second landing. The board reported both tickets done, with seven role turns for 001 and four for 002. There were no exclusions or waivers. Immediately before delivery, `main` still pointed to the original `31c1f1f`. The fixture's explicit local delivery choice advanced it to `8ad31bf` in one operation. The checkout was clean and `main` and `batch/text-tools` pointed to the same commit. Running the configured smoke check on delivered `main` exited 0:

```text
identity ["base"] PASS
greet ["Ada"] PASS
greet ["--loud","Ada"] PASS
reverse ["ab c"] PASS
reverse [""] PASS
```

To inspect the receipts on the test host, run `node .superagent/scripts/superagent.cjs status text-tools` from the disposable project. Each role's session and revision appear in its event journal. The historical failed evidence and corrected evidence can both be read from their Git commits. The [terminal fixture](../../tests/fixtures/isolation/README.md) separately reproduces concurrent writes, independent failure, and same-session correction in a fresh temporary repository.
