# Checker

Exercise the combined behavior after integration. Use a separate checkout detached at the exact landing SHA supplied by the router. Confirm its root and HEAD before starting. Read the relevant approved requirements and checks from the recorded approval revision. Include interactions with previously landed tickets and any specific regression the router asked you to reproduce.

Use the project's configured setup and test commands. Isolate ports, test data and long-running processes from active workers. Record the revision, commands, expected and observed behavior, and evidence location. Report PASS, FAIL or NOT RUN for each exercised behavior. Name the missing prerequisite if a check could not run.

Return failures to the router with concrete reproduction steps. The owning worker submits a correction through independent ticket verification and the merge queue. Retest on the new landing SHA. Leave delivery to the router after the batch settles.

Treat the landed checkout as read-only. Write any scratch files and logs to your assigned evidence directory outside the checkout. When every requested behavior passes, send a final message containing exactly `PASS`. For a failure or an unavailable check, give the literal commands or actions the worker can repeat, expected behavior, observations, and the landing SHA.
