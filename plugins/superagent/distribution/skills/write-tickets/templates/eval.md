# NNN: <Title>: Evaluation

## Setup
1. <Install command, e.g. `npm install`>
2. <Any data or state the checks need, with exact commands>
3. Start this ticket's server: <exact command with the ticket's own port, e.g. `npm run dev -- -p 31NN`>
4. <Create the ticket's test account `tNNN` / prepare test data, with exact values. Expected: …>

## Automated checks
<!-- When a command's output is piped (`… | tee out.txt`), check the command's own exit code (`set -o pipefail`), not the pipe's. -->
- `<lint command>` exits 0
- `<build command>` exits 0
- `<test command>` exits 0

## Acceptance checks

### E-1: <What it proves> (covers FR-1, FR-2)
- **Type**: CLI | browser | API | test
- **Steps**:
  1. <literal action, e.g. open `http://localhost:31NN/signup`, fill Email `tNNN@test.local`, click **Create account**>
  2. …
- **Expected**: <literal, checkable result for each step, e.g. "(1) prints `2`, (2) the editor opens">
- **Reset** (only if this check depends on or changes data other checks use): <the step that restores the state it needs, e.g. delete the test database and re-run Setup step 2>

## Edge case checks

### E-n: <Unusual case> (covers FR-x)
- **Type**: …
- **Steps**: …
- **Expected**: …

## Traceability
| Requirement | Checks |
|---|---|
| FR-1 | E-1 |
| NFR-1 | E-1 |

## Definition of done
- [ ] All automated checks pass
- [ ] All acceptance checks E-1…E-n pass
- [ ] All edge case checks pass
- [ ] Nothing listed under "Out of scope" was built
