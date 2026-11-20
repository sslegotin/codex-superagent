const test = require('node:test');
const assert = require('node:assert/strict');
const { selectBatch } = require('../plugins/superagent/distribution/lib/batch.cjs');

const board = (...rows) =>
  ['| # | Title | Status | Mode | Runs | Batch |', '|---|---|---|---|---|---|', ...rows].join('\n');
const row = (id, runs = 'alongside', status = 'ready', batch = 'demo', mode = 'solo') =>
  `| ${id} | Feature | ${status} | ${mode} | ${runs} | ${batch} |`;

test('returns dependencies while allowing parallel file overlaps', () => {
  const tickets = selectBatch(
    board(
      row('001'),
      row('002', 'overlaps 001: src'),
      row('003', 'waits for 001: API; waits for 002: storage')
    ),
    'demo'
  );
  assert.deepEqual(
    tickets.map((t) => t.waits),
    [[], [], ['001', '002']]
  );
});
test('accepts a dependency already delivered by another batch', () => {
  assert.deepEqual(
    selectBatch(
      board(row('001', 'alongside', 'done', 'earlier'), row('002', 'waits for 001: schema')),
      'demo'
    ).map((t) => t.id),
    ['002']
  );
});
for (const [name, rows] of Object.entries({
  draft: [row('001', 'alongside', 'draft')],
  cycle: [row('001', 'waits for 002: data'), row('002', 'waits for 001: data')],
  external: [row('001', 'alongside', 'ready', 'earlier'), row('002', 'waits for 001: data')],
  duplicate: [row('001'), row('001')],
  typo: [row('001', 'wait for 002')],
  mode: [row('001', 'alongside', 'ready', 'demo', 'other')],
  unknown: [row('001', 'waits for 999: data')]
}))
  test('rejects ' + name, () => assert.throws(() => selectBatch(board(...rows), 'demo')));
