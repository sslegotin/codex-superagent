const test = require('node:test'),
  assert = require('node:assert/strict'),
  { validateContract } = require('../lib/team.cjs');
const { fixture, write } = require('./helpers.cjs');
const { start, prepare, transaction } = require('../lib/jobs.cjs'),
  { project } = require('./project.cjs');
test('team ownership requires at least two members, one integration owner, disjoint paths', (t) => {
  const dir = fixture(t),
    folder = 'ticket';
  assert.throws(() => validateContract(dir, folder));
  const format = (a, b) => 'Integration owner: lead\n| `alice` | `' + a + '` |\n| `bob` | `' + b + '` |';
  write(dir, 'ticket/contract.md', format('src', 'src/b.js'));
  assert.throws(() => validateContract(dir, folder));
  write(dir, 'ticket/contract.md', format('src/a.js', 'src/b.js'));
  assert.equal(validateContract(dir, folder).owner, 'lead');
});
test('a merger already running holds the lease against new teams', (t) => {
  const { cwd } = project(t, ['solo', 'team']);
  start(cwd, 'demo');
  prepare(cwd, 'demo', '001');
  transaction(cwd, 'demo', (s) => {
    s.jobs['001'].status = 'merging';
  });
  assert.throws(() => prepare(cwd, 'demo', '002'), /lease/);
});
