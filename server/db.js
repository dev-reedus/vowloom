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
`)

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
  if (count > 0) {
    return { seeded: 0, reason: 'not-empty' }
  }
  if (!fs.existsSync(SEED_FILE)) {
    return { seeded: 0, reason: 'no-seed-file' }
  }

  const guests = parseGuestList(fs.readFileSync(SEED_FILE, 'utf8'))
  const insert = db.prepare('INSERT INTO guests (name, sent, accepted) VALUES (?, ?, ?)')
  const insertMany = db.transaction((rows) => {
    for (const g of rows) insert.run(g.name, g.sent ? 1 : 0, g.accepted ? 1 : 0)
  })
  insertMany(guests)
  return { seeded: guests.length, reason: 'seeded' }
}

// ---- data access, returning app-shaped objects (booleans, not 0/1) ----

const toGuest = (row) => ({
  id: row.id,
  name: row.name,
  sent: !!row.sent,
  accepted: !!row.accepted,
})

export function listGuests() {
  return db.prepare('SELECT * FROM guests ORDER BY id ASC').all().map(toGuest)
}

export function addGuest(name) {
  const info = db.prepare('INSERT INTO guests (name) VALUES (?)').run(name)
  return toGuest(db.prepare('SELECT * FROM guests WHERE id = ?').get(info.lastInsertRowid))
}

export function updateGuest(id, fields) {
  const current = db.prepare('SELECT * FROM guests WHERE id = ?').get(id)
  if (!current) return null
  const sent = fields.sent === undefined ? current.sent : fields.sent ? 1 : 0
  const accepted = fields.accepted === undefined ? current.accepted : fields.accepted ? 1 : 0
  db.prepare('UPDATE guests SET sent = ?, accepted = ? WHERE id = ?').run(sent, accepted, id)
  return toGuest(db.prepare('SELECT * FROM guests WHERE id = ?').get(id))
}

export function deleteGuest(id) {
  return db.prepare('DELETE FROM guests WHERE id = ?').run(id).changes > 0
}
