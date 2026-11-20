'use strict';
const { spawn } = require('node:child_process');
const readline = require('node:readline');

async function runSession({ cwd, prompt, session, readOnly, onSession, onSpawn, onActivity }) {
  const args = ['exec', '-C', cwd, '-s', readOnly ? 'read-only' : 'workspace-write'];
  if (session) args.push('resume', '--json', session, '-');
  else args.push('--json', '-');
  const child = spawn('codex', args, { cwd, stdio: ['pipe', 'pipe', 'inherit'] });
  const completion = new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('close', (code, signal) => resolve({ code, signal }));
  });
  // Observe early spawn failures even while draining stdout.
  completion.catch(() => {});
  child.stdin.on('error', () => {});
  child.stdin.end(prompt);
  let id,
    final = '',
    failure,
    completed = false;
  try {
    if (child.pid) onSpawn(child.pid);
    for await (const line of readline.createInterface({ input: child.stdout })) {
      let e;
      try {
        e = JSON.parse(line);
      } catch {
        continue;
      }
      onActivity();
      if (e.type === 'thread.started') {
        id = e.thread_id;
        if (!id || (session && id !== session)) throw Error('Codex resumed a different session');
        onSession(id);
      }
      if (e.type === 'item.completed' && e.item?.type === 'agent_message') final = e.item.text;
      if (e.type === 'turn.completed') completed = true;
      if (e.type === 'turn.failed') failure = e.error?.message || 'Codex turn failed';
    }
    const { code, signal } = await completion;
    if (code !== 0 || !id || !completed || failure)
      throw Error(failure || 'Incomplete Codex turn (exit ' + (signal || code) + ')');
    return { id, final };
  } catch (e) {
    child.kill();
    throw e;
  }
}
module.exports = { runSession };
