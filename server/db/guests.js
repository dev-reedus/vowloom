import { db, defaultPartySize, REPLY_STATUSES } from './connection.js'

const toGuest = (row) => {
  const reply_status = REPLY_STATUSES.includes(row.reply_status) ? row.reply_status : 'pending'
  return {
    id: row.id,
    name: row.name,
    sent: !!row.sent,
    reply_status,
    accepted: reply_status === 'accepted', // derived, kept for older read paths
    party_size: row.party_size ?? 1,
    table_id: row.table_id ?? null,
    seat_index: row.seat_index ?? null,
  }
}

export function listGuests() {
  return db.prepare('SELECT * FROM guests ORDER BY id ASC').all().map(toGuest)
}

export function addGuest(name) {
  const info = db
    .prepare('INSERT INTO guests (name, party_size) VALUES (?, ?)')
    .run(name, defaultPartySize(name))
  return toGuest(db.prepare('SELECT * FROM guests WHERE id = ?').get(info.lastInsertRowid))
}

// Update only the provided fields among a small allow-list. `reply_status` is
// the source of truth for the reply; `accepted` is derived from it below for backward compatibility.
const GUEST_FIELDS = ['name', 'sent', 'reply_status', 'party_size', 'table_id', 'seat_index']

export function updateGuest(id, rawFields) {
  const current = db.prepare('SELECT * FROM guests WHERE id = ?').get(id)
  if (!current) return null

  const fields = { ...rawFields }
  // Moving a guest to a different table clears their old seat, unless a new
  // seat is being set in the same request.
  if ('table_id' in fields && !('seat_index' in fields)) fields.seat_index = null
  // Backward compat: a legacy PATCH carrying `accepted` maps onto reply_status.
  if ('accepted' in fields && !('reply_status' in fields)) {
    fields.reply_status = fields.accepted ? 'accepted' : 'pending'
  }
  // Ignore an invalid reply_status rather than storing junk.
  if ('reply_status' in fields && !REPLY_STATUSES.includes(fields.reply_status)) {
    delete fields.reply_status
  }

  const sets = []
  const values = []
  for (const key of GUEST_FIELDS) {
    if (!(key in fields)) continue
    let v = fields[key]
    if (key === 'sent') v = v ? 1 : 0
    if (key === 'table_id') v = v == null ? null : Number(v)
    if (key === 'seat_index') v = v == null ? null : Number(v)
    if (key === 'party_size') v = Math.max(1, Number(v) || 1)
    sets.push(`${key} = ?`)
    values.push(v)
  }
  // Keep the legacy `accepted` column in sync with the new status.
  if ('reply_status' in fields) {
    sets.push('accepted = ?')
    values.push(fields.reply_status === 'accepted' ? 1 : 0)
  }
  if (sets.length) {
    db.prepare(`UPDATE guests SET ${sets.join(', ')} WHERE id = ?`).run(...values, id)
  }
  return toGuest(db.prepare('SELECT * FROM guests WHERE id = ?').get(id))
}

export function deleteGuest(id) {
  return db.prepare('DELETE FROM guests WHERE id = ?').run(id).changes > 0
}
