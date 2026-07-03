import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import Database from 'better-sqlite3'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// DB lives in a directory that is mounted as a Docker volume, so the data
// survives container stop / rm. Override with DB_PATH if needed.
const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'nozze.db')
const SEED_FILE = process.env.SEED_FILE || path.join(__dirname, '..', 'lista.txt')

fs.mkdirSync(path.dirname(DB_PATH), { recursive: true })

export const db = new Database(DB_PATH)
db.pragma('journal_mode = WAL')

db.exec(`
  CREATE TABLE IF NOT EXISTS guests (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    name       TEXT    NOT NULL,
    sent       INTEGER NOT NULL DEFAULT 0,
    accepted   INTEGER NOT NULL DEFAULT 0,
    created_at TEXT    NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS tables (
    id       INTEGER PRIMARY KEY AUTOINCREMENT,
    label    TEXT    NOT NULL,
    shape    TEXT    NOT NULL DEFAULT 'round',   -- 'round' | 'rect'
    seats    INTEGER NOT NULL DEFAULT 8,
    x        REAL    NOT NULL DEFAULT 0.5,        -- centre, normalized 0..1
    y        REAL    NOT NULL DEFAULT 0.5,
    w        REAL    NOT NULL DEFAULT 0.14,       -- normalized (reserved for later)
    h        REAL    NOT NULL DEFAULT 0.14,
    rotation REAL    NOT NULL DEFAULT 0
  );
`)

// Default headcount for a party: names joined with "/" (a couple) default to 2,
// everyone else to 1. Always editable in the app afterwards.
export function defaultPartySize(name) {
  return /\//.test(name) ? 2 : 1
}

function columnExists(table, col) {
  return db.prepare(`PRAGMA table_info(${table})`).all().some((c) => c.name === col)
}

// Idempotent migrations for existing databases created before this feature.
function migrate() {
  if (!columnExists('guests', 'party_size')) {
    db.exec('ALTER TABLE guests ADD COLUMN party_size INTEGER NOT NULL DEFAULT 1')
    // backfill from the name divider for rows that already existed
    const rows = db.prepare('SELECT id, name FROM guests').all()
    const upd = db.prepare('UPDATE guests SET party_size = ? WHERE id = ?')
    db.transaction(() => {
      for (const r of rows) upd.run(defaultPartySize(r.name), r.id)
    })()
  }
  if (!columnExists('guests', 'table_id')) {
    db.exec('ALTER TABLE guests ADD COLUMN table_id INTEGER')
  }
  if (!columnExists('guests', 'seat_index')) {
    db.exec('ALTER TABLE guests ADD COLUMN seat_index INTEGER')
  }
}
migrate()

// Header words to skip when reading lista.txt.
const HEADER_WORDS = new Set(['nome', 'invito', 'conferma', 'name', 'sent', 'accepted'])

// Parse lista.txt: one guest per non-empty line. Leading "•" bullets and
// surrounding whitespace are stripped; the header row is ignored. A line may
// optionally carry status flags as "Name | sent | accepted" where the flag is
// truthy for 1/x/yes/si/true.
export function parseGuestList(text) {
  const truthy = (v) => ['1', 'x', 'yes', 'si', 'sì', 'true'].includes((v || '').trim().toLowerCase())
  const guests = []
  for (const rawLine of text.split(/\r?\n/)) {
    let line = rawLine.trim()
    if (!line) continue
    line = line.replace(/^[•\-*•]\s*/, '').trim() // strip bullet markers
    if (!line) continue

    const [namePart, sentPart, acceptedPart] = line.split('|').map((s) => s.trim())
    if (!namePart) continue
    if (HEADER_WORDS.has(namePart.toLowerCase())) continue

    guests.push({
      name: namePart,
      sent: truthy(sentPart),
      accepted: truthy(acceptedPart),
    })
  }
  return guests
}

// Seed the DB from lista.txt, but only when the table is empty, so that
// restarts never overwrite edits made through the app.
export function seedIfEmpty() {
  const { count } = db.prepare('SELECT COUNT(*) AS count FROM guests').get()
  if (count > 0) return { seeded: 0, reason: 'not-empty' }
  if (!fs.existsSync(SEED_FILE)) return { seeded: 0, reason: 'no-seed-file' }

  const guests = parseGuestList(fs.readFileSync(SEED_FILE, 'utf8'))
  const insert = db.prepare('INSERT INTO guests (name, sent, accepted, party_size) VALUES (?, ?, ?, ?)')
  db.transaction((rows) => {
    for (const g of rows) insert.run(g.name, g.sent ? 1 : 0, g.accepted ? 1 : 0, defaultPartySize(g.name))
  })(guests)
  return { seeded: guests.length, reason: 'seeded' }
}

