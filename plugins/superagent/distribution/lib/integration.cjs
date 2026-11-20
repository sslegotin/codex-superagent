'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { execFileSync } = require('node:child_process');
const { git, revision, clean } = require('./git.cjs');
const { parseBoard } = require('./batch.cjs');

function branchRef(cwd, name) {
  if (!name || git(cwd, 'check-ref-format', '--branch', name).trim() !== name) throw Error('Invalid branch');
  return 'refs/heads/' + name;
}

function assertCheckout(cwd, ref) {
  if (git(cwd, 'symbolic-ref', 'HEAD').trim() !== ref) throw Error('Wrong checkout for ' + ref);
  clean(cwd);
  for (const operation of [
    'MERGE_HEAD',
    'CHERRY_PICK_HEAD',
    'REVERT_HEAD',
    'rebase-apply',
    'rebase-merge',
    'sequencer'
  ]) {
    const marker = git(cwd, 'rev-parse', '--path-format=absolute', '--git-path', operation).trim();
    if (fs.existsSync(marker)) throw Error('Git operation in progress: ' + operation);
  }
}

// A ref transaction compares the previous owner when taking over a crashed
// process's lock. The nonce also guards release against a different invocation.
function withLock(cwd, run) {
  const ref = 'refs/superagent-locks/integration';
  const old = git(cwd, 'for-each-ref', '--format=%(objectname)', ref).trim();
  if (old) {
    const owner = JSON.parse(git(cwd, 'cat-file', 'blob', old));
    let alive = true;
    if (owner.host === os.hostname()) {
      try {
        process.kill(owner.pid, 0);
      } catch (error) {
        if (error.code === 'ESRCH') alive = false;
      }
    }
    if (alive) throw Error('Integration is busy, lock owned by ' + owner.host + ' PID ' + owner.pid);
  }
  const input = JSON.stringify({ host: os.hostname(), pid: process.pid, nonce: randomUUID() });
  const lock = execFileSync('git', ['hash-object', '-w', '--stdin'], { cwd, input, encoding: 'utf8' }).trim();
  git(cwd, 'update-ref', ref, lock, old || '0'.repeat(lock.length));
  try {
    return run();
  } finally {
    git(cwd, 'update-ref', '-d', ref, lock);
  }
}

function ticketId(folder) {
  const match = /^specs\/tickets\/(\d{3})-[a-z0-9]+(?:-[a-z0-9]+)*$/.exec(folder);
  if (!match) throw Error('Invalid ticket folder');
  return match[1];
}

// Require the reviewed SHA as the second parent, so a similar worker-authored
// message or an ordinary merge of the worker cannot masquerade as a landing.
function landingHistory(cwd, batchBranch, folder) {
  ticketId(folder);
  const ref = branchRef(cwd, batchBranch);
  const format =
    '%H%x00%P%x00%(trailers:key=Superagent-Ticket,valueonly,separator=%x2c)%x00%(trailers:key=Superagent-Reviewed,valueonly,separator=%x2c)';
  const history = git(cwd, 'log', '--first-parent', '--merges', '--format=' + format, ref);
  const matches = [];
  for (const line of history.split('\n')) {
    const [commit, parents, ticket, reviewed] = line.split('\0');
    if (ticket === folder && parents.split(' ')[1] === reviewed) matches.push({ commit, reviewed });
  }
  return matches;
}

function findLanding(cwd, batchBranch, expected, folder) {
  return (
    landingHistory(cwd, batchBranch, folder).find((entry) => entry.reviewed === expected)?.commit || null
  );
}

