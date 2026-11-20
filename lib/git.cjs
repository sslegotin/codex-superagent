'use strict';
const { execFileSync } = require('node:child_process');

function git(cwd, ...args) {
  try {
    return execFileSync('git', args, {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      maxBuffer: 32 * 1024 * 1024
    });
  } catch (error) {
    throw Error(error.stderr?.trim() || error.message, { cause: error });
  }
}
function revision(cwd, ref) {
  return git(cwd, 'rev-parse', '--verify', '--end-of-options', ref + '^{commit}').trim();
}
function clean(cwd) {
  if (git(cwd, 'status', '--porcelain', '--untracked-files=all').trim())
    throw Error('Checkout contains pending changes: ' + cwd);
}
module.exports = { git, revision, clean };
