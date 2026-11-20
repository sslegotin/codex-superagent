'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { fixture } = require('./helpers.cjs');
const root = path.resolve(__dirname, '..');

test('a standalone marketplace package exposes setup and provisions the project-local workflow', (t) => {
  const catalog = JSON.parse(fs.readFileSync(path.join(root, '.agents/plugins/marketplace.json')));
  assert.equal(catalog.name, 'codex-superagent');
  const entry = catalog.plugins.find((p) => p.name === 'superagent');
  assert.equal(entry.source.source, 'local');
  const cached = path.join(fixture(t), 'cached plugin');
  fs.cpSync(path.join(root, entry.source.path), cached, { recursive: true });
  const manifest = JSON.parse(fs.readFileSync(path.join(cached, '.codex-plugin/plugin.json')));
  assert.equal(manifest.name, entry.name);
  assert.match(manifest.version, /^\d+\.\d+\.\d+$/);
  const skills = path.resolve(cached, manifest.skills);
  assert.deepEqual(fs.readdirSync(skills), ['setup']);
  const installer = path.resolve(skills, 'setup', '../../distribution/scripts/setup.cjs');
  const target = fixture(t);
  const config = path.join(path.dirname(cached), 'config.json');
  fs.writeFileSync(
    config,
    JSON.stringify({
      checks: [['git', 'status']],
      maxWorkers: 2,
      runInstructions: 'Git fixture',
      portIsolation: 'none',
      dataIsolation: 'per checkout'
    })
  );
  const run = (...args) =>
    execFileSync(process.execPath, [installer, ...args], { cwd: target, encoding: 'utf8' });
  run('install', target, '--config', config);
  assert.deepEqual(fs.readdirSync(path.join(target, '.agents/skills')).sort(), ['router', 'write-tickets']);
  assert.match(run('verify', target), /Verified/);
  assert.match(
    execFileSync(process.execPath, ['.superagent/scripts/superagent.cjs', 'help'], {
      cwd: target,
      encoding: 'utf8'
    }),
    /run BATCH/
  );
  for (const name of ['LICENSE', 'THIRD_PARTY_NOTICES.md']) {
    assert.equal(
      fs.readFileSync(path.join(target, '.superagent', name), 'utf8'),
      fs.readFileSync(path.join(root, name), 'utf8')
    );
  }
});