function markDone(cwd, folder, priorLanding) {
  const id = ticketId(folder);
  const boardPath = 'specs/tickets/BOARD.md';
  const rdPath = folder + '/rd.md';
  for (const file of [boardPath, rdPath]) {
    if (!/^100(?:644|755) /.test(git(cwd, 'ls-files', '--stage', '--', file)))
      throw Error('Expected regular tracked file: ' + file);
  }
  const board = fs.readFileSync(path.join(cwd, boardPath), 'utf8');
  if (git(cwd, 'diff', '--cached', '--name-only', 'HEAD', '--', boardPath, rdPath))
    throw Error('Worker changed board or ticket control files');
  if (priorLanding) {
    const rd = fs.readFileSync(path.join(cwd, rdPath), 'utf8');
    if (parseBoard(board).get(id)?.status !== 'done' || !/^\*\*Status:\*\*[ \t]+done[ \t]*\r?$/m.test(rd))
      throw Error('Missing previous completion for ' + id);
    return;
  }
  if (parseBoard(board).get(id)?.status !== 'ready') throw Error('Expected a ready board row for ' + id);
  const row = new RegExp(
    '^(\\s*\\|\\s*' + id + '\\s*\\|(?:\\\\\\||[^|\\r\\n])*\\|[ \\t]*)ready(?=[ \\t]*\\|)',
    'gm'
  );
  if ([...board.matchAll(row)].length !== 1) throw Error('Ambiguous board row for ' + id);
  const rd = fs.readFileSync(path.join(cwd, rdPath), 'utf8');
  const status = /^(\*\*Status:\*\*[ \t]+)ready(?=[ \t]*\r?$)/gm;
  if ([...rd.matchAll(status)].length !== 1) throw Error('Expected ready status in ' + rdPath);
  fs.writeFileSync(path.join(cwd, boardPath), board.replace(row, '$1done'));
  fs.writeFileSync(path.join(cwd, rdPath), rd.replace(status, '$1done'));
  git(cwd, 'add', '--', boardPath, rdPath);
}

function checkTip(cwd, ref, expected) {
  if (revision(cwd, ref) !== expected) throw Error('Reviewed ticket tip moved: ' + ref);
}

function createCandidate(cwd, start, expected, folder, priorLanding, checks, decisions) {
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'superagent-merge-'));
  const candidate = path.join(scratch, 'candidate');
  try {
    git(cwd, 'worktree', 'add', '--detach', candidate, start);
    try {
      git(candidate, 'merge', '--no-ff', '--no-commit', '--no-edit', expected);
    } catch (error) {
      const conflicts = git(candidate, 'diff', '--name-only', '--diff-filter=U').trim();
      if (conflicts) throw Error('Merge conflict in:\n' + conflicts, { cause: error });
      throw error;
    }
    markDone(candidate, folder, priorLanding);
    if (decisions.length) {
      const file = folder + '/waivers.json';
      if (fs.lstatSync(path.join(candidate, file), { throwIfNoEntry: false })?.isSymbolicLink())
        throw Error('Invalid waiver file');
      fs.writeFileSync(
        path.join(candidate, file),
        JSON.stringify(
          decisions.map(({ check, reason, revision }) => ({ check, reason, revision })),
          null,
          2
        ) + '\n'
      );
      git(candidate, 'add', '--', file);
    }
    git(
      candidate,
      'commit',
      '-m',
      'Land ' + folder.split('/').pop(),
      '-m',
      'Superagent-Ticket: ' + folder + '\nSuperagent-Reviewed: ' + expected
    );
    const merged = revision(candidate, 'HEAD');
    for (const argv of checks) {
      if (!Array.isArray(argv) || !argv.length || argv.some((arg) => typeof arg !== 'string'))
        throw Error('Invalid integration check arguments');
      try {
        execFileSync(argv[0], argv.slice(1), {
          cwd: candidate,
          stdio: ['ignore', 'pipe', 'pipe'],
          maxBuffer: 32 * 1024 * 1024
        });
      } catch (error) {
        throw Error(
          'Integration check failed: ' +
            JSON.stringify(argv) +
            '\n' +
            [error.stdout, error.stderr].filter(Boolean).join(''),
          { cause: error }
        );
      }
    }
    return merged;
  } finally {
    if (fs.existsSync(path.join(candidate, '.git'))) git(cwd, 'worktree', 'remove', '--force', candidate);
    fs.rmSync(scratch, { recursive: true, force: true });
  }
}

