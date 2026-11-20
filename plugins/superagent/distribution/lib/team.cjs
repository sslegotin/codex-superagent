'use strict';
const fs = require('node:fs'),
  path = require('node:path');
function validateContract(dir, folder) {
  const file = path.join(dir, folder, 'contract.md');
  if (!fs.lstatSync(file, { throwIfNoEntry: false })?.isFile())
    throw Error('Team ownership contract is missing');
  const text = fs.readFileSync(file, 'utf8');
  const owner = /^Integration owner:\s*(\S[^\n]*)$/im.exec(text);
  const members = new Set(),
    paths = [];
  for (const m of text.matchAll(/^\|\s*`([^`|]+)`\s*\|\s*`([^`|]+)`\s*\|/gm)) {
    const member = m[1],
      file = m[2];
    if (
      file.startsWith('/') ||
      file.includes('\\') ||
      file.split('/').some((p) => !p || p === '.' || p === '..')
    )
      throw Error('Invalid team-owned path ' + file);
    if (paths.some((p) => p === file || p.startsWith(file + '/') || file.startsWith(p + '/')))
      throw Error('Overlapping team ownership at ' + file);
    members.add(member);
    paths.push(file);
  }
  if (!owner || members.size < 2)
    throw Error('Contract requires an integration owner and at least two named members with disjoint paths');
  return { owner: owner[1], paths };
}
module.exports = { validateContract };
