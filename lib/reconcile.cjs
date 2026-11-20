'use strict';
const fs = require('node:fs'),
  os = require('node:os'),
  path = require('node:path');
const { layout, transaction } = require('./jobs.cjs');
const { git, revision, clean } = require('./git.cjs');

function alive(pid) {
  if (!Number.isSafeInteger(pid) || pid < 1) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return e.code !== 'ESRCH';
  }
}
function unlock(cwd, name) {
  const { dir } = layout(cwd, name),
    lock = path.join(dir, 'write.lock'),
    guard = path.join(dir, 'reclaim.lock');
  const fd = fs.openSync(guard, 'wx');
  try {
    const owner = JSON.parse(fs.readFileSync(lock, 'utf8'));
    if (owner.host !== os.hostname() || alive(owner.pid)) throw Error('Lock owner may still be active');
    fs.unlinkSync(lock);
  } finally {
    fs.closeSync(fd);
    fs.unlinkSync(guard);
  }
}
function reconcile(cwd, name) {
  return transaction(cwd, name, (s) => {
    if (!s.base) throw Error('No run for ' + name);
    for (const j of Object.values(s.jobs)) {
      if (j.active && j.active.host === os.hostname() && !alive(j.active.pid) && !alive(j.active.child)) {
        j.previousStatus = j.status;
        j.failedRole = j.active.role;
        j.status = 'interrupted';
        j.lastError = 'Session supervisor stopped; inspect checkout and session before retry';
        delete j.active;
      }
      if (j.status === 'merging') {
        const landed = require('./integration.cjs').findLanding(
          s.integration,
          s.branch,
          j.submitted,
          j.folder
        );
        if (landed) {
          j.landed = landed;
          s.accepted = landed;
          j.status = 'landed';
          j.updated = new Date().toISOString();
          if (!s.events.some((e) => e.role === 'merge' && e.revision === landed))
            s.events.push({ id: j.id, role: 'merge', revision: landed, at: j.updated, recovered: true });
        } else if (!j.mergePid || !alive(j.mergePid)) j.status = 'approved';
      }
    }
    return s;
  });
}
function retry(cwd, name, id, reason) {
  if (!reason?.trim()) throw Error('State the inspected recovery reason');
  return transaction(cwd, name, (s) => {
    const j = s.jobs?.[id];
    if (!j || j.active || !['interrupted', 'blocked', 'changes'].includes(j.status))
      throw Error('Ticket cannot be retried');
    clean(j.worktree);
    if (git(j.worktree, 'branch', '--show-current').trim() !== j.branch) throw Error('Wrong checkout');
    const role = j.failedRole;
    const previous = j.previousStatus;
    s.events.push({
      id,
      role: 'retry',
      attempt: j.attempt,
      session: j.sessions.worker,
      revision: revision(j.worktree, 'HEAD'),
      at: new Date().toISOString(),
      reason
    });
    j.attempt++;
    j.status = role === 'checker' ? 'landed' : role === 'reproducer' ? 'regression' : 'prepared';
    if (role === 'tester' && revision(j.worktree, 'HEAD') === j.built) j.status = 'built';
    if (role === 'reviewer' && revision(j.worktree, 'HEAD') === j.tested) j.status = 'tested';
    if (previous === 'regression') j.status = 'regression';
    j.findings = reason;
    delete j.failedRole;
    delete j.previousStatus;
    return j;
  });
}
module.exports = { alive, unlock, reconcile, retry };
