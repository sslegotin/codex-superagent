const test = require('node:test'),
  assert = require('node:assert/strict');
const fs = require('node:fs'),
  path = require('node:path');
const { project } = require('./project.cjs'),
  { git, write } = require('./helpers.cjs');
const { start, prepare, snapshot, transaction } = require('../plugins/superagent/distribution/lib/jobs.cjs');
const { act } = require('../plugins/superagent/distribution/lib/agent.cjs');
const { merge, delivery, waive, exclude, returnTicket, sync } = require('../plugins/superagent/distribution/lib/actions.cjs');
const { board } = require('../plugins/superagent/distribution/lib/board.cjs');
const { reconcile, retry } = require('../plugins/superagent/distribution/lib/reconcile.cjs');

function answer(id, edit, message) {
  return async (opts) => {
    opts.onSession(id);
    await edit?.(opts);
    return { id, final: message };
  };
}
const noop = () => {};
const worker = (text = 'fixed', previous) =>
  answer(
    'same-worker',
    (o) => {
      assert.equal(o.session, previous);
      write(o.cwd, 'feature.txt', text);
    },
    'Build complete'
  );
const tester = (outcome) =>
  answer(
    'tester',
    (o) => {
      const prefix = 'specs/tickets/001-test/evidence/';
      write(o.cwd, prefix + 'E-1.txt', 'observed ' + outcome);
      write(
        o.cwd,
        prefix + 'tester-report.md',
        'Tested-Revision: ' + git(o.cwd, 'rev-parse', 'HEAD') + '\nE-1 | ' + outcome + ' | evidence/E-1.txt\n'
      );
    },
    outcome
  );
const approve = answer('reviewer', noop, 'APPROVE');
test('full fix round, independent checks, restart and delivery', async (t) => {
  const { cwd, base } = project(t, ['solo', 'solo']);
  start(cwd, 'demo');
  prepare(cwd, 'demo', '001');
  prepare(cwd, 'demo', '002');
  const agent = (role, runner) => act(cwd, 'demo', '001', role, '', runner);
  await agent('worker', worker('broken'));
  await agent('tester', tester('FAIL'));
  assert.equal((await agent('reviewer', approve)).status, 'changes');
  assert.throws(() => merge(cwd, 'demo', '001'), /approved/);
  await agent('worker', worker('corrected', 'same-worker'));
  await agent('tester', tester('PASS'));
  await agent('reviewer', approve);
  const landing = merge(cwd, 'demo', '001');
  // Simulate a router that stopped after Git landed the ticket and before persisting the receipt.
  transaction(cwd, 'demo', (s) => {
    s.jobs['001'].status = 'merging';
    delete s.jobs['001'].landed;
    s.events = s.events.filter((e) => e.role !== 'merge');
  });
  assert.equal(reconcile(cwd, 'demo').jobs['001'].landed, landing);
  assert.equal(reconcile(cwd, 'demo').events.filter((e) => e.role === 'merge' && e.recovered).length, 1);
  await agent(
    'checker',
    answer(
      'checker',
      (o) => {
        assert.equal(git(o.cwd, 'rev-parse', 'HEAD'), landing);
        assert.equal(fs.readFileSync(path.join(o.cwd, 'feature.txt'), 'utf8'), 'corrected');
      },
      'PASS'
    )
  );
  exclude(cwd, 'demo', '002', 'User deferred this independent ticket');
  assert.equal(git(cwd, 'rev-parse', 'HEAD'), base);
  assert.equal(delivery(cwd, 'demo', 'local').commit, landing);
  assert.equal(git(cwd, 'rev-parse', 'HEAD'), landing);
});
test('user waiver applies to a specific reviewed NOT RUN check', async (t) => {
  const { cwd } = project(t, ['solo']);
  start(cwd, 'demo');
  prepare(cwd, 'demo', '001');
  for (const [role, run] of [
    ['worker', worker()],
    ['tester', tester('NOT RUN')],
    ['reviewer', approve]
  ])
    await act(cwd, 'demo', '001', role, '', run);
  assert.throws(() => waive(cwd, 'demo', '001', 'E-2', 'agreed'));
  assert.equal(waive(cwd, 'demo', '001', 'E-1', 'User accepted unavailable service').ok, true);
  returnTicket(cwd, 'demo', '001', 'Evidence mismatch');
  assert.equal(snapshot(cwd, 'demo').jobs['001'].status, 'changes');
});
test('interrupted worker can recover existing session without duplicate dispatch', async (t) => {
  const { cwd } = project(t, ['solo']);
  start(cwd, 'demo');
  prepare(cwd, 'demo', '001');
  await assert.rejects(
    act(cwd, 'demo', '001', 'worker', '', async (o) => {
      o.onSession('same-worker');
      throw Error('runtime unavailable');
    })
  );
  assert.match(board(cwd, 'demo')[0].alerts.join(' '), /unavailable/);
  assert.equal(retry(cwd, 'demo', '001', 'Inspected clean checkout').attempt, 2);
  await act(cwd, 'demo', '001', 'worker', '', worker('recovered', 'same-worker'));
  assert.equal(snapshot(cwd, 'demo').jobs['001'].status, 'built');
});

