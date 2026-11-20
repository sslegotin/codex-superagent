#!/usr/bin/env node
'use strict';
const path = require('node:path');
const fs = require('node:fs');
const { spawnSync } = require('node:child_process');
const {
  safePath,
  contents,
  hash,
  inventory,
  projectConfig,
  readManifest,
  configPath,
  manifestPath,
  writeAtomic,
  verify
} = require('../lib/manifest.cjs');

function discover(target) {
  const names = [
    'AGENTS.md',
    'README.md',
    'package.json',
    'Makefile',
    'go.mod',
    'Cargo.toml',
    'pyproject.toml'
  ];
  const markers = names.filter((name) =>
    fs.lstatSync(path.join(target, name), { throwIfNoEntry: false })?.isFile()
  );
  const candidateChecks = [];
  if (markers.includes('package.json')) {
    const scripts = JSON.parse(fs.readFileSync(path.join(target, 'package.json'), 'utf8')).scripts;
    for (const name of ['check', 'test']) {
      if (typeof scripts?.[name] === 'string') candidateChecks.push(['npm', 'run', name]);
    }
  }
  if (
    markers.includes('Makefile') &&
    /^check\s*:/m.test(fs.readFileSync(path.join(target, 'Makefile'), 'utf8'))
  )
    candidateChecks.push(['make', 'check']);
  if (markers.includes('go.mod')) candidateChecks.push(['go', 'test', './...']);
  if (markers.includes('Cargo.toml')) candidateChecks.push(['cargo', 'test']);
  return { markers, candidateChecks, config: configPath };
}

function showDiff(dest, source, current) {
  const from = current === null ? '/dev/null' : dest;
  const result = spawnSync(
    'git',
    ['diff', '--no-index', '--no-ext-diff', '--no-textconv', '--no-color', '--', from, source.file],
    { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 }
  );
  if (result.error || result.status !== 1)
    throw Error(result.error?.message || result.stderr || 'Could not produce diff for ' + dest);
  process.stderr.write(result.stdout);
}

function install(target, files, supplied, decisions, review) {
  const settings = projectConfig(target, supplied);
  const previous = readManifest(target) ?? {};
  const records = {},
    writes = [],
    conflicts = [];
  for (const [name, source] of files) {
    const dest = safePath(target, name);
    const current = contents(dest);
    const digest = current && hash(current);
    const old = previous[name];
    const unchangedLocal = old && digest === old.installed && old.upstream === source.hash;
    const pristine = old ? digest === old.upstream : current === null;
    const conflict = digest !== source.hash && !unchangedLocal && !pristine;
    const decision = decisions.get(name);
    if (decision && !conflict) throw Error('No conflict for option ' + decision + ' ' + name);
    let installed = source.hash;
    if (conflict) {
      showDiff(dest, source, current);
      conflicts.push([name, digest, source.hash]);
      if (decision === '--keep' && !current)
        throw Error('Missing required file, restore it or select --replace ' + name);
    }
    if (unchangedLocal || decision === '--keep') installed = digest;
    else if (digest !== source.hash) {
      const backup = decision === '--replace' && current && safePath(target, '.superagent/backups/' + digest);
      if (backup) {
        const saved = contents(backup);
        if (saved && hash(saved) !== digest) throw Error('Backup collision: ' + backup);
        if (!saved) writes.push({ file: backup, data: current });
      }
      writes.push({ file: dest, data: source.data });
    }
    records[name] = { upstream: source.hash, installed };
  }
  for (const name of decisions.keys()) if (!files.has(name)) throw Error('Unknown decision path: ' + name);
  const token = hash(JSON.stringify([target, conflicts]));
  if (conflicts.length && (review !== token || conflicts.some(([name]) => !decisions.has(name)))) {
    for (const [name] of conflicts) console.error('Choose --keep ' + name + ' or --replace ' + name);
    console.error('To apply decisions to these versions, include --review ' + token);
    return 2;
  }
  for (const { file, data } of writes) writeAtomic(file, data);
  if (!settings.existing) writeAtomic(safePath(target, configPath), settings.data);
  const manifest = JSON.stringify({ format: 1, files: records }, null, 2) + '\n';
  const location = safePath(target, manifestPath);
  if (contents(location)?.toString() !== manifest) writeAtomic(location, manifest);
  verify(target, files);
  console.log('Verified ' + files.size + ' managed files in ' + target);
  return 0;
}

function main([command, dir, ...flags]) {
  if (!['discover', 'install', 'verify'].includes(command) || !dir)
    throw Error(
      'Usage: node scripts/setup.cjs discover|install|verify TARGET [--config FILE] [--keep PATH | --replace PATH]…'
    );
  const target = fs.realpathSync(dir);
  const root = spawnSync('git', ['-C', target, 'rev-parse', '--show-toplevel'], { encoding: 'utf8' });
  if (root.status !== 0 || fs.realpathSync(root.stdout.trim()) !== target)
    throw Error('TARGET must be the root of a Git worktree');
  let config, review;
  const decisions = new Map();
  for (let i = 0; i < flags.length; i += 2) {
    const flag = flags[i],
      value = flags[i + 1];
    if (command !== 'install' || !value) throw Error('Unexpected option: ' + flag);
    if (flag === '--config' && !config) config = value;
    else if (flag === '--review' && !review) review = value;
    else if (['--keep', '--replace'].includes(flag) && !decisions.has(value)) decisions.set(value, flag);
    else throw Error('Unknown or repeated option: ' + flag);
  }
  if (command === 'discover') {
    console.log(JSON.stringify(discover(target), null, 2));
    return 0;
  }
  const files = inventory(path.resolve(__dirname, '..'));
  if (command === 'verify') {
    verify(target, files);
    console.log('Verified ' + files.size + ' managed files in ' + target);
    return 0;
  }
  const lock = safePath(target, '.superagent/setup.lock');
  fs.mkdirSync(path.dirname(lock), { recursive: true });
  try {
    fs.mkdirSync(lock);
  } catch (err) {
    if (err.code === 'EEXIST')
      throw Error(
        'Setup lock exists: ' + lock + '. Check for an active installer before moving a stale lock aside.'
      );
    throw err;
  }
  try {
    return install(target, files, config, decisions, review);
  } finally {
    fs.rmdirSync(lock);
  }
}

try {
  process.exitCode = main(process.argv.slice(2));
} catch (err) {
  console.error(err.message);
  process.exitCode = 1;
}
