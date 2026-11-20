const test = require('node:test'),
  assert = require('node:assert/strict'),
  os = require('node:os');
const { project } = require('./project.cjs');
const { start, prepare, transaction } = require('../plugins/superagent/distribution/lib/jobs.cjs');
const { round, replace } = require('../plugins/superagent/distribution/lib/watchdog.cjs');
const { write, commit } = require('./helpers.cjs');
test('quiet and forbidden edits produce persistent, repeated alerts without changing work', (t) => {
  const { cwd } = project(t, ['solo']);
  write(
    cwd,
    'specs/tickets/001-test/rd.md',
    '# Feature\n\n**Status:** ready\n\n## Do not touch\n- `reserved/*`\n'
  );
  commit(cwd, 'restrict ticket');
  start(cwd, 'demo');
  const job = prepare(cwd, 'demo', '001');
  write(job.worktree, 'reserved/changed', 'pending');
  transaction(cwd, 'demo', (s) => {
    const j = s.jobs['001'];
    j.updated = new Date(0).toISOString();
    j.active = { role: 'worker', started: j.updated, pid: process.pid, host: os.hostname() };
  });
  const first = round(cwd, 'demo');
  assert.ok(first.some((a) => a.kind === 'off-track' && !a.repeat));
  assert.ok(first.some((a) => a.kind === 'quiet'));
  const second = round(cwd, 'demo');
  assert.ok(second.every((a) => a.repeat));
  assert.throws(() => replace(cwd, 'demo', '001', 'Repeated alert'), /active/i);
});
