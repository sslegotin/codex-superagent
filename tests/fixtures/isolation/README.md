# Terminal worker isolation experiment

Run these commands from the repository root with Git, Node and an authenticated Codex CLI. Each setup creates a private temporary repository, an integration checkout on `batch`, and two linked worktrees on branches `worker-a` and `worker-b`. The fixture never accepts a destination directory or deletes an existing checkout. Each live run uses the active account's Codex allowance.

## Native workers

```sh
fixture=$(node tests/fixtures/isolation/prepare.cjs)
codex exec -C "$fixture/integration" -s workspace-write --json - < tests/fixtures/isolation/native.txt
git -C "$fixture/integration" worktree list
for tree in integration a b; do
  git -C "$fixture/$tree" diff -- probe.txt
done
```

The native test intentionally allows both workers to edit their default checkout. A pass requires a clean integration checkout, `alpha` in `a/probe.txt`, and `bravo` in `b/probe.txt`. If all three match, test same-worker correction and reviewer capacity on that surface before selecting it.

## Separate CLI sessions

```sh
node tests/fixtures/isolation/run.cjs
```

The harness prints its private temporary root at startup. It starts both editing sessions concurrently and dispatches a read-only reviewer while both turns are active. It verifies the default shell directories, the worker file contents and the clean integration checkout. It captures submitted commits before launching independent checks. After the expected failed check it resumes worker A by the original session ID in A's worktree. The follow-up omits the expected value. A fresh tester and reviewer inspect the corrected commit. Any failed assertion or CLI error exits nonzero.

The directory printed on success contains private `*.invocation.json` files with exact argument vectors, working directories and stdin prompts, JSONL event streams, stderr, and all three Git checkouts. These records may include local filesystem paths and session IDs. The test uses three concurrent Codex processes at peak. Inspect the reported directory if a run fails.
