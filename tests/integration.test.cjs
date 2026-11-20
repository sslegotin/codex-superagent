'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const { fixture, write, git, commit } = require('./helpers.cjs');

const integrationPath = path.resolve(__dirname, '../plugins/superagent/distribution/lib/integration.cjs');
const integrate = (options) => require(integrationPath).integrate(options);
const deliver = (options) => require(integrationPath).deliver(options);
const folders = ['specs/tickets/001-start', 'specs/tickets/002-finish'];
const board = 'specs/tickets/BOARD.md';
const batchBranch = 'batch/run';

function prepare(t) {
  const cwd = fixture(t);
  write(
    cwd,
    board,
    '| # | Title | Status | Mode | Runs | Batch |\n|---|---|---|---|---|---|\n| 001 | First | ready | solo | alongside | run |\n| 002 | Second | ready | solo | alongside | run |\n'
  );
  for (const folder of folders) write(cwd, folder + '/rd.md', '**Status:** ready\n');
  const base = commit(cwd, 'Approved tickets');
  const submissions = folders.map((folder, index) => {
    const ticketBranch = 'tickets/' + index;
    git(cwd, 'switch', '-c', ticketBranch, base);
    write(cwd, 'output-' + index, 'worker ' + index);
    const expected = commit(cwd, 'Ticket ' + index);
    return { cwd, batchBranch, ticketBranch, expected, folder, checks: [] };
  });
  git(cwd, 'switch', '-c', batchBranch, base);
  return { cwd, base, submissions };
}

test('two reviewed tickets land separately with ready-to-done changes; a replay finds the original landing', (t) => {
  const {
    cwd,
    base,
    submissions: [one, two]
  } = prepare(t);
  const first = integrate(one);
  const second = integrate(two);
  assert.equal(git(cwd, 'rev-parse', first + '^2'), one.expected);
  assert.equal(git(cwd, 'rev-parse', second + '^1'), first);
  assert.equal(git(cwd, 'rev-parse', second + '^2'), two.expected);
  assert.match(git(cwd, 'show', first + ':' + board), /001 \| First \| done/);
  assert.match(git(cwd, 'show', first + ':' + board), /002 \| Second \| ready/);
  assert.equal(git(cwd, 'show', second + ':' + two.folder + '/rd.md'), '**Status:** done');
  assert.equal(integrate({ ...one, checks: [['nonexistent-check']] }), first);
  assert.equal(git(cwd, 'rev-parse', 'HEAD'), second);
  assert.equal(git(cwd, 'rev-parse', 'main'), base);
  assert.equal(git(cwd, 'status', '--porcelain'), '');
});

test('a moved ticket tip and unrelated staged changes are rejected without altering them', (t) => {
  const {
    cwd,
    base,
    submissions: [one, two]
  } = prepare(t);
  write(cwd, 'personal', 'working changes');
  git(cwd, 'add', 'personal');
  assert.throws(() => integrate(one), /pending|dirty/i);
  assert.equal(git(cwd, 'show', ':personal'), 'working changes');
  git(cwd, 'restore', '--staged', 'personal');
  fs.unlinkSync(path.join(cwd, 'personal'));
  git(cwd, 'branch', '-f', one.ticketBranch, two.expected);
  assert.throws(() => integrate(one), /stale|moved|reviewed/i);
  assert.equal(git(cwd, 'rev-parse', 'HEAD'), base);
});

test('a conflict and a failed check leave the batch and its checkout untouched', (t) => {
  const {
    cwd,
    submissions: [one, two]
  } = prepare(t);
  write(cwd, 'output-0', 'divergent');
  const before = commit(cwd, 'Batch change');
  assert.throws(() => integrate(one), /output-0/);
  assert.equal(git(cwd, 'rev-parse', 'HEAD'), before);
  assert.equal(git(cwd, 'status', '--porcelain'), '');
  const checks = [
    [process.execPath, '-e', "require('node:fs').writeFileSync('test-output','oops');process.exit(3)"]
  ];
  assert.throws(() => integrate({ ...two, checks }), /check|command/i);
  assert.equal(git(cwd, 'status', '--porcelain'), '');
  assert.equal(git(cwd, 'rev-parse', 'HEAD'), before);
});

test('simultaneous callers cannot run checks on two candidates concurrently', (t) => {
  const {
    cwd,
    submissions: [one, two]
  } = prepare(t);
  // Invoke the competing process inside the first merger's integration check,
  // while the first process still owns the lock.
  const contender = [
    "const assert = require('node:assert/strict');",
    "const { integrate } = require(process.argv[1]);",
    "assert.throws(() => integrate(JSON.parse(process.argv[2])), /busy|lock|owned/i);"
  ].join('\n');
  one.checks = [[process.execPath, '-e', contender, integrationPath, JSON.stringify(two)]];
  assert.equal(integrate(one), git(cwd, 'rev-parse', 'HEAD'));
  assert.equal(integrate(two), git(cwd, 'rev-parse', 'HEAD'));
});

test('local delivery fast-forwards a clean base and refuses a diverged base', (t) => {
  const {
    cwd,
    base,
    submissions: [one]
  } = prepare(t);
  const landed = integrate(one);
  git(cwd, 'switch', 'main');
  const args = { cwd, baseBranch: 'main', batchBranch, how: 'local' };
  assert.equal(deliver(args).commit, landed);
  git(cwd, 'switch', '-c', 'other', base);
  write(cwd, 'separate', 'advanced');
  const advanced = commit(cwd, 'Base advance');
  assert.throws(() => deliver({ ...args, baseBranch: 'other' }), /diverg|advance|fast.forward/i);
  assert.equal(git(cwd, 'rev-parse', 'HEAD'), advanced);
});

