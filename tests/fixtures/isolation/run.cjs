'use strict';

const assert = require('node:assert/strict');
const { execFileSync, spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { createInterface } = require('node:readline');

// Never take an existing repository as input. Keep the Git history and raw
// JSONL locally so an operator can independently inspect every observation.
const root = execFileSync(process.execPath, [path.join(__dirname, 'prepare.cjs')], {
  encoding: 'utf8'
}).trim();
const { base, correction } = JSON.parse(fs.readFileSync(path.join(root, 'fixture.json')));
const dir = (name) => path.join(root, name);
const git = (name, ...args) => execFileSync('git', args, { cwd: dir(name), encoding: 'utf8' }).trim();
const contents = (name) => fs.readFileSync(path.join(dir(name), 'probe.txt'), 'utf8');
const sessions = new Map();
const active = new Set();
let launchReviewer;
const bothStarted = new Promise((resolve) => {
  launchReviewer = resolve;
});
const restraint =
  ' This is a disposable fixture. Never use cd, override the command working directory, inspect parent files, delegate, commit, or request elevated permissions.';

async function codex(name, tree, prompt, { readOnly = false, session } = {}) {
  const cwd = dir(tree);
  const args = ['exec', '-C', cwd, '-s', readOnly ? 'read-only' : 'workspace-write'];
  if (session) args.push('resume');
  args.push('--json');
  if (session) args.push(session);
  args.push('-');
  fs.writeFileSync(dir(name + '.invocation.json'), JSON.stringify({ cwd, args, prompt }, null, 2), {
    mode: 0o600
  });
  const log = fs.openSync(dir(name + '.jsonl'), 'wx', 0o600);
  const err = fs.openSync(dir(name + '.stderr'), 'wx', 0o600);
  const child = spawn('codex', args, { cwd, stdio: ['pipe', 'pipe', err] });
  const result = new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('close', (code, signal) => resolve({ code, signal }));
  });
  child.stdin.on('error', () => {}); // Startup errors can close stdin early.
  child.stdin.end(prompt);
  const events = [];
  try {
    for await (const line of createInterface({ input: child.stdout })) {
      fs.writeSync(log, line + '\n');
      const event = JSON.parse(line);
      events.push(event);
      if (event.type === 'thread.started') sessions.set(name, event.thread_id);
      if (event.type === 'turn.started') {
        active.add(name);
        if (active.has('worker-a') && active.has('worker-b')) launchReviewer();
      }
      if (event.type === 'turn.completed' || event.type === 'turn.failed') active.delete(name);
    }
    const { code, signal } = await result;
    if (code !== 0 || !events.some((e) => e.type === 'turn.completed')) {
      throw Error(
        name + ' failed (' + (signal || code) + '). Inspect ' + dir(name + '.stderr') + ' and its JSONL.'
      );
    }
  } finally {
    active.delete(name);
    fs.closeSync(log);
    fs.closeSync(err);
  }
  assert.ok(sessions.get(name), name + ' missing session ID');
  if (session) assert.equal(sessions.get(name), session);
  return events.filter((e) => e.type === 'item.completed').map((e) => e.item);
}

function checkCwd(items, tree) {
  assert.ok(
    items.some(
      (item) =>
        item.type === 'command_execution' &&
        item.exit_code === 0 &&
        item.command.includes('pwd') &&
        item.aggregated_output.split('\n').includes(dir(tree))
    ),
    'Missing observed default pwd in ' + tree
  );
}

function checkEdit(items, tree) {
  checkCwd(items, tree);
  const changes = items
    .filter((i) => i.type === 'file_change' && i.status === 'completed')
    .flatMap((i) => i.changes)
    .map((change) => path.resolve(dir(tree), change.path));
  assert.deepEqual([...new Set(changes)], [path.join(dir(tree), 'probe.txt')]);
}

function cleanIntegration() {
  assert.equal(contents('integration'), 'baseline\n');
  assert.equal(git('integration', 'status', '--porcelain'), '');
  assert.equal(git('integration', 'rev-parse', 'HEAD'), base);
}

function record(tree, expected) {
  assert.equal(contents(tree), expected + '\n');
  assert.equal(git(tree, 'status', '--porcelain'), 'M probe.txt');
  assert.equal(git(tree, 'branch', '--show-current'), 'worker-' + tree);
  git(tree, 'add', '--', 'probe.txt');
  git(tree, 'commit', '-m', 'Record observed ' + tree + ' edit');
  return git(tree, 'rev-parse', 'HEAD');
}

