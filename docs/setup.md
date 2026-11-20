# Installing Codex Superagent

Use a local checkout of this distribution, Node.js and Git. Pass the root of the target Git repository as the directory argument. The examples use a shell variable for the checkout containing this guide.

```sh
distribution=/path/to/codex-superagent
target=/path/to/your-project
node "$distribution/scripts/setup.cjs" discover "$target"
```

Discovery lists project files and potential check commands. Confirm the package manager and commands against the target's own instructions. For a fresh installation, create a settings file outside the target. This example describes a Node.js project that runs an HTTP service.

```json
{
  "checks": [["npm", "ci"], ["npm", "run", "test"], ["npm", "run", "lint"]],
  "maxWorkers": 2,
  "runInstructions": "Start the service with npm run dev from the worker worktree.",
  "portIsolation": "Set PORT=0 and read the assigned port from the server startup output.",
  "dataIsolation": "Set DATA_DIR to a fresh temporary directory for each worker."
}
```

Integration checks run in a fresh worktree. Include any dependency installation or build steps your project requires, in order. Each check is an executable followed by individual arguments. Include at least one check. Set the maximum number of simultaneous workers to a positive integer. Describe port and data isolation in terms of settings the project actually supports. For projects with no service or mutable data, record that in the applicable field.

```sh
node "$distribution/scripts/setup.cjs" install "$target" --config /path/to/settings.json
node "$distribution/scripts/setup.cjs" verify "$target"
(cd "$target" && node .superagent/scripts/superagent.cjs help)
```

The installer copies the approved settings to `.superagent/project.json`. Edit that file directly when project settings change. The runtime entry point is `.superagent/scripts/superagent.cjs`. Libraries, role prompts, license and attribution live under `.superagent/`. Repository skills and the ticket templates live under `.agents/skills/`. Stage the installed runtime, skills, manifest and project settings together when recording the installation in the target project's Git history.

## Upgrading

Run `install` and `verify` from the new distribution using the same target. Existing project settings take precedence over a supplied settings file. The installer uses `.superagent/manifest.json` to track which distributed and local contents it has seen. It updates pristine files automatically, preserves unrelated files and leaves retired files in place.

When local contents differ, the installer prints a Git diff for each affected path and exits with status 2 before applying the upgrade. Review the diff, edit or merge files by hand if needed, and rerun with one decision per affected path. Set `review_token` to the digest printed alongside the diffs. It binds the decision to those exact local and incoming versions. For example, the following command keeps the local router skill and replaces the tester prompt with the new distribution's version.

```sh
node "$distribution/scripts/setup.cjs" install "$target" \
  --review "$review_token" \
  --keep .agents/skills/router/SKILL.md \
  --replace .superagent/roles/tester.md
node "$distribution/scripts/setup.cjs" verify "$target"
```

On a fresh installation, include the original `--config` argument when resolving a collision. A replacement saves the previous contents in `.superagent/backups/` under their SHA-256 digest. A kept customization is recorded for future checks. The next upstream change to that file prompts for a new decision. Restoring a locally deleted required file uses `--replace`.

Verification reads every managed file, compares it with the release inventory or the accepted local version, and validates the project settings. It does not execute project checks. An interrupted installer can be rerun. If a setup lock remains, first check whether another setup command is running against the same target. Once it has exited, move the stale `.superagent/setup.lock` directory aside and retry.

## Tested installation

On macOS on 2026-11-20, a fresh Git repository with a `package.json` test script produced the candidate check `["npm", "run", "test"]`. Install, verify and a second install each verified 28 managed files. The installed runtime printed its command list with `help`. Before any run, `status unstarted` exited 1 with `No run for unstarted`.

With Codex CLI 0.166.0, the terminal app server's `skills/list` request against that checkout returned `router`, `setup` and `write-tickets` with repository scope, enabled status and zero loading errors. Each resolved to its own `.agents/skills/<name>/SKILL.md`. The same result was observed with fresh Codex settings and with the temporary project explicitly trusted. This local discovery check ran with IP networking disabled. Role prompts are packaged in `.superagent/roles/` for the runtime to load by path. Desktop discovery is untested.