test('PR delivery pushes only the batch to a bare remote and supplies the browser link', (t) => {
  const {
    cwd,
    base,
    submissions: [one]
  } = prepare(t);
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'superagent-bare-'));
  t.after(() => fs.rmSync(repo, { recursive: true, force: true }));
  git(repo, 'init', '--bare');
  const web = 'https://github.com/sample-org/sample-project';
  const remoteUrl = 'git@github-personal:sample-org/sample-project.git';
  git(cwd, 'remote', 'add', 'publish', remoteUrl);
  git(cwd, 'config', 'url.' + repo + '.insteadOf', remoteUrl);
  const landed = integrate(one);
  git(cwd, 'switch', 'main');
  git(cwd, 'tag', '-a', 'local-only', base, '-m', 'An unrelated tag');
  git(cwd, 'config', 'push.followTags', 'true');
  const result = deliver({ cwd, baseBranch: 'main', batchBranch, how: 'pr', remote: 'publish' });
  assert.equal(result.commit, landed);
  assert.equal(result.compareUrl, web + '/compare/main...batch/run?expand=1');
  assert.equal(git(repo, 'rev-parse', 'refs/heads/batch/run'), landed);
  assert.equal(git(cwd, 'rev-parse', 'HEAD'), base);
  assert.equal(git(repo, 'for-each-ref', '--format=%(refname)'), 'refs/heads/batch/run');
});

test('a checker fix descends from the last ticket tip and keeps its existing done statuses', (t) => {
  const {
    cwd,
    submissions: [one]
  } = prepare(t);
  const first = integrate(one);
  git(cwd, 'switch', one.ticketBranch);
  write(cwd, 'output-0', 'fixed');
  const expected = commit(cwd, 'Fix checker finding');
  git(cwd, 'switch', one.batchBranch);
  const corrected = integrate({ ...one, expected });
  assert.equal(git(cwd, 'rev-parse', corrected + '^1'), first);
  assert.equal(git(cwd, 'rev-parse', corrected + '^2'), expected);
  assert.equal(git(cwd, 'show', 'HEAD:output-0'), 'fixed');
  assert.match(git(cwd, 'show', 'HEAD:' + board), /001 \| First \| done/);
  assert.equal(integrate({ ...one, expected }), corrected);
});

test('refuses a delivery that would overwrite an ignored local file', (t) => {
  const {
    cwd,
    submissions: [one]
  } = prepare(t);
  integrate(one);
  git(cwd, 'switch', 'main');
  git(cwd, 'config', 'core.excludesfile', path.join(cwd, '.git', 'info', 'exclude'));
  fs.appendFileSync(path.join(cwd, '.git', 'info', 'exclude'), '\noutput-0\n');
  write(cwd, 'output-0', 'private file');
  assert.throws(
    () => deliver({ cwd, baseBranch: 'main', batchBranch, how: 'local' }),
    /overwrite|untracked|abort/i
  );
  assert.equal(fs.readFileSync(path.join(cwd, 'output-0'), 'utf8'), 'private file');
});

test('worker edits to the board cannot mark an unrelated ticket done', (t) => {
  const {
    cwd,
    base,
    submissions: [one]
  } = prepare(t);
  git(cwd, 'switch', one.ticketBranch);
  write(
    cwd,
    board,
    fs.readFileSync(path.join(cwd, board), 'utf8').replace('Second | ready', 'Second | done')
  );
  const expected = commit(cwd, 'Premature completion');
  git(cwd, 'switch', batchBranch);
  assert.throws(() => integrate({ ...one, expected }), /board|control/i);
  assert.equal(git(cwd, 'rev-parse', 'HEAD'), base);
});

test('recovers an interrupted post-merge acknowledgement without duplicating the merge or keeping a candidate checkout', async (t) => {
  const {
    cwd,
    submissions: [one]
  } = prepare(t);
  const hooks = path.join(cwd, '.git', 'integration-test-hooks');
  git(cwd, 'config', 'core.hooksPath', hooks);
  write(
    cwd,
    '.git/integration-test-hooks/post-merge',
    '#!/bin/sh\nif test -n "$TEST_MERGER_PID" && test "$(git symbolic-ref -q HEAD)" = refs/heads/batch/run; then kill -KILL "$TEST_MERGER_PID"; fi\n'
  );
  fs.chmodSync(path.join(hooks, 'post-merge'), 0o755);
  const script =
    'process.env.TEST_MERGER_PID=String(process.pid);require(process.argv[1]).integrate(JSON.parse(process.argv[2]))';
  const child = spawn(process.execPath, ['-e', script, integrationPath, JSON.stringify(one)], {
    stdio: 'ignore'
  });
  const [, signal] = await once(child, 'close');
  assert.equal(signal, 'SIGKILL');
  const landed = git(cwd, 'rev-parse', 'HEAD');
  assert.equal(git(cwd, 'rev-parse', landed + '^2'), one.expected);
  assert.equal(integrate(one), landed);
  const trees = git(cwd, 'worktree', 'list', '--porcelain')
    .split('\n')
    .filter((line) => line.startsWith('worktree '));
  t.after(() => {
    for (const line of trees.slice(1)) {
      const candidate = line.slice('worktree '.length);
      if (
        path.basename(candidate) === 'candidate' &&
        path.basename(path.dirname(candidate)).startsWith('superagent-merge-')
      )
        fs.rmSync(path.dirname(candidate), { recursive: true, force: true });
    }
  });
  assert.equal(trees.length, 1);
});