// The real tables from the room floorplan (Tav. 11–32), positioned to match
// the blueprint underlay. Seat counts are a sensible default (editable in the
// app). Only runs when there are no tables yet.
export function seedTablesIfEmpty() {
  const { count } = db.prepare('SELECT COUNT(*) AS count FROM tables').get()
  if (count > 0) return { seeded: 0 }

  // Positions traced from the (landscape) room floorplan, normalized to the
  // room's bounding box.
  const rows = [
    { label: 'Tav. 11', x: 0.089, y: 0.294 },
    { label: 'Tav. 14', x: 0.206, y: 0.289 },
    { label: 'Tav. 15', x: 0.332, y: 0.144 },
    { label: 'Tav. 16', x: 0.32, y: 0.406 },
    { label: 'Tav. 18', x: 0.351, y: 0.606 },
    { label: 'Tav. 23', x: 0.477, y: 0.644 },
    { label: 'Tav. 19', x: 0.577, y: 0.111 },
    { label: 'Tav. 21', x: 0.62, y: 0.356 },
    { label: 'Tav. 24', x: 0.603, y: 0.567 },
    { label: 'Tav. 25', x: 0.768, y: 0.111 },
    { label: 'Tav. 31', x: 0.854, y: 0.222 },
    { label: 'Tav. 27', x: 0.774, y: 0.444 },
    { label: 'Tav. 29', x: 0.772, y: 0.711 },
    { label: 'Tav. 26', x: 0.953, y: 0.106 },
    { label: 'Tav. 28', x: 0.943, y: 0.4 },
    { label: 'Tav. 32', x: 0.862, y: 0.578 },
    { label: 'Tav. 30', x: 0.945, y: 0.644 },
  ]

  const insert = db.prepare('INSERT INTO tables (label, seats, x, y) VALUES (?, ?, ?, ?)')
  db.transaction(() => {
    for (const r of rows) insert.run(r.label, 10, r.x, r.y)
  })()
  return { seeded: rows.length }
}

// ---- guests: data access, returning app-shaped objects ----

const toGuest = (row) => ({
  id: row.id,
  name: row.name,
  sent: !!row.sent,
  accepted: !!row.accepted,
  party_size: row.party_size ?? 1,
  table_id: row.table_id ?? null,
  seat_index: row.seat_index ?? null,
})

export function listGuests() {
  return db.prepare('SELECT * FROM guests ORDER BY id ASC').all().map(toGuest)
}

export function addGuest(name) {
  const info = db
    .prepare('INSERT INTO guests (name, party_size) VALUES (?, ?)')
    .run(name, defaultPartySize(name))
  return toGuest(db.prepare('SELECT * FROM guests WHERE id = ?').get(info.lastInsertRowid))
}

// Update only the provided fields among a small allow-list.
const GUEST_FIELDS = ['name', 'sent', 'accepted', 'party_size', 'table_id', 'seat_index']

export function updateGuest(id, rawFields) {
  const current = db.prepare('SELECT * FROM guests WHERE id = ?').get(id)
  if (!current) return null

  const fields = { ...rawFields }
  // Moving a guest to a different table clears their old seat, unless a new
  // seat is being set in the same request.
  if ('table_id' in fields && !('seat_index' in fields)) fields.seat_index = null

  const sets = []
  const values = []
  for (const key of GUEST_FIELDS) {
    if (!(key in fields)) continue
    let v = fields[key]
    if (key === 'sent' || key === 'accepted') v = v ? 1 : 0
    if (key === 'table_id') v = v == null ? null : Number(v)
    if (key === 'seat_index') v = v == null ? null : Number(v)
    if (key === 'party_size') v = Math.max(1, Number(v) || 1)
    sets.push(`${key} = ?`)
    values.push(v)
  }
  if (sets.length) {
    db.prepare(`UPDATE guests SET ${sets.join(', ')} WHERE id = ?`).run(...values, id)
  }
  return toGuest(db.prepare('SELECT * FROM guests WHERE id = ?').get(id))
}

export function deleteGuest(id) {
  return db.prepare('DELETE FROM guests WHERE id = ?').run(id).changes > 0
}

// ---- tables: data access ----

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
