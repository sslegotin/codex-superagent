'use strict';
const { snapshot } = require('./jobs.cjs');
function board(cwd, name, now = Date.now()) {
  const s = snapshot(cwd, name);
  return s.tickets.map((t) => {
    const j = s.jobs[t.id],
      wait = t.waits.filter((id) => s.tickets.some((x) => x.id === id) && s.jobs[id]?.status !== 'done');
    const idle = j ? Math.max(0, Math.floor((now - Date.parse(j.updated)) / 60000)) : 0;
    const role = j?.active?.role || '';
    const alerts = ['done', 'excluded'].includes(j?.status)
      ? []
      : (s.alerts || [])
          .filter((a) => a.id === t.id && !['quiet', 'running-long'].includes(a.kind))
          .map((a) => a.kind + ': ' + a.detail);
    if (role && idle >= 10) alerts.push('quiet ' + idle + 'm');
    if (role && now - Date.parse(j.active.started) > 60 * 60000) alerts.push('running over 1h');
    if (['interrupted', 'regression', 'changes'].includes(j?.status))
      alerts.push(j.lastError || j.findings || j.status);
    return {
      id: t.id,
      title: t.title,
      mode: t.mode,
      status: j?.status || (wait.length ? 'waiting' : 'ready'),
      wait,
      role,
      attempt: j?.attempt || 0,
      turns: s.events.filter((e) => e.id === t.id && e.session && e.status).length,
      alerts
    };
  });
}
function render(rows) {
  return [
    'Ticket  Status       Agent       Turns  Title',
    ...rows.map((r) =>
      [
        r.id.padEnd(7),
        r.status.padEnd(12),
        r.role.padEnd(11),
        String(r.turns).padEnd(6),
        r.title,
        r.wait.length ? ' (waits for ' + r.wait.join(', ') + ')' : '',
        r.alerts.length ? ' — ' + r.alerts.join(', ') : ''
      ].join('')
    )
  ].join('\n');
}
function metrics(cwd, name) {
  const run = snapshot(cwd, name);
  const roles = {};
  for (const event of run.events) {
    if (!Number.isFinite(event.durationMs)) continue;
    const totals = (roles[event.role] ||= { turns: 0, activeMs: 0 });
    totals.turns++;
    totals.activeMs += event.durationMs;
  }
  return {
    batch: name,
    roles,
    landings: run.events.filter((e) => e.role === 'merge').length,
    waivers: run.events.filter((e) => e.role === 'waiver').length
  };
}
module.exports = { board, render, metrics };