test('stale tester report from before the correction is rejected', async (t) => {
  const { cwd } = project(t, ['solo']);
  start(cwd, 'demo');
  prepare(cwd, 'demo', '001');
  const agent = (role, run) => act(cwd, 'demo', '001', role, '', run);
  await agent('worker', worker('first'));
  await agent('tester', tester('PASS'));
  await agent('reviewer', answer('review', noop, 'CHANGES NEEDED\nHandle empty input'));
  await agent('worker', worker('changed', 'same-worker'));
  await assert.rejects(agent('tester', answer('tester2', noop, 'PASS')), /current implementation/);
});
test('delivery rejects an unreviewed batch tip', (t) => {
  const { cwd } = project(t, ['solo']);
  const s = start(cwd, 'demo');
  exclude(cwd, 'demo', '001', 'Deferred');
  write(s.integration, 'extra', 'unexpected');
  require('./helpers.cjs').commit(s.integration, 'manual change');
  assert.throws(() => delivery(cwd, 'demo', 'local'), /Unexpected batch/);
});
test('regression is reproduced at the landing and an earlier landed ticket cannot be excluded', async (t) => {
  const { cwd } = project(t, ['solo']);
  start(cwd, 'demo');
  prepare(cwd, 'demo', '001');
  const agent = (role, run) => act(cwd, 'demo', '001', role, '', run);
  await agent('worker', worker());
  await agent('tester', tester('PASS'));
  await agent('reviewer', approve);
  const first = merge(cwd, 'demo', '001');
  await agent('checker', answer('checker', noop, 'Problem at integration'));
  await agent(
    'reproducer',
    answer(
      'reproducer',
      (o) => {
        assert.equal(git(o.cwd, 'rev-parse', 'HEAD'), first);
        write(o.cwd, 'feature.txt', 'regression fixed');
      },
      'Reproduced twice and fixed'
    )
  );
  assert.throws(() => exclude(cwd, 'demo', '001', 'defer broken ticket'));
  await agent('tester', tester('PASS'));
  assert.equal((await agent('reviewer', approve)).status, 'approved');
  assert.notEqual(merge(cwd, 'demo', '001'), first);
});

test('a waived check is traceable from the landed Git commit', async (t) => {
  const { cwd } = project(t, ['solo']);
  start(cwd, 'demo');
  prepare(cwd, 'demo', '001');
  const agent = (role, run) => act(cwd, 'demo', '001', role, '', run);
  await agent('worker', worker());
  await agent('tester', tester('NOT RUN'));
  await agent('reviewer', approve);
  const reviewed = snapshot(cwd, 'demo').jobs['001'].submitted;
  waive(cwd, 'demo', '001', 'E-1', 'User waived unavailable staging environment');
  const landed = merge(cwd, 'demo', '001');
  assert.deepEqual(JSON.parse(git(cwd, 'show', landed + ':specs/tickets/001-test/waivers.json')), [
    { check: 'E-1', reason: 'User waived unavailable staging environment', revision: reviewed }
  ]);
  const metrics = require('../plugins/superagent/distribution/lib/board.cjs').metrics(cwd, 'demo');
  assert.equal(metrics.roles.tester.turns, 1);
  assert.ok(metrics.roles.tester.activeMs >= 0);
  assert.equal(metrics.landings, 1);
  assert.equal(metrics.waivers, 1);
});
