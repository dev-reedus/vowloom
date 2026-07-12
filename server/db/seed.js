import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { db, defaultPartySize } from './connection.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const SEED_FILE = process.env.SEED_FILE || path.join(__dirname, '..', '..', 'lista.txt')

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
  const insert = db.prepare(
    'INSERT INTO guests (name, sent, accepted, reply_status, party_size) VALUES (?, ?, ?, ?, ?)',
  )
  db.transaction((rows) => {
    for (const g of rows)
      insert.run(
        g.name,
        g.sent ? 1 : 0,
        g.accepted ? 1 : 0,
        g.accepted ? 'accepted' : 'pending',
        defaultPartySize(g.name),
      )
  })(guests)
  return { seeded: guests.length, reason: 'seeded' }
}

// Optional generic demo layout. Disabled by default so a real deployment starts
// with a blank room instead of inheriting example venue data.
export function seedTablesIfEmpty() {
  const enabled = /^(1|true|yes)$/i.test(process.env.SEED_EXAMPLE_TABLES || '')
  if (!enabled) return { seeded: 0, reason: 'disabled' }
  const { count } = db.prepare('SELECT COUNT(*) AS count FROM tables').get()
  if (count > 0) return { seeded: 0, reason: 'not-empty' }

  const rows = [
    { label: 'Table 1', x: 0.2, y: 0.25 },
    { label: 'Table 2', x: 0.5, y: 0.25 },
    { label: 'Table 3', x: 0.8, y: 0.25 },
    { label: 'Table 4', x: 0.2, y: 0.65 },
    { label: 'Table 5', x: 0.5, y: 0.65 },
    { label: 'Table 6', x: 0.8, y: 0.65 },
  ]

  const insert = db.prepare('INSERT INTO tables (label, seats, x, y) VALUES (?, ?, ?, ?)')
  db.transaction(() => {
    for (const r of rows) insert.run(r.label, 10, r.x, r.y)
  })()
  return { seeded: rows.length, reason: 'seeded' }
}
