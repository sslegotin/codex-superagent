---
name: setup
description: Set up, verify or upgrade the Superagent ticket-writing and router workflow in the user's current Git repository.
---

Use the absolute path of **this loaded SKILL.md** to locate the bundled installer. From its containing directory, the installer is `../../distribution/scripts/setup.cjs`. Resolve it there, independently of the target project and the shell's current directory. Run the installer with Node and pass the target worktree root from `git rev-parse --show-toplevel` as a separate argument.

1. Run `node "$installer" discover "$target"`. Read project instructions, build files and any existing `.superagent/project.json`. Confirm the actual install, build and test commands, worker limit, and how concurrent workers isolate ports and data.
2. For a fresh installation, write a temporary JSON file containing the approved settings. Use `checks` (an ordered list of executable-and-argument arrays for fresh integration worktrees), `maxWorkers` (a positive integer), and three strings: `runInstructions`, `portIsolation`, and `dataIsolation`. Record when the project needs no ports or external data. Run `node "$installer" install "$target" --config "$settings"`. On upgrade, reuse the target's project settings and omit the config flag.
3. If installation exits 2, show the diffs and ask for a decision on each locally modified file. Re-run with the printed `--review DIGEST` and the chosen `--keep PATH` or `--replace PATH` for every conflict. Preserve user files and decisions.
4. Run `node "$installer" verify "$target"` and, from the target, `node .superagent/scripts/superagent.cjs help`. Report the check settings and any local variants or backups. For a verification-only request, run these checks without installing. Use the target project's Git identity and delivery conventions when asked to commit. The project now exposes `$write-tickets` and `$router`. Running a batch requires a separate explicit request.
