const test = require('node:test'),
  assert = require('node:assert/strict'),
  fs = require('node:fs'),
  path = require('node:path');
const { fixture, git, write, commit } = require('./helpers.cjs');
const jobs = require('../lib/jobs.cjs');
const { project } = require('./project.cjs');
test('a run is explicit, pinned and resumable; worktrees isolate parallel writes', (t) => {
  const { cwd, base } = project(t);
  assert.throws(() => jobs.snapshot(cwd, 'demo'));
  const started = jobs.start(cwd, 'demo');
  assert.equal(started.base, base);
  assert.equal(jobs.start(cwd, 'demo').base, base);
  assert.throws(() => jobs.prepare(cwd, 'demo', '003'), /001/);
  const a = jobs.prepare(cwd, 'demo', '001'),
    b = jobs.prepare(cwd, 'demo', '002');
  assert.deepEqual(jobs.prepare(cwd, 'demo', '001'), a);
  assert.notEqual(a.worktree, b.worktree);
  for (const j of [a, b]) write(j.worktree, 'foo', j.id);
  assert.equal(fs.readFileSync(path.join(a.worktree, 'foo'), 'utf8'), '001');
  assert.equal(git(cwd, 'status', '--porcelain'), '');
  assert.equal(git(cwd, 'rev-parse', 'HEAD'), base);
});
test('rejects incomplete approved input before creating batch branch', (t) => {
  const { cwd } = project(t);
  fs.unlinkSync(path.join(cwd, 'specs/tickets/001-test/eval.md'));
  commit(cwd, 'incomplete');
  assert.throws(() => jobs.start(cwd, 'demo'), /eval/);
  assert.equal(git(cwd, 'branch', '--list', 'batch/demo'), '');
});
test('active team owns the integration lease and other teams queue', (t) => {
  const { cwd } = project(t, ['team', 'team', 'solo']);
  jobs.start(cwd, 'demo');
  jobs.prepare(cwd, 'demo', '001');
  assert.throws(() => jobs.prepare(cwd, 'demo', '002'), /team/i);
});
