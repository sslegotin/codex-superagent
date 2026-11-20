'use strict';
const fs = require('node:fs'),
  path = require('node:path'),
  os = require('node:os');
const { randomUUID } = require('node:crypto');
const { git, revision, clean } = require('./git.cjs');
const { selectBatch } = require('./batch.cjs');

function layout(cwd, name) {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name)) throw Error('Invalid batch name');
  const common = git(cwd, 'rev-parse', '--path-format=absolute', '--git-common-dir').trim();
  const dir = path.join(common, 'superagent', name);
  return { dir, file: path.join(dir, 'state.json'), common };
}
function snapshot(cwd, name) {
  return JSON.parse(fs.readFileSync(layout(cwd, name).file, 'utf8'));
}
function transaction(cwd, name, fn) {
  const { dir, file } = layout(cwd, name);
  fs.mkdirSync(dir, { recursive: true });
  const owner = path.join(dir, 'owner-' + randomUUID());
  const lock = path.join(dir, 'write.lock');
  fs.writeFileSync(owner, JSON.stringify({ pid: process.pid, host: os.hostname() }));
  try {
    const deadline = Date.now() + 15000;
    for (;;) {
      try {
        fs.linkSync(owner, lock);
        break;
      } catch (e) {
        if (e.code !== 'EEXIST') throw e;
        if (Date.now() >= deadline) throw Error('Batch state is locked: ' + lock);
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 40);
      }
    }
    try {
      const state = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {};
      const save = () => {
        const tmp = file + '.' + randomUUID();
        fs.writeFileSync(tmp, JSON.stringify(state, null, 2) + '\n');
        fs.renameSync(tmp, file);
      };
      const value = fn(state, save);
      save();
      return value;
    } finally {
      fs.unlinkSync(lock);
    }
  } finally {
    fs.unlinkSync(owner);
  }
}
function ensureTree(state, dir, branch, base) {
  if (!fs.existsSync(dir)) {
    const existing = git(state.root, 'branch', '--list', branch).trim();
    if (existing && revision(state.root, branch) !== base)
      throw Error('Existing branch has unexpected tip: ' + branch);
    git(state.root, 'worktree', 'add', ...(existing ? [] : ['-b', branch]), dir, existing ? branch : base);
  }
  if (
    git(dir, 'branch', '--show-current').trim() !== branch ||
    fs.realpathSync(git(dir, 'rev-parse', '--show-toplevel').trim()) !== fs.realpathSync(dir) ||
    fs.realpathSync(git(dir, 'rev-parse', '--path-format=absolute', '--git-common-dir').trim()) !==
      fs.realpathSync(state.common)
  )
    throw Error('Wrong checkout: ' + dir);
}
function start(cwd, name) {
  return transaction(cwd, name, (state, save) => {
    if (!state.base) {
      const root = git(cwd, 'rev-parse', '--show-toplevel').trim();
      clean(root);
      const baseBranch = git(root, 'branch', '--show-current').trim();
      if (!baseBranch) throw Error('Select a base branch');
      const base = revision(root, 'HEAD');
      const tickets = selectBatch(git(root, 'show', base + ':specs/tickets/BOARD.md'), name);
      const config = JSON.parse(git(root, 'show', base + ':.superagent/project.json'));
      if (
        !Number.isSafeInteger(config.maxWorkers) ||
        config.maxWorkers < 1 ||
        !Array.isArray(config.checks) ||
        !config.checks.length ||
        !config.checks.every(
          (a) =>
            Array.isArray(a) &&
            typeof a[0] === 'string' &&
            a[0].trim() &&
            a.every((s) => typeof s === 'string' && !s.includes('\0'))
        )
      )
        throw Error('Configure maxWorkers and project checks before starting');
      const dirs = git(root, 'ls-tree', '-d', '--name-only', base + ':specs/tickets')
        .trim()
        .split('\n');
      for (const t of tickets) {
        const found = dirs.filter((s) => s.startsWith(t.id + '-'));
        if (found.length !== 1 || !/^\d{3}-[a-z0-9-]+$/.test(found[0]))
          throw Error('Expected one ticket directory for ' + t.id);
        t.folder = 'specs/tickets/' + found[0];
        if (!/^\*\*Status:\*\* ready\s*$/m.test(git(root, 'show', base + ':' + t.folder + '/rd.md')))
          throw Error('Requirements must be ready: ' + t.id);
        if (!/^#{2,4} E-\d+\b/m.test(git(root, 'show', base + ':' + t.folder + '/eval.md')))
          throw Error('Missing numbered evaluation for ' + t.id);
      }
      const { common } = layout(root, name);
      const scratch = path.join(root, '.superagent-worktrees');
      if (
        git(root, 'ls-files', '--', '.superagent-worktrees').trim() ||
        (fs.existsSync(scratch) && !fs.lstatSync(scratch).isDirectory())
      )
        throw Error('Reserved worktree directory in use');
      const exclude = path.join(common, 'info', 'exclude');
      fs.mkdirSync(path.dirname(exclude), { recursive: true });
      if (!(
        fs.existsSync(exclude) &&
        fs.readFileSync(exclude, 'utf8').split('\n').includes('/.superagent-worktrees/')
      ))
        fs.appendFileSync(exclude, '\n/.superagent-worktrees/\n');
      const workRoot = path.join(scratch, name);
      if (fs.existsSync(workRoot) || git(root, 'branch', '--list', 'batch/' + name).trim())
        throw Error('Batch branch or directory already exists without a journal');
      Object.assign(state, {
        name,
        root,
        common,
        workRoot,
        base,
        baseBranch,
        branch: 'batch/' + name,
        integration: path.join(workRoot, 'integration'),
        config,
        tickets,
        jobs: {},
        events: []
      });
      save();
    }
    ensureTree(state, state.integration, state.branch, state.base);
    return state;
  });
}
const finished = (j) => j && ['done', 'excluded'].includes(j.status);
function prepare(cwd, name, id) {
  return transaction(cwd, name, (s, save) => {
    const t = s.tickets?.find((t) => t.id === id);
    if (!t || s.delivery) throw Error('Unknown ticket or batch already delivered');
    let job = s.jobs[id];
    if (!job) {
      for (const dep of t.waits)
        if (s.tickets.some((d) => d.id === dep) && s.jobs[dep]?.status !== 'done')
          throw Error('Waiting for ' + dep);
      const active = Object.values(s.jobs).filter((j) => !finished(j));
      if (t.mode === 'team' && active.some((j) => j.mode === 'team' || j.status === 'merging'))
        throw Error('A team or merger holds the integration lease');
      if (active.length >= s.config.maxWorkers) throw Error('Worker limit reached');
      const worktree = path.join(s.workRoot, id),
        branch = 'ticket/' + name + '/' + id;
      if (fs.existsSync(worktree) || git(s.root, 'branch', '--list', branch).trim())
        throw Error('Ticket worktree or branch already exists');
      job = s.jobs[id] = {
        ...t,
        branch,
        worktree,
        start: revision(s.root, s.branch),
        attempt: 1,
        status: 'prepared',
        sessions: {},
        waivers: [],
        updated: new Date().toISOString()
      };
      save();
    }
    if (!finished(job)) ensureTree(s, job.worktree, job.branch, job.start);
    return job;
  });
}
module.exports = { layout, snapshot, transaction, ensureTree, start, prepare, finished };
