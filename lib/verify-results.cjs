'use strict';
const { git, revision } = require('./git.cjs');

function verify({ cwd, base, rev, folder, waivers = [], previousLanding }) {
  base = revision(cwd, base);
  rev = revision(cwd, rev);
  if (!/^specs\/tickets\/\d{3}-[a-z0-9-]+$/.test(folder)) throw Error('Invalid ticket path');
  const issues = [];
  const read = (sha, file) => git(cwd, 'show', sha + ':' + folder + '/' + file);
  for (const file of ['rd.md', 'eval.md']) {
    const original = read(base, file),
      actual = read(rev, file);
    const landedStatus =
      file === 'rd.md' &&
      previousLanding &&
      read(previousLanding, file) === actual &&
      original.replace(/^(\*\*Status:\*\*[ \t]+)ready(?=[ \t]*\r?$)/m, '$1done') === actual;
    if (original !== actual && !landedStatus) issues.push('Approved input changed: ' + file);
  }
  const ids = [...read(base, 'eval.md').matchAll(/^#{2,4}\s+(E-\d+[a-z]?)\b/gm)].map((m) => m[1]);
  if (!ids.length || new Set(ids).size !== ids.length) issues.push('Missing or duplicate check headings');
  const checks = {};
  const report = read(rev, 'results.md');
  for (const m of report.matchAll(
    /^\s*(?:[-*]\s+|\|\s*)?(E-\d+[a-z]?)\s*\|\s*(PASS|FAIL|NOT RUN)\s*\|([^\n]*)$/gm
  )) {
    const [, id, outcome, detail] = m;
    if (Object.hasOwn(checks, id) || !ids.includes(id)) issues.push('Unexpected or duplicate result ' + id);
    const evidence = [...detail.matchAll(/(?:^|[\s`(])(evidence\/[^\s`),;|]+)/g)].map((x) => x[1]);
    checks[id] = { outcome, evidence };
    if (outcome === 'FAIL' || (outcome === 'NOT RUN' && !waivers.includes(id)))
      issues.push(id + ' ' + outcome);
    if (outcome === 'PASS' && !evidence.length) issues.push('Missing evidence for ' + id);
    for (const file of evidence) {
      const valid = file.split('/').every((p) => /^[a-zA-Z0-9_.-]+$/.test(p) && p !== '.' && p !== '..');
      const entry = valid && git(cwd, 'ls-tree', '-l', rev, '--', folder + '/' + file);
      if (!/^100(?:644|755) blob [0-9a-f]+\s+[1-9]\d*\t/.test(entry))
        issues.push('Invalid or empty evidence: ' + file);
    }
  }
  for (const id of ids) if (!checks[id]) issues.push('Missing result ' + id);
  const sections = [...report.matchAll(/^## Reviewer[ \t]*\r?\n([\s\S]*?)(?=^#|(?![\s\S]))/gm)];
  const verdict = sections.length === 1 && sections[0][1].trim();
  if (verdict !== 'APPROVE') issues.push('Reviewer approval required');
  return { ok: issues.length === 0, revision: rev, checks, issues };
}
module.exports = { verify };
