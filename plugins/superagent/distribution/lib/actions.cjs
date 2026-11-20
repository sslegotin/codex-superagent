'use strict';
const { transaction, finished } = require('./jobs.cjs');
const { verify } = require('./verify-results.cjs');
const { git, revision, clean } = require('./git.cjs');
const { integrate, deliver } = require('./integration.cjs');

function waive(cwd, name, id, check, reason) {
  if (!reason?.trim()) throw Error('Record the user decision');
  return transaction(cwd, name, (s) => {
    const j = s.jobs[id];
    if (!j?.submitted || j.active || j.status !== 'changes')
      throw Error('No reviewed submission waiting for a decision');
    if (revision(j.worktree, 'HEAD') !== j.submitted) throw Error('Submission has changed');
    const args = {
      cwd: j.worktree,
      base: s.base,
      rev: j.submitted,
      folder: j.folder,
      previousLanding: j.landed,
      waivers: j.waivers
    };
    if (verify(args).checks[check]?.outcome !== 'NOT RUN') throw Error('Only a NOT RUN check can be waived');
    if (!j.waivers.includes(check)) j.waivers.push(check);
    s.events.push({ id, check, reason, role: 'waiver', revision: j.submitted, at: new Date().toISOString() });
    const report = verify(args);
    j.status = report.ok ? 'approved' : 'changes';
    j.findings = report.issues.join('\n');
    return report;
  });
}
function merge(cwd, name, id) {
  const { s, j } = transaction(cwd, name, (s) => {
    const j = s.jobs[id];
    if (j?.status !== 'approved' || j.active) throw Error('No approved submission');
    if (
      Object.values(s.jobs).some(
        (o) =>
          o.id !== id &&
          (o.status === 'merging' ||
            (o.mode === 'team' && !finished(o) && !['landed', 'regression', 'approved'].includes(o.status)))
      )
    )
      throw Error('Integration checkout leased');
    const report = verify({
      cwd: j.worktree,
      base: s.base,
      rev: j.submitted,
      folder: j.folder,
      previousLanding: j.landed,
      waivers: j.waivers
    });
    if (!report.ok) throw Error(report.issues.join('\n'));
    j.status = 'merging';
    j.mergePid = process.pid;
    return { s, j };
  });
  let landed;
  try {
    landed = integrate({
      cwd: s.integration,
      batchBranch: s.branch,
      expectedBatch: s.accepted || s.base,
      ticketBranch: j.branch,
      expected: j.submitted,
      folder: j.folder,
      decisions: s.events.filter((e) => e.role === 'waiver' && e.id === id && e.revision === j.submitted),
      checks: s.config.checks
    });
  } catch (e) {
    transaction(cwd, name, (s) => {
      const job = s.jobs[id];
      job.status = 'changes';
      job.findings = e.message;
    });
    throw e;
  }
  return transaction(cwd, name, (s) => {
    const j = s.jobs[id];
    j.landed = landed;
    s.accepted = landed;
    j.status = 'landed';
    j.updated = new Date().toISOString();
    s.events.push({ id, role: 'merge', revision: landed, at: j.updated });
    return landed;
  });
}
function delivery(cwd, name, how, remote = 'origin') {
  return transaction(cwd, name, (s) => {
    if (s.delivery) return s.delivery;
    if (!s.tickets.every((t) => finished(s.jobs[t.id]))) throw Error('Unfinished tickets remain');
    const receipt = deliver({
      cwd: s.root,
      baseBranch: s.baseBranch,
      batchBranch: s.branch,
      expectedBatch: s.accepted || s.base,
      how,
      remote
    });
    s.delivery = { how, ...receipt };
    return s.delivery;
  });
}
function exclude(cwd, name, id, reason) {
  if (!reason?.trim()) throw Error('State the exclusion reason');
  return transaction(cwd, name, (s) => {
    const t = s.tickets.find((t) => t.id === id),
      j = s.jobs[id];
    if (!t || j?.active || j?.landed || ['merging', 'landed', 'regression', 'done'].includes(j?.status))
      throw Error('Cannot exclude this ticket');
    s.jobs[id] = { ...t, ...j, status: 'excluded', reason, updated: new Date().toISOString() };
    return s.jobs[id];
  });
}
function returnTicket(cwd, name, id, reason) {
  if (!reason?.trim()) throw Error('Provide concrete findings');
  return transaction(cwd, name, (s) => {
    const j = s.jobs[id];
    if (!j || j.active || !['approved', 'tested', 'built'].includes(j.status))
      throw Error('Ticket is not awaiting verification');
    j.findings = reason;
    j.waivers = [];
    delete j.submitted;
    j.status = 'changes';
    return j;
  });
}
function sync(cwd, name, id) {
  return transaction(cwd, name, (s) => {
    const j = s.jobs[id];
    if (!j || j.active || !['prepared', 'changes', 'built'].includes(j.status))
      throw Error('Ticket is not ready to synchronize');
    const dir = j.worktree;
    clean(dir);
    if (git(dir, 'branch', '--show-current').trim() !== j.branch) throw Error('Wrong checkout');
    const incoming = revision(dir, s.branch);
    try {
      git(dir, 'merge', '--no-edit', '--no-autostash', incoming);
      j.status = 'prepared';
    } catch (e) {
      const files = git(dir, 'diff', '--name-only', '--diff-filter=U', '-z').split('\0').filter(Boolean);
      if (!files.length) throw e;
      j.conflicts = { incoming, files };
      j.status = 'conflict';
    }
    j.waivers = [];
    delete j.submitted;
    return j;
  });
}
module.exports = { merge, waive, delivery, exclude, returnTicket, sync };
