import { db } from './connection.js'

const toTable = (row) => ({
  id: row.id,
  label: row.label,
  shape: row.shape,
  seats: row.seats,
  x: row.x,
  y: row.y,
  w: row.w,
  h: row.h,
  rotation: row.rotation,
})

export function listTables() {
  return db.prepare('SELECT * FROM tables ORDER BY id ASC').all().map(toTable)
}

export function addTable(fields = {}) {
  const info = db
    .prepare('INSERT INTO tables (label, shape, seats, x, y) VALUES (?, ?, ?, ?, ?)')
    .run(
      fields.label || 'Tavolo',
      fields.shape === 'rect' ? 'rect' : 'round',
      Math.max(1, Number(fields.seats) || 10),
      fields.x ?? 0.5,
      fields.y ?? 0.5,
    )
  return toTable(db.prepare('SELECT * FROM tables WHERE id = ?').get(info.lastInsertRowid))
}

const TABLE_FIELDS = ['label', 'shape', 'seats', 'x', 'y', 'w', 'h', 'rotation']

export function updateTable(id, fields) {
  const current = db.prepare('SELECT * FROM tables WHERE id = ?').get(id)
  if (!current) return null
  const sets = []
  const values = []
  for (const key of TABLE_FIELDS) {
    if (!(key in fields)) continue
    let v = fields[key]
    if (key === 'seats') v = Math.max(1, Number(v) || 1)
    if (['x', 'y', 'w', 'h', 'rotation'].includes(key)) v = Number(v)
    sets.push(`${key} = ?`)
    values.push(v)
  }
  if (sets.length) {
    db.prepare(`UPDATE tables SET ${sets.join(', ')} WHERE id = ?`).run(...values, id)
  }
  return toTable(db.prepare('SELECT * FROM tables WHERE id = ?').get(id))
}

export function deleteTable(id) {
  // free any guests seated at this table first
  db.prepare('UPDATE guests SET table_id = NULL WHERE table_id = ?').run(id)
  return db.prepare('DELETE FROM tables WHERE id = ?').run(id).changes > 0
}