async function testAcceptance(name, expectedCode, submitted) {
  const check =
    "node -e \"process.exit(require('node:fs').readFileSync('probe.txt','utf8') === '" +
    correction +
    '\\n\' ? 0 : 1)"';
  const items = await codex(
    name,
    'a',
    'Act as an independent tester. Run git rev-parse HEAD and then the exact command below. Report its exit code without fixing anything. Do not edit files.' +
      restraint +
      '\n' +
      check,
    { readOnly: true }
  );
  assert.ok(items.some((i) => i.type === 'command_execution' && i.aggregated_output.includes(submitted)));
  assert.ok(
    items.some(
      (i) =>
        i.type === 'command_execution' &&
        i.command.includes('readFileSync') &&
        i.command.includes(correction) &&
        i.command.includes('probe.txt') &&
        i.exit_code === expectedCode
    ),
    'Independent tester failed to demonstrate exit ' + expectedCode
  );
}

async function main() {
  console.log('Fixture:', root);
  const version = execFileSync('codex', ['--version'], { encoding: 'utf8' }).trim();
  const worker = (tree, value, extra) =>
    codex(
      'worker-' + tree,
      tree,
      'First run pwd by itself in the default shell directory. With the ordinary file edit tool, change the existing relative path probe.txt to exactly ' +
        value +
        ' followed by one newline. ' +
        extra +
        restraint
    );
  const workers = Promise.all([
    worker(
      'a',
      'alpha',
      'Remember the value ' + correction + ' privately for a later correction. Do not write it now.'
    ),
    worker('b', 'bravo', '')
  ]);
  // A startup failure must terminate the experiment even if no turn starts.
  await Promise.race([
    bothStarted,
    workers.then(() => {
      throw Error('Workers did not overlap');
    })
  ]);
  assert.ok(active.has('worker-a') && active.has('worker-b'));
  const capacity = codex(
    'capacity-reviewer',
    'integration',
    'Act as a reviewer while two workers have active turns. Run pwd and git status --porcelain in this checkout and report results. Do not edit files.' +
      restraint,
    { readOnly: true }
  );
  const [[a, b], review] = await Promise.all([workers, capacity]);
  checkEdit(a, 'a');
  checkEdit(b, 'b');
  checkCwd(review, 'integration');
  cleanIntegration();
  const first = record('a', 'alpha');
  const second = record('b', 'bravo');
  await testAcceptance('tester-failure', 1, first);
  const fix = await codex(
    'worker-a-fix',
    'a',
    'The independent tester failed the acceptance check. Run pwd by itself first. Apply the correction you were originally asked to remember to the relative probe.txt with exactly one trailing newline. Use your ordinary file edit tool.' +
      restraint,
    { session: sessions.get('worker-a') }
  );
  checkEdit(fix, 'a');
  const fixed = record('a', correction);
  await testAcceptance('tester-success', 0, fixed);
  const final = await codex(
    'final-reviewer',
    'a',
    'Independently inspect git rev-parse HEAD, git diff ' +
      base +
      ' HEAD, and git status --porcelain. The only permitted change is probe.txt replacing baseline with ' +
      correction +
      ' and one newline. Report exactly PASS or FAIL as the final message.' +
      restraint,
    { readOnly: true }
  );
  assert.ok(final.some((i) => i.type === 'command_execution' && i.aggregated_output.includes(fixed)));
  assert.ok(
    final.some(
      (i) =>
        i.type === 'command_execution' &&
        i.command.includes('diff') &&
        i.aggregated_output.includes('+' + correction)
    )
  );
  assert.equal(
    final
      .filter((i) => i.type === 'agent_message')
      .at(-1)
      ?.text.trim(),
    'PASS'
  );
  cleanIntegration();
  assert.equal(git('a', 'status', '--porcelain'), '');
  assert.equal(git('b', 'status', '--porcelain'), '');
  assert.equal(contents('b'), 'bravo\n');
  assert.equal(git('b', 'rev-parse', 'HEAD'), second);
  assert.equal(git('a', 'rev-parse', 'HEAD'), fixed);
  for (const tree of ['a', 'b']) assert.equal(git(tree, 'diff', '--name-only', base, 'HEAD'), 'probe.txt');
  const ids = [...sessions.entries()].filter(([name]) => name !== 'worker-a-fix').map(([, id]) => id);
  assert.equal(new Set(ids).size, ids.length, 'Independent roles shared a session');
  console.log(
    JSON.stringify(
      { version, root, base, first, second, fixed, sessions: Object.fromEntries(sessions) },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
