'use strict';

const { execFileSync } = require('node:child_process');
const { randomBytes } = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'codex-worker-isolation-')));
const integration = path.join(root, 'integration');
function git(cwd, ...args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}
fs.mkdirSync(integration);
git(integration, 'init', '-b', 'batch');
// Fixture-only identity and unsigned commits keep the experiment portable.
git(integration, 'config', 'user.name', 'Isolation fixture');
git(integration, 'config', 'user.email', 'fixture@example.invalid');
git(integration, 'config', 'commit.gpgsign', 'false');
fs.writeFileSync(path.join(integration, 'probe.txt'), 'baseline\n');
git(integration, 'add', 'probe.txt');
git(integration, 'commit', '-m', 'Fixture baseline');
const base = git(integration, 'rev-parse', 'HEAD');
for (const worker of ['a', 'b']) {
  git(integration, 'worktree', 'add', '-b', 'worker-' + worker, path.join(root, worker), base);
}
fs.writeFileSync(
  path.join(root, 'fixture.json'),
  JSON.stringify({
    base,
    correction: 'corrected-' + randomBytes(8).toString('hex')
  }) + '\n',
  { mode: 0o600 }
);
console.log(root);
