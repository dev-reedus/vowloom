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
