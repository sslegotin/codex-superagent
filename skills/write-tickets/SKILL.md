---
name: write-tickets
description: Plan a batch of Superagent tickets, write requirements and acceptance checks, or mark specific tickets ready after user approval.
---

Interview the user about observable behavior, existing data and the definition of done. Inspect the project's commands and conventions. Split work into independently verifiable features. Use the templates alongside this skill and allocate the next unused three-digit ticket number under `specs/tickets/NNN-slug/`.

Write requirements in `rd.md` and reproducible checks in `eval.md`. Give each requirement an ID and map it to one or more numbered `### E-1: description` headings. Include exact setup, actions, expected outcomes, edge cases, affected paths and exclusions. For concurrent workers, specify distinct ports, data directories and accounts. Distinguish user decisions from authoring assumptions.

Use `specs/tickets/BOARD.md` as the batch index. Copy the board template on first use. List only true prerequisites as `waits for NNN: reason`. List shared paths as `overlaps NNN: paths`. Separate multiple entries with a semicolon and space. Use team mode for tightly coupled concurrent work with one integration owner. Give the batch a lowercase kebab-case name.

Keep tickets draft until explicit approval. On approval mark the board rows and the corresponding requirements ready, then commit just those ticket inputs on the target base branch using project Git conventions. Leave existing staged work intact. Tell the user the batch name and approved commit. Starting work requires a separate router session and an explicit run request.
