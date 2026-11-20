'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { createHash, randomUUID } = require('node:crypto');

const manifestPath = '.superagent/manifest.json';
const configPath = '.superagent/project.json';
const hash = (data) => createHash('sha256').update(data).digest('hex');

// Inventory paths always originate in the distribution, never in the target manifest.
function safePath(root, relative) {
  const parts = relative.split('/');
  if (parts.some((part) => !part || part === '.' || part === '..' || part.includes('\\'))) {
    throw Error('Invalid inventory path: ' + relative);
  }
  let current = root;
  for (const [index, part] of parts.entries()) {
    current = path.join(current, part);
    const stat = fs.lstatSync(current, { throwIfNoEntry: false });
    if (stat?.isSymbolicLink()) throw Error('Refusing symlink: ' + current);
    if (stat && index < parts.length - 1 && !stat.isDirectory())
      throw Error('Expected directory: ' + current);
  }
  return current;
}

function contents(file) {
  const stat = fs.lstatSync(file, { throwIfNoEntry: false });
  if (!stat) return null;
  if (!stat.isFile()) throw Error('Expected regular file: ' + file);
  return fs.readFileSync(file);
}

function inventory(source) {
  const files = new Map();
  const skillNames = ['router', 'write-tickets', 'setup'];
  const roles = ['worker', 'tester', 'reviewer', 'merger', 'checker', 'teammate', 'watchdog', 'reproducer'];
  function add(relative) {
    const file = safePath(source, relative);
    const data = contents(file);
    if (!data?.length) throw Error('Missing or empty distribution file: ' + relative);
    const to = (relative.startsWith('skills/') ? '.agents/' : '.superagent/') + relative;
    files.set(to, { file, data, hash: hash(data) });
  }
  function walk(relative) {
    for (const name of fs.readdirSync(safePath(source, relative)).sort()) {
      const child = relative + '/' + name;
      const stat = fs.lstatSync(safePath(source, child));
      if (stat.isDirectory()) walk(child);
      else add(child);
    }
  }
  for (const name of skillNames) {
    walk('skills/' + name);
    if (!files.has('.agents/skills/' + name + '/SKILL.md')) throw Error('Missing skill: ' + name);
  }
  for (const template of ['BOARD', 'rd', 'eval']) {
    if (!files.has('.agents/skills/write-tickets/templates/' + template + '.md'))
      throw Error('Missing template: ' + template);
  }
  for (const [dir, extension] of [
    ['lib', '.cjs'],
    ['roles', '.md']
  ]) {
    for (const name of fs.readdirSync(safePath(source, dir)).sort()) {
      if (name.endsWith(extension)) add(dir + '/' + name);
    }
  }
  for (const role of roles) {
    if (!files.has('.superagent/roles/' + role + '.md')) throw Error('Missing role: ' + role);
  }
  for (const file of ['scripts/superagent.cjs', 'LICENSE', 'THIRD_PARTY_NOTICES.md']) add(file);
  return files;
}

function readManifest(target) {
  const data = contents(safePath(target, manifestPath));
  if (!data) return null;
  const record = JSON.parse(data);
  if (
    record?.format !== 1 ||
    Object.keys(record).some((key) => !['format', 'files'].includes(key)) ||
    !record.files ||
    typeof record.files !== 'object' ||
    Array.isArray(record.files)
  ) {
    throw Error('Unrecognized installer manifest: ' + manifestPath);
  }
  for (const entry of Object.values(record.files)) {
    if (
      !entry ||
      Object.keys(entry).some((key) => !['upstream', 'installed'].includes(key)) ||
      ![entry.upstream, entry.installed].every((v) => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v))
    ) {
      throw Error('Invalid installer manifest entry');
    }
  }
  return record.files;
}

function projectConfig(target, supplied) {
  const existing = contents(safePath(target, configPath));
  if (!existing && !supplied) throw Error('Supply approved project settings with --config FILE');
  const data = existing ?? fs.readFileSync(supplied);
  const config = JSON.parse(data);
  if (
    !Array.isArray(config?.checks) ||
    !config.checks.length ||
    !config.checks.every(
      (args) =>
        Array.isArray(args) &&
        typeof args[0] === 'string' &&
        args[0].trim() &&
        args.every((arg) => typeof arg === 'string' && !arg.includes('\0'))
    )
  ) {
    throw Error('checks must contain one or more command argv arrays');
  }
  if (!Number.isSafeInteger(config.maxWorkers) || config.maxWorkers < 1)
    throw Error('maxWorkers must be a positive integer');
  for (const field of ['runInstructions', 'portIsolation', 'dataIsolation']) {
    if (typeof config[field] !== 'string' || !config[field].trim())
      throw Error('Missing project setting: ' + field);
  }
  return { data, existing };
}

function writeAtomic(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temp = path.join(path.dirname(file), '.setup-' + randomUUID());
  fs.writeFileSync(temp, data, {
    flag: 'wx',
    mode: fs.statSync(file, { throwIfNoEntry: false })?.mode ?? 0o666
  });
  try {
    fs.renameSync(temp, file);
  } finally {
    fs.rmSync(temp, { force: true });
  }
}

function verify(target, files) {
  projectConfig(target);
  const records = readManifest(target);
  if (!records) throw Error('Missing installer manifest');
  for (const [name, source] of files) {
    const current = contents(safePath(target, name));
    if (!current || records[name]?.installed !== hash(current) || records[name].upstream !== source.hash) {
      throw Error('Installation differs from inventory: ' + name);
    }
  }
}
module.exports = {
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
};