function integrate({
  cwd,
  batchBranch,
  ticketBranch,
  expected,
  expectedBatch,
  folder,
  decisions = [],
  checks = []
}) {
  const batch = branchRef(cwd, batchBranch);
  const ticket = branchRef(cwd, ticketBranch);
  return withLock(cwd, () => {
    assertCheckout(cwd, batch);
    const history = landingHistory(cwd, batchBranch, folder);
    const landed = history.find((entry) => entry.reviewed === expected);
    if (landed) return landed.commit;
    checkTip(cwd, ticket, expected);
    if (
      history.length &&
      git(cwd, 'merge-base', history[0].reviewed, expected).trim() !== history[0].reviewed
    ) {
      throw Error('A follow-up must include the previously landed ticket tip');
    }
    const start = revision(cwd, batch);
    if (expectedBatch && start !== expectedBatch) throw Error('Unexpected batch revision before integration');
    if (git(cwd, 'merge-base', start, expected).trim() === expected)
      throw Error('Ticket already in batch without a landing receipt');
    const merged = createCandidate(cwd, start, expected, folder, history[0], checks, decisions);
    checkTip(cwd, ticket, expected);
    assertCheckout(cwd, batch);
    if (revision(cwd, batch) !== start) throw Error('Batch advanced while the candidate was checked');
    git(cwd, 'merge', '--ff-only', '--no-autostash', '--no-overwrite-ignore', merged);
    return merged;
  });
}

function compareUrl(remoteUrl, base, batch) {
  let host, project;
  const scp = /^(?:[^/@:]+@)?([\w.-]+):([^/].*)$/.exec(remoteUrl);
  if (scp) [, host, project] = scp;
  else {
    try {
      const parsed = new URL(remoteUrl);
      host = parsed.hostname;
      project = parsed.pathname.slice(1);
    } catch {
      return null;
    }
  }
  if (/^(?:github(?:\.com)?[-_][\w-]+|[\w-]+[-_]github(?:\.com)?|github)$/i.test(host)) host = 'github.com';
  if (!/^github\./i.test(host) || !/^[\w.-]+\/[\w.-]+$/.test(project)) return null;
  const encode = (ref) => ref.split('/').map(encodeURIComponent).join('/');
  return (
    'https://' +
    host +
    '/' +
    project.replace(/\.git$/, '') +
    '/compare/' +
    encode(base) +
    '...' +
    encode(batch) +
    '?expand=1'
  );
}

function deliver({ cwd, baseBranch, batchBranch, expectedBatch, how, remote = 'origin' }) {
  const base = branchRef(cwd, baseBranch);
  const batch = branchRef(cwd, batchBranch);
  if (base === batch) throw Error('Base and batch branches must differ');
  return withLock(cwd, () => {
    assertCheckout(cwd, base);
    const commit = revision(cwd, batch);
    if (expectedBatch && commit !== expectedBatch) throw Error('Unexpected batch revision before delivery');
    if (git(cwd, 'merge-base', base, commit).trim() !== revision(cwd, base))
      throw Error('Base advanced; integrate and recheck before delivery');
    if (how === 'local') {
      git(cwd, 'merge', '--ff-only', '--no-autostash', '--no-overwrite-ignore', commit);
      return { commit, compareUrl: null };
    }
    if (how !== 'pr') throw Error('Choose local or pr delivery');
    if (!git(cwd, 'remote').split('\n').includes(remote)) throw Error('Unknown Git remote: ' + remote);
    const urls = git(cwd, 'config', '--get-regexp', '^remote\\..*\\.(pushurl|url)$').trim().split('\n');
    const configured = (key) =>
      urls
        .find((line) => line.startsWith('remote.' + remote + '.' + key + ' '))
        ?.split(' ')
        .slice(1)
        .join(' ');
    const url = configured('pushurl') || configured('url');
    git(cwd, 'push', '--no-follow-tags', '--', remote, commit + ':' + batch);
    return { commit, compareUrl: compareUrl(url, baseBranch, batchBranch) };
  });
}

module.exports = { integrate, findLanding, deliver };
