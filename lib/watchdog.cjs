'use strict';
const fs = require('node:fs'),
  path = require('node:path');
const { git, clean, revision } = require('./git.cjs');
const { snapshot, transaction, finished } = require('./jobs.cjs');
const { runSession } = require('./session.cjs');

function forbidden(cwd, job, base) {
  const rd = git(cwd, 'show', base + ':' + job.folder + '/rd.md');
  const section = /^## Do not touch[ \t]*\r?\n([\s\S]*?)(?=^## |(?![\s\S]))/im.exec(rd);
  if (!section) return [];
  const globs = [...section[1].matchAll(/^\s*[-*]\s+`([^`]+)`/gm)].map((m) => m[1]);
  if (!globs.length) return [];
  const args = globs.map((p) => ':(top,glob)' + p);
  const touched =
    git(cwd, 'diff', '--name-only', '-z', job.start, '--', ...args) +
    git(cwd, 'ls-files', '--others', '--exclude-standard', '-z', '--', ...args);
  return [...new Set(touched.split('\0').filter(Boolean))];
}
function round(cwd, name, now = Date.now()) {
  return transaction(cwd, name, (s) => {
    const previous = new Set((s.alerts || []).map((a) => a.id + '/' + a.kind)),
      alerts = [];
    function add(id, kind, detail) {
      alerts.push({ id, kind, detail, repeat: previous.has(id + '/' + kind) });
    }
    for (const j of Object.values(s.jobs)) {
      if (finished(j)) continue;
      if (j.active) {
        if (now - Date.parse(j.updated) >= 600000) add(j.id, 'quiet', 'No new agent event for ten minutes');
        if (now - Date.parse(j.active.started) >= 3600000)
          add(j.id, 'running-long', 'Turn has run for at least an hour');
      }
      if (j.status === 'interrupted' || j.status === 'blocked')
        add(j.id, j.status, j.lastError || j.findings);
      try {
        const paths = forbidden(j.worktree, j, s.base);
        if (paths.length) add(j.id, 'off-track', paths.join(', '));
      } catch (e) {
        add(j.id, 'inspection-error', e.message);
      }
    }
    s.alerts = alerts;
    s.lastRound = new Date(now).toISOString();
    return alerts;
  });
}
async function investigate(cwd, name) {
  const s = snapshot(cwd, name);
  if (!s.alerts?.length) return 'No active alerts';
  const role = fs.readFileSync(path.join(__dirname, '..', 'roles', 'watchdog.md'), 'utf8');
  const result = await runSession({
    cwd: s.root,
    readOnly: true,
    prompt: role + '\n' + JSON.stringify({ alerts: s.alerts, jobs: s.jobs }),
    onSession: () => {},
    onSpawn: () => {},
    onActivity: () => {}
  });
  return result.final;
}
function replace(cwd, name, id, reason) {
  if (!reason?.trim()) throw Error('Give the reason for replacing this worker');
  return transaction(cwd, name, (s) => {
    const j = s.jobs[id];
    if (!j || j.active || !['blocked', 'changes', 'interrupted', 'prepared'].includes(j.status))
      throw Error('Cannot replace an active or integrated worker');
    clean(j.worktree);
    s.events.push({
      id,
      role: 'replacement',
      session: j.sessions.worker,
      attempt: j.attempt,
      revision: revision(j.worktree, 'HEAD'),
      reason,
      at: new Date().toISOString()
    });
    j.sessions = {};
    j.attempt++;
    j.status = 'prepared';
    j.findings = reason;
    j.updated = new Date().toISOString();
    return j;
  });
}
module.exports = { round, replace, investigate };
