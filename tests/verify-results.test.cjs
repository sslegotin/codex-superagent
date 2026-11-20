const test = require('node:test'),
  assert = require('node:assert/strict');
const { fixture, write, commit } = require('./helpers.cjs');
const { verify } = require('../plugins/superagent/distribution/lib/verify-results.cjs');
const folder = 'specs/tickets/001-test';
for (const [label, line, verdict, waivers, expected] of [
  ['pass', 'PASS | evidence/check.txt', 'APPROVE', [], true],
  ['fail', 'FAIL | evidence/check.txt', 'APPROVE', [], false],
  ['uncited', 'PASS | ok', 'APPROVE', [], false],
  ['missing', 'PASS | evidence/gone', 'APPROVE', [], false],
  ['empty', 'PASS | evidence/empty', 'APPROVE', [], false],
  ['waiver claimed in report', 'NOT RUN | user chose to merge', 'APPROVE', [], false],
  ['waiver from router', 'NOT RUN | unavailable', 'APPROVE', ['E-1'], true],
  ['review rejected', 'PASS | evidence/check.txt', 'CHANGES NEEDED', [], false],
  ['ambiguous verdict', 'PASS | evidence/check.txt', 'CHANGES NEEDED then APPROVE', [], false],
  ['duplicate', 'PASS | evidence/check.txt\nE-1 | FAIL | evidence/check.txt', 'APPROVE', [], false],
  ['path escape', 'PASS | evidence/../rd.md', 'APPROVE', [], false],
  ['changed eval', 'PASS | evidence/check.txt', 'APPROVE', [], false]
])
  test(label, (t) => {
    const cwd = fixture(t);
    write(cwd, folder + '/rd.md', 'requirements');
    write(cwd, folder + '/eval.md', '### E-1: check\n');
    const base = commit(cwd, 'inputs');
    if (label === 'changed eval') write(cwd, folder + '/eval.md', '### E-1: changed\n');
    write(cwd, folder + '/results.md', 'E-1 | ' + line + '\n\n## Reviewer\n' + verdict + '\n');
    write(cwd, folder + '/evidence/check.txt', 'observed');
    write(cwd, folder + '/evidence/empty', '');
    const rev = commit(cwd, 'results');
    assert.equal(verify({ cwd, base, rev, folder, waivers }).ok, expected);
  });
