'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { fixture, write } = require('./helpers.cjs');

const project = {
  checks: [['node', 'check.cjs', 'argument with spaces']],
  maxWorkers: 2,
  runInstructions: 'Run node app.cjs',
  portIsolation: 'Use an ephemeral port',
  dataIsolation: 'Use a temporary directory per worker'
};

function reviewToken(output) {
  const match = output.match(/--review ([0-9a-f]{64})/);
  assert.ok(match, output);
  return match[1];
}

function environment(t) {
  const dist = fixture(t),
    target = fixture(t);
  for (const file of ['lib/manifest.cjs', 'scripts/setup.cjs']) {
    const src = path.join(__dirname, '..', file);
    if (fs.existsSync(src)) write(dist, file, fs.readFileSync(src));
  }
  for (const name of ['router', 'setup', 'write-tickets'])
    write(dist, 'skills/' + name + '/SKILL.md', name + ' skill\n');
  for (const name of [
    'worker',
    'tester',
    'reviewer',
    'merger',
    'checker',
    'teammate',
    'watchdog',
    'reproducer'
  ])
    write(dist, 'roles/' + name + '.md', name + ' role\n');
  for (const name of ['BOARD', 'rd', 'eval'])
    write(dist, 'skills/write-tickets/templates/' + name + '.md', name + ' template\n');
  write(dist, 'scripts/superagent.cjs', "require('../lib/example.cjs');\n");
  write(dist, 'lib/example.cjs', 'module.exports = 1;\n');
  write(dist, 'LICENSE', 'sample license\n');
  write(dist, 'THIRD_PARTY_NOTICES.md', 'attribution\n');
  const config = path.join(dist, 'configuration.json');
  fs.writeFileSync(config, JSON.stringify(project));
  const run = (cmd, ...flags) => {
    const p = spawnSync(process.execPath, [path.join(dist, 'scripts/setup.cjs'), cmd, target, ...flags], {
      encoding: 'utf8'
    });
    return { status: p.status, output: p.stdout + p.stderr };
  };
  const install = (...flags) => run('install', '--config', config, ...flags);
  const read = (file) => fs.readFileSync(path.join(target, file), 'utf8');
  return { dist, target, config, run, install, read };
}

test('install publishes all roles, runtime dependencies, skills and legal notices and survives reruns', (t) => {
  const { target, dist, config, run, install, read } = environment(t);
  write(target, '.codex/config.toml', '[custom]\n');
  write(target, 'AGENTS.md', 'Project instructions\n');
  write(target, '.superagent/jobs/run.json', 'prior run\n');
  write(target, '.agents/skills/unrelated/SKILL.md', 'user skill\n');
  const initial = install();
  assert.equal(initial.status, 0, initial.output);
  assert.equal(read('.superagent/roles/worker.md'), 'worker role\n');
  assert.equal(read('.agents/skills/write-tickets/templates/eval.md'), 'eval template\n');
  assert.equal(read('.superagent/THIRD_PARTY_NOTICES.md'), 'attribution\n');
  const runtime = spawnSync(process.execPath, ['.superagent/scripts/superagent.cjs'], { cwd: target });
  assert.equal(runtime.status, 0, runtime.stderr?.toString());
  assert.equal(run('verify').status, 0);
  const settings = { ...project, maxWorkers: 5, custom: { extra: 1 } };
  write(target, '.superagent/project.json', JSON.stringify(settings));
  fs.unlinkSync(config);
  const again = run('install');
  assert.equal(again.status, 0, again.output);
  assert.deepEqual(JSON.parse(read('.superagent/project.json')), settings);
  write(dist, 'lib/example.cjs', 'module.exports = 2;\n');
  fs.unlinkSync(path.join(dist, 'roles/worker.md'));
  assert.notEqual(run('install').status, 0, 'a broken release must not partially install');
  assert.equal(read('.superagent/lib/example.cjs'), 'module.exports = 1;\n');
  write(dist, 'roles/worker.md', 'worker role version two\n');
  assert.equal(run('install').status, 0);
  assert.equal(read('.superagent/lib/example.cjs'), 'module.exports = 2;\n');
  assert.equal(read('.codex/config.toml'), '[custom]\n');
  assert.equal(read('AGENTS.md'), 'Project instructions\n');
  assert.equal(read('.superagent/jobs/run.json'), 'prior run\n');
  assert.equal(read('.agents/skills/unrelated/SKILL.md'), 'user skill\n');
});

