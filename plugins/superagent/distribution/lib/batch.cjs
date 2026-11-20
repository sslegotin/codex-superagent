'use strict';

function parseBoard(text) {
  const tickets = new Map();
  let reading = false;
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim().startsWith('|')) {
      reading = false;
      continue;
    }
    const cells = line
      .trim()
      .replace(/^\||\|$/g, '')
      .split(/(?<!\\)\|/)
      .map((s) => s.trim());
    if (cells.join('|') === '#|Title|Status|Mode|Runs|Batch') {
      reading = true;
      continue;
    }
    if (!reading || cells.every((cell) => /^:?-{2,}:?$/.test(cell))) continue;
    const [id, title, status, mode, runs, batch] = cells;
    if (cells.length !== 6 || !/^\d{3}$/.test(id) || !title || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(batch))
      throw Error('Invalid board row: ' + line);
    if (tickets.has(id)) throw Error('Duplicate ticket ' + id);
    if (!['draft', 'ready', 'done'].includes(status) || !['solo', 'team'].includes(mode))
      throw Error('Invalid status or mode for ' + id);
    const waits = [],
      overlaps = [];
    for (const entry of runs.split(/;\s*/)) {
      if (entry === 'alongside') continue;
      const m = /^(waits for|overlaps) (\d{3}):\s*\S/.exec(entry);
      if (!m) throw Error('Invalid Runs entry for ' + id + ': ' + entry);
      (m[1] === 'waits for' ? waits : overlaps).push(m[2]);
    }
    tickets.set(id, { id, title, status, mode, batch, waits, overlaps });
  }
  return tickets;
}

function selectBatch(text, name) {
  const all = parseBoard(text);
  const selected = [...all.values()].filter((t) => t.batch === name && t.status !== 'done');
  if (!selected.length) throw Error('No pending tickets for ' + name);
  const seen = new Set(),
    active = new Set();
  function visit(ticket) {
    if (seen.has(ticket.id)) return;
    if (active.has(ticket.id)) throw Error('Dependency cycle at ' + ticket.id);
    if (ticket.batch !== name || ticket.status !== 'ready')
      throw Error('Dependency or ticket is outside the ready batch: ' + ticket.id);
    active.add(ticket.id);
    for (const id of ticket.waits) {
      const dependency = all.get(id);
      if (!dependency) throw Error('Unknown dependency ' + id);
      if (dependency.status !== 'done') visit(dependency);
    }
    active.delete(ticket.id);
    seen.add(ticket.id);
  }
  selected.forEach(visit);
  return selected;
}
module.exports = { parseBoard, selectBatch };
