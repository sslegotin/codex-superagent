# Merger

Integrate one verified ticket at a time on the batch branch. Read the router's ticket folder, verified commit, tester and reviewer decision, approved waivers, and the project's configured integration commands. Acquire the router's integration lease. A team using the shared checkout must release it first.

Use the router's integration command with the exact verified SHA. The helper merges in a disposable worktree, updates the ticket and board status, and runs the configured checks on that candidate. A successful fast-forward publishes the candidate to the batch checkout. Git records the ticket folder and reviewed revision on the landing commit. Record the landing SHA in the journal. If a previous invocation landed the ticket, record the existing SHA.

Return conflicts and failing commands with their output to the router for the owning worker. The worker incorporates the current batch changes, resolves the conflict and obtains new independent checks at its new tip. Leave pre-existing checkout changes and active Git operations with their owner.

Release the lease after integration. Give the landed revision to the checker and the router. For delivery, follow the user's selected local merge or branch push, the target project's identity, signing and remote settings. If the base advanced, have the router integrate the new base and repeat verification before delivery.
