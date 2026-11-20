#!/usr/bin/env node
'use strict';
const { snapshot, start, prepare, layout } = require('../lib/jobs.cjs');
const { act } = require('../lib/agent.cjs');
const { board, render, metrics } = require('../lib/board.cjs');
const { merge, waive, exclude, delivery, returnTicket, sync } = require('../lib/actions.cjs');
const { reconcile, retry, unlock } = require('../lib/reconcile.cjs');
const { round, investigate, replace } = require('../lib/watchdog.cjs');
const fs = require('node:fs');

const help = `superagent commands (run from the installed project)
  run BATCH                            open or resume an explicitly requested batch
  status BATCH                         inspect the durable journal
  metrics BATCH                        show measured role durations and landing counts
  board BATCH [--watch]                show progress, active roles and alerts
  watchdog BATCH [--investigate]        detect repeated alerts or investigate them read-only
  replace BATCH ID REASON               allocate a fresh worker session on an inspected branch
  prepare BATCH ID                     allocate a ready ticket's worktree
  agent BATCH ID ROLE [MESSAGE]        worker, tester, reviewer, checker or reproducer
  return BATCH ID REASON               send an approved submission back with findings
  sync BATCH ID                        synchronize an isolated ticket branch with the batch
  waive BATCH ID E-N REASON            record a user's waiver for a NOT RUN check
  merge BATCH ID                       integrate the verified revision and run project checks
  recover BATCH                        reconcile an interrupted run with Git and running processes
  retry BATCH ID REASON                resume an inspected, clean interrupted checkout
  exclude BATCH ID REASON              leave an unmerged ticket out of delivery
  unlock BATCH                         release a confirmed abandoned journal lock
  deliver BATCH local|pr [REMOTE]      execute the user's delivery choice`;
async function main([command, name, id, role, ...rest]) {
  const cwd = process.cwd();
  if (!command || ['help', '--help', '-h'].includes(command)) return help;
  if (!name) throw Error(help);
  if (command === 'run') return start(cwd, name);
  if (command === 'unlock') {
    unlock(cwd, name);
    return 'Unlocked';
  }
  if (!fs.existsSync(layout(cwd, name).file)) throw Error('No run for ' + name);
  switch (command) {
    case 'status':
      return snapshot(cwd, name);
    case 'metrics':
      return metrics(cwd, name);
    case 'board':
      if (id === '--watch') {
        const draw = () =>
          process.stdout.write(
            (process.stdout.isTTY ? '\x1b[2J\x1b[H' : '') + render(board(cwd, name)) + '\n'
          );
        draw();
        setInterval(draw, 3000);
        return;
      }
      return render(board(cwd, name));
    case 'watchdog':
      return id === '--investigate' ? investigate(cwd, name) : round(cwd, name);
    case 'replace':
      return replace(cwd, name, id, [role, ...rest].filter(Boolean).join(' '));
    case 'prepare':
      return prepare(cwd, name, id);
    case 'agent':
      return act(cwd, name, id, role, rest.join(' '));
    case 'waive':
      return waive(cwd, name, id, role, rest.join(' '));
    case 'return':
      return returnTicket(cwd, name, id, [role, ...rest].filter(Boolean).join(' '));
    case 'sync':
      return sync(cwd, name, id);
    case 'merge':
      return merge(cwd, name, id);
    case 'recover':
      return reconcile(cwd, name);
    case 'retry':
      return retry(cwd, name, id, [role, ...rest].filter(Boolean).join(' '));
    case 'exclude':
      return exclude(cwd, name, id, [role, ...rest].filter(Boolean).join(' '));
    case 'deliver':
      return delivery(cwd, name, id, role || 'origin');
    default:
      throw Error(help);
  }
}
function runCli() {
  return main(process.argv.slice(2))
    .then((result) => {
      if (result !== undefined)
        console.log(typeof result === 'string' ? result : JSON.stringify(result, null, 2));
    })
    .catch((e) => {
      console.error(e.message);
      process.exitCode = 1;
    });
}
if (require.main === module) runCli();
module.exports = { main, runCli };
