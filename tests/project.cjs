const { fixture, write, commit } = require('./helpers.cjs');
function project(t, modes = ['solo', 'solo', 'solo']) {
  const cwd = fixture(t);
  const ids = modes.map((_, i) => String(i + 1).padStart(3, '0'));
  write(
    cwd,
    '.superagent/project.json',
    JSON.stringify({ checks: [['git', 'diff', '--check']], maxWorkers: 2 })
  );
  write(
    cwd,
    'specs/tickets/BOARD.md',
    [
      '| # | Title | Status | Mode | Runs | Batch |',
      '|---|---|---|---|---|---|',
      ...ids.map(
        (id, i) =>
          `| ${id} | Feature | ready | ${modes[i]} | ${i === 2 ? 'waits for 001: data' : 'alongside'} | demo |`
      )
    ].join('\n')
  );
  for (const id of ids) {
    write(cwd, `specs/tickets/${id}-test/rd.md`, '# Feature\n\n**Status:** ready\n');
    write(cwd, `specs/tickets/${id}-test/eval.md`, '### E-1: Behavior\n');
  }
  const base = commit(cwd, 'approved inputs');
  return { cwd, base };
}
module.exports = { project };
