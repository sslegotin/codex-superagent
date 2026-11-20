'use strict';
const fs = require('node:fs'),
  path = require('node:path'),
  os = require('node:os');
const { randomUUID } = require('node:crypto');
const { transaction } = require('./jobs.cjs');
const { git, revision, clean } = require('./git.cjs');
const { verify } = require('./verify-results.cjs');
const { runSession } = require('./session.cjs');

const allowed = {
  worker: ['prepared', 'built', 'tested', 'changes', 'blocked', 'conflict'],
  tester: ['built', 'tested'],
  reviewer: ['tested'],
  checker: ['landed', 'regression'],
  reproducer: ['regression']
};
function capture(cwd, message, paths) {
  git(cwd, 'add', '-A', '--', ...paths);
  if (git(cwd, 'diff', '--cached', '--name-only').trim()) git(cwd, 'commit', '-m', message);
  clean(cwd);
  return revision(cwd, 'HEAD');
}
function changed(cwd, base) {
  return [
    git(cwd, 'diff', '--name-only', '-z', base),
    git(cwd, 'ls-files', '-z', '--others', '--exclude-standard')
  ]
    .join('\0')
    .split('\0')
    .filter(Boolean);
}
function promptFor(role, s, j, note) {
  const instructions = fs.readFileSync(
    path.join(__dirname, '..', 'roles', (role === 'worker' && j.mode === 'team' ? 'teammate' : role) + '.md'),
    'utf8'
  );
  return [
    instructions,
    'Ticket ' + j.folder + ' in batch ' + s.name + '. Approved inputs at ' + s.base + '.',
    'Read the project instructions in this checkout. Limit changes to your role and assigned paths.',
    'Worker start commit ' +
      (j.reviewBase || j.start) +
      '. Implementation ' +
      (j.built || 'pending') +
      '. Submitted revision ' +
      (j.submitted || 'pending') +
      '. Landed revision ' +
      (j.landed || 'pending') +
      '.',
    'Project run instructions and isolation settings: ' +
      JSON.stringify(s.config) +
      '. Ticket number ' +
      j.id +
      '.',
    j.conflicts
      ? 'Resolve the following merge conflicts in place, leaving staging and committing to the coordinator: ' +
        JSON.stringify(j.conflicts.files)
      : '',
    j.findings ? 'Previous findings: ' + j.findings : '',
    note || ''
  ]
    .filter(Boolean)
    .join('\n\n');
}
function record(cwd, name, id, token, fn) {
  return transaction(cwd, name, (s) => {
    const job = s.jobs[id];
    if (job.active?.token !== token) throw Error('This session no longer owns ticket ' + id);
    return fn(job, s);
  });
}
async function act(cwd, name, id, role, note = '', runner = runSession) {
  if (!Object.hasOwn(allowed, role)) throw Error('Unknown role ' + role);
  const token = randomUUID();
  const { s, j, dir, entry } = transaction(cwd, name, (s) => {
    const j = s.jobs?.[id];
    if (!j || !allowed[role].includes(j.status) || j.active || s.delivery)
      throw Error('Cannot start ' + role + ' for ' + id + ' in ' + (j?.status || 'unprepared') + ' state');
    if (role === 'reproducer' && Object.values(s.jobs).some((other) => other.active?.role === 'reproducer'))
      throw Error('A reproducer is already running');
    let dir = j.worktree;
    if (role === 'checker') {
      dir = path.join(s.workRoot, 'checker-' + j.id + '-' + j.landed.slice(0, 12));
      if (!fs.existsSync(dir)) git(s.root, 'worktree', 'add', '--detach', dir, j.landed);
      if (revision(dir, 'HEAD') !== j.landed) throw Error('Wrong checker revision');
    } else if (git(dir, 'branch', '--show-current').trim() !== j.branch) throw Error('Wrong ticket branch');
    if (j.status === 'conflict') {
      if (revision(dir, 'MERGE_HEAD') !== j.conflicts.incoming) throw Error('Conflict state changed');
    } else clean(dir);
    if (role === 'reproducer' && revision(dir, 'HEAD') !== j.landed) {
      git(dir, 'merge', '--ff-only', '--no-overwrite-ignore', j.landed);
      j.reviewBase = j.landed;
    }
    const entry = revision(dir, 'HEAD');
    if (role === 'tester' && entry !== j.built && entry !== j.tested)
      throw Error('Worker revision changed before test');
    if (role === 'reviewer' && entry !== j.tested) throw Error('Tested revision changed before review');
    j.active = { role, token, host: os.hostname(), pid: process.pid, started: new Date().toISOString() };
    j.updated = j.active.started;
    return { s, j, dir, entry };
  });
  const resumed = role === 'worker' ? j.sessions.worker : undefined;
  let lastActivity = 0;
  try {
    const result = await runner({
      cwd: dir,
      prompt: promptFor(role, s, j, note),
      session: resumed,
      readOnly: ['reviewer', 'checker'].includes(role),
      onSpawn: (pid) =>
        record(cwd, name, id, token, (job) => {
          job.active.child = pid;
        }),
      onSession: (sid) =>
        record(cwd, name, id, token, (job) => {
          job.active.session = sid;
          job.sessions[role] = sid;
        }),
      onActivity: () => {
        if (Date.now() - lastActivity > 15000) {
          lastActivity = Date.now();
          record(cwd, name, id, token, (job) => {
            job.updated = new Date().toISOString();
          });
        }
      }
    });
    return record(cwd, name, id, token, (job, state) => {
      if (revision(dir, 'HEAD') !== entry)
        throw Error('Role moved HEAD; inspect its checkout before recovery');
      if (role === 'worker' || role === 'reproducer') {
        const paths = changed(dir, entry);
        if (
          !job.conflicts &&
          paths.some(
            (file) =>
              file.startsWith('specs/tickets/') &&
              !(job.mode === 'team' && file === job.folder + '/contract.md')
          )
        )
          throw Error('Builder changed ticket inputs or evidence');
        if (role === 'worker' && /^BLOCKED\b/i.test(result.final.trim())) {
          job.status = 'blocked';
          job.findings = result.final;
        } else if (role === 'reproducer' && !paths.length) {
          job.status = 'regression';
          job.findings = result.final;
        } else {
          if (job.conflicts) {
            for (const file of job.conflicts.files) {
              const target = path.join(dir, file);
              if (fs.existsSync(target) && /^<<<<<<< |^>>>>>>> /m.test(fs.readFileSync(target, 'utf8')))
                throw Error('Unresolved conflict in ' + file);
            }
            git(dir, 'add', '-A', '--', '.');
            git(dir, 'commit', '--no-edit');
            delete job.conflicts;
          }
          if (job.mode === 'team' && role === 'worker') {
            const contract = require('./team.cjs').validateContract(dir, job.folder);
            const unowned = changed(dir, entry).filter(
              (f) =>
                f !== job.folder + '/contract.md' &&
                !contract.paths.some((p) => f === p || f.startsWith(p + '/'))
            );
            if (unowned.length) throw Error('Team changed unowned files: ' + unowned.join(', '));
          }
          job.built = capture(dir, 'Build ' + job.folder.split('/').pop(), ['.']);
          job.status = 'built';
          job.waivers = [];
          delete job.submitted;
          delete job.tested;
        }
      } else if (role === 'tester') {
        const evidence = job.folder + '/evidence/';
        if (changed(dir, entry).some((p) => !p.startsWith(evidence)))
          throw Error('Tester changed files outside its evidence directory');
        const report = path.join(dir, evidence, 'tester-report.md');
        if (!fs.lstatSync(report).isFile() || !fs.readFileSync(report, 'utf8').trim())
          throw Error('Missing tester report');
        const anchors = [
          ...fs.readFileSync(report, 'utf8').matchAll(/^Tested-Revision: ([0-9a-f]{40,64})[ \t]*\r?$/gm)
        ];
        if (anchors.length !== 1 || anchors[0][1] !== job.built)
          throw Error('Tester report must name the current implementation in Tested-Revision');
        job.tested = capture(dir, 'Test ' + id, [evidence]);
        job.status = 'tested';
      } else if (role === 'reviewer') {
        const last = result.final.trim();
        if (last !== 'APPROVE') {
          job.status = 'changes';
          job.findings = last;
        } else {
          clean(dir);
          const report = git(dir, 'show', entry + ':' + job.folder + '/evidence/tester-report.md');
          const file = job.folder + '/results.md';
          const target = path.join(dir, file);
          if (fs.existsSync(target) && !fs.lstatSync(target).isFile()) throw Error('Invalid results path');
          fs.writeFileSync(target, report.trimEnd() + '\n\n## Reviewer\nAPPROVE\n');
          job.submitted = capture(dir, 'Record review of ' + id, [file]);
          const checked = verify({
            cwd: dir,
            base: state.base,
            rev: job.submitted,
            folder: job.folder,
            previousLanding: job.landed,
            waivers: job.waivers
          });
          job.status = checked.ok ? 'approved' : 'changes';
          job.findings = checked.issues.join('\n');
        }
      } else {
        clean(dir);
        job.status = result.final.trim() === 'PASS' ? 'done' : 'regression';
        job.findings = result.final;
      }
      state.events.push({
        id,
        role,
        session: result.id,
        started: job.active.started,
        durationMs: Math.max(0, Date.now() - Date.parse(job.active.started)),
        revision: revision(dir, 'HEAD'),
        at: new Date().toISOString(),
        status: job.status
      });
      delete job.active;
      job.updated = new Date().toISOString();
      return { status: job.status, session: result.id, report: result.final, findings: job.findings };
    });
  } catch (e) {
    record(cwd, name, id, token, (job) => {
      job.lastError = e.message;
      job.failedRole = role;
      job.previousStatus = job.status;
      job.status = 'interrupted';
      delete job.active;
      job.updated = new Date().toISOString();
    });
    throw e;
  }
}
module.exports = { act };