test('local edits and preexisting collisions require an individual diff and decision', (t) => {
  const { target, dist, run, install, read } = environment(t);
  const skill = '.agents/skills/router/SKILL.md';
  write(target, skill, 'my existing instructions\n');
  const collision = install();
  assert.equal(collision.status, 2, collision.output);
  assert.match(collision.output, /-my existing instructions/);
  assert.match(collision.output, /\+router skill/);
  assert.equal(read(skill), 'my existing instructions\n');
  const kept = install('--keep', skill, '--review', reviewToken(collision.output));
  assert.equal(kept.status, 0, kept.output);
  assert.equal(run('verify').status, 0);
  assert.equal(run('install').status, 0);
  write(dist, 'skills/router/SKILL.md', 'upgraded router\n');
  const reviewed = run('install');
  assert.equal(reviewed.status, 2);
  write(target, skill, 'local changes after upgrade\n');
  assert.notEqual(run('verify').status, 0);
  const stale = run('install', '--replace', skill, '--review', reviewToken(reviewed.output));
  assert.equal(stale.status, 2, 'changes since review require a new decision');
  assert.equal(read(skill), 'local changes after upgrade\n');
  const replaced = run('install', '--replace', skill, '--review', reviewToken(stale.output));
  assert.equal(replaced.status, 0, replaced.output);
  assert.equal(read(skill), 'upgraded router\n');
  const backupDir = path.join(target, '.superagent/backups');
  const backups = fs.readdirSync(backupDir).map((name) => read('.superagent/backups/' + name));
  assert.ok(backups.includes('local changes after upgrade\n'));
  fs.unlinkSync(path.join(target, skill));
  assert.notEqual(run('verify').status, 0);
  const missing = run('install');
  assert.equal(missing.status, 2);
  assert.equal(run('install', '--replace', skill, '--review', reviewToken(missing.output)).status, 0);
  assert.equal(run('verify').status, 0);
});

test('discovery uses repository evidence and rejects incomplete or shell-string project checks', (t) => {
  const { target, config, run, install } = environment(t);
  write(target, 'package.json', JSON.stringify({ scripts: { test: 'node --test' } }));
  const discovery = run('discover');
  assert.equal(discovery.status, 0, discovery.output);
  assert.deepEqual(JSON.parse(discovery.output).candidateChecks, [['npm', 'run', 'test']]);
  const missing = run('install');
  assert.notEqual(missing.status, 0);
  assert.match(missing.output, /--config/);
  for (const changes of [
    { checks: ['npm test'] },
    { checks: [] },
    { maxWorkers: 0 },
    { dataIsolation: '' }
  ]) {
    fs.writeFileSync(config, JSON.stringify({ ...project, ...changes }));
    const invalid = install();
    assert.notEqual(invalid.status, 0, invalid.output);
    assert.equal(fs.existsSync(path.join(target, '.agents')), false);
  }
});

test('installer rejects symlinks in source or destination before writing managed content', (t) => {
  const { dist, target, install } = environment(t);
  const outside = fixture(t);
  fs.symlinkSync(outside, path.join(target, '.superagent'));
  let result = install();
  assert.notEqual(result.status, 0);
  assert.match(result.output, /symlink/i);
  assert.equal(fs.existsSync(path.join(outside, 'manifest.json')), false);
  fs.unlinkSync(path.join(target, '.superagent'));
  fs.symlinkSync(outside, path.join(dist, 'skills/router/links'));
  result = install();
  assert.notEqual(result.status, 0);
  assert.match(result.output, /symlink/i);
  assert.equal(fs.existsSync(path.join(target, '.agents')), false);
});

test('foreign inventory metadata and symlinked backups are preserved on upgrade', (t) => {
  const { target, dist, install, read } = environment(t);
  const record = '.superagent/manifest.json';
  write(target, record, '{"format":1,"files":{},"projectNotes":"keep these notes"}');
  const foreign = install();
  assert.notEqual(foreign.status, 0);
  assert.match(read(record), /keep these notes/);
  fs.unlinkSync(path.join(target, record));
  assert.equal(install().status, 0);
  const outside = fixture(t);
  fs.symlinkSync(outside, path.join(target, '.superagent/backups'));
  const skill = '.agents/skills/router/SKILL.md';
  write(target, skill, 'owned by the project');
  write(dist, 'skills/router/SKILL.md', 'new release');
  const collision = install();
  assert.equal(collision.status, 2, collision.output);
  const replacement = install('--review', reviewToken(collision.output), '--replace', skill);
  assert.match(replacement.output, /symlink/i);
  assert.notEqual(replacement.status, 0);
  assert.equal(read(skill), 'owned by the project');
  assert.deepEqual(fs.readdirSync(outside), ['.git']);
});
