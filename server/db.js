import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
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

  CREATE TABLE IF NOT EXISTS gallery_albums (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    title      TEXT    NOT NULL,
    created_at TEXT    NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS gallery_photos (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    album_id     INTEGER NOT NULL DEFAULT 1,
    title        TEXT    NOT NULL,
    original_key TEXT    NOT NULL UNIQUE,
    thumb_key    TEXT,
    display_key  TEXT,
    width        INTEGER,
    height       INTEGER,
    bytes        INTEGER,
    content_type TEXT,
    created_at   TEXT    NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (album_id) REFERENCES gallery_albums(id)
  );

  CREATE TABLE IF NOT EXISTS access_tokens (
    token              TEXT    PRIMARY KEY,
    label              TEXT    NOT NULL,
    scope              TEXT    NOT NULL DEFAULT 'gallery',
    created_at         TEXT    NOT NULL DEFAULT (datetime('now')),
    expires_at         TEXT,
    revoked            INTEGER NOT NULL DEFAULT 0,
    note               TEXT,
    open_count         INTEGER NOT NULL DEFAULT 0,
    download_url_count INTEGER NOT NULL DEFAULT 0,
    last_seen_at       TEXT,
    last_download_at   TEXT,
    deleted_at         TEXT,
    default_lang       TEXT    NOT NULL DEFAULT 'it'
  );

  CREATE TABLE IF NOT EXISTS gallery_download_events (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    token      TEXT    NOT NULL,
    photo_id   INTEGER NOT NULL,
    created_at TEXT    NOT NULL DEFAULT (datetime('now')),
    ip_hash    TEXT,
    user_agent TEXT,
    FOREIGN KEY (token) REFERENCES access_tokens(token),
    FOREIGN KEY (photo_id) REFERENCES gallery_photos(id)
  );

  CREATE TABLE IF NOT EXISTS gallery_settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
`)

// Default headcount for a party: names joined with "/" (a couple) default to 2,
// everyone else to 1. Always editable in the app afterwards.
export function defaultPartySize(name) {
  return /\//.test(name) ? 2 : 1
}

// The four reply states. `pending` is the default until the guest replies.
// `reply_status` is the source of truth; the legacy `accepted` column is kept
// in sync (accepted = 1 only for 'accepted') so older read paths still work.
export const REPLY_STATUSES = ['pending', 'accepted', 'maybe', 'declined']

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
  if (!columnExists('guests', 'reply_status')) {
    db.exec("ALTER TABLE guests ADD COLUMN reply_status TEXT NOT NULL DEFAULT 'pending'")
    // backfill from the old boolean: accepted rows become 'accepted',
    // everyone else stays 'pending'.
    db.exec("UPDATE guests SET reply_status = 'accepted' WHERE accepted = 1")
  }
  if (!columnExists('access_tokens', 'deleted_at')) {
    db.exec('ALTER TABLE access_tokens ADD COLUMN deleted_at TEXT')
  }
  if (!columnExists('access_tokens', 'default_lang')) {
    db.exec("ALTER TABLE access_tokens ADD COLUMN default_lang TEXT NOT NULL DEFAULT 'it'")
  }
}
migrate()

function ensureDefaultAlbum() {
  const row = db.prepare('SELECT id FROM gallery_albums WHERE id = 1').get()
  if (!row) db.prepare('INSERT INTO gallery_albums (id, title) VALUES (1, ?)').run('Wedding')
}
ensureDefaultAlbum()

const nowSql = () => new Date().toISOString().replace('T', ' ').slice(0, 19)

function normalizeSqlDate(value) {
  const clean = String(value || '').trim()
  if (!clean) return null
  return clean.replace('T', ' ').slice(0, 19)
}

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

// ---- guests: data access, returning app-shaped objects ----

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
// the source of truth for the reply; `accepted` is derived from it below.
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

// A consistent, standalone snapshot of the whole database (guests + tables),
// for off-device backup. Checkpoint the WAL first so recent writes are folded
// into the main file, then serialize the committed state into a Buffer.
export function backupDatabase() {
  try {
    db.pragma('wal_checkpoint(TRUNCATE)')
  } catch {
    /* checkpoint is best-effort; serialize still returns committed data */
  }
  return db.serialize()
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

// ---- gallery ----

const toAccessToken = (row) => ({
  token: row.token,
  token_preview: `${row.token.slice(0, 6)}...${row.token.slice(-4)}`,
  label: row.label,
  scope: row.scope,
  created_at: row.created_at,
  expires_at: row.expires_at,
  revoked: !!row.revoked,
  note: row.note || '',
  open_count: row.open_count || 0,
  download_url_count: row.download_url_count || 0,
  last_seen_at: row.last_seen_at || null,
  last_download_at: row.last_download_at || null,
  deleted_at: row.deleted_at || null,
  default_lang: ['it', 'en', 'ro'].includes(row.default_lang) ? row.default_lang : 'it',
})

const toPhoto = (row) => ({
  id: row.id,
  album_id: row.album_id,
  title: row.title,
  original_key: row.original_key,
  thumb_key: row.thumb_key || null,
  display_key: row.display_key || null,
  width: row.width || null,
  height: row.height || null,
  bytes: row.bytes || null,
  content_type: row.content_type || null,
  created_at: row.created_at,
})

export function listAccessTokens({ includeFullToken = false, includeDeleted = false } = {}) {
  const deletedFilter = includeDeleted ? '' : 'AND deleted_at IS NULL'
  return db
    .prepare(
      `SELECT * FROM access_tokens
       WHERE scope = 'gallery' ${deletedFilter}
       ORDER BY revoked ASC, created_at DESC`,
    )
    .all()
    .map((row) => {
      const token = toAccessToken(row)
      return includeFullToken ? token : { ...token, token: undefined }
    })
}

export function createAccessToken({ label, expires_at = null, note = '', default_lang = 'it' }) {
  const cleanLabel = String(label || '').trim()
  if (!cleanLabel) throw new Error('label is required')
  const lang = ['it', 'en', 'ro'].includes(default_lang) ? default_lang : 'it'
  const token = crypto.randomBytes(24).toString('base64url')
  db.prepare(
    `INSERT INTO access_tokens (token, label, expires_at, note, default_lang)
     VALUES (?, ?, ?, ?, ?)`,
  ).run(token, cleanLabel, normalizeSqlDate(expires_at), String(note || '').trim() || null, lang)
  return toAccessToken(db.prepare('SELECT * FROM access_tokens WHERE token = ?').get(token))
}

export function revokeAccessToken(token) {
  const info = db
    .prepare("UPDATE access_tokens SET revoked = 1 WHERE token = ? AND scope = 'gallery' AND deleted_at IS NULL")
    .run(token)
  if (!info.changes) return null
  return toAccessToken(db.prepare('SELECT * FROM access_tokens WHERE token = ?').get(token))
}

export function softDeleteAccessToken(token) {
  const info = db
    .prepare(
      `UPDATE access_tokens
       SET revoked = 1, deleted_at = COALESCE(deleted_at, ?)
       WHERE token = ? AND scope = 'gallery'`,
    )
    .run(nowSql(), token)
  if (!info.changes) return null
  return toAccessToken(db.prepare('SELECT * FROM access_tokens WHERE token = ?').get(token))
}

export function validateGalleryToken(token, { markSeen = false } = {}) {
  if (!token) return null
  const row = db
    .prepare(
      `SELECT * FROM access_tokens
       WHERE token = ? AND scope = 'gallery' AND revoked = 0
       AND deleted_at IS NULL
       AND (expires_at IS NULL OR expires_at > datetime('now'))`,
    )
    .get(token)
  if (!row) return null
  if (markSeen) {
    db.prepare(
      `UPDATE access_tokens
       SET open_count = open_count + 1, last_seen_at = ?
       WHERE token = ?`,
    ).run(nowSql(), token)
    return toAccessToken(db.prepare('SELECT * FROM access_tokens WHERE token = ?').get(token))
  }
  return toAccessToken(row)
}

export function listGalleryPhotos() {
  return db
    .prepare('SELECT * FROM gallery_photos ORDER BY created_at DESC, id DESC')
    .all()
    .map(toPhoto)
}

export function getGalleryPhoto(id) {
  const row = db.prepare('SELECT * FROM gallery_photos WHERE id = ?').get(id)
  return row ? toPhoto(row) : null
}

export function upsertGalleryPhoto(fields = {}) {
  const originalKey = String(fields.original_key || '').trim()
  if (!originalKey) throw new Error('original_key is required')
  const title = String(fields.title || path.basename(originalKey)).trim()
  const existing = db.prepare('SELECT id FROM gallery_photos WHERE original_key = ?').get(originalKey)
  const values = {
    album_id: Number(fields.album_id) || 1,
    title,
    original_key: originalKey,
    thumb_key: String(fields.thumb_key || '').trim() || null,
    display_key: String(fields.display_key || '').trim() || null,
    width: fields.width == null ? null : Number(fields.width) || null,
    height: fields.height == null ? null : Number(fields.height) || null,
    bytes: fields.bytes == null ? null : Number(fields.bytes) || null,
    content_type: String(fields.content_type || '').trim() || null,
  }
  if (existing) {
    db.prepare(
      `UPDATE gallery_photos
       SET album_id = @album_id, title = @title, thumb_key = @thumb_key,
           display_key = @display_key, width = @width, height = @height,
           bytes = @bytes, content_type = @content_type
       WHERE original_key = @original_key`,
    ).run(values)
    return getGalleryPhoto(existing.id)
  }
  const info = db
    .prepare(
      `INSERT INTO gallery_photos
       (album_id, title, original_key, thumb_key, display_key, width, height, bytes, content_type)
       VALUES (@album_id, @title, @original_key, @thumb_key, @display_key, @width, @height, @bytes, @content_type)`,
    )
    .run(values)
  return getGalleryPhoto(info.lastInsertRowid)
}

export function updateGalleryPhotoDerivatives(id, fields = {}) {
  const current = getGalleryPhoto(id)
  if (!current) return null
  db.prepare(
    `UPDATE gallery_photos
     SET thumb_key = COALESCE(@thumb_key, thumb_key),
         display_key = COALESCE(@display_key, display_key),
         width = COALESCE(@width, width),
         height = COALESCE(@height, height)
     WHERE id = @id`,
  ).run({
    id,
    thumb_key: String(fields.thumb_key || '').trim() || null,
    display_key: String(fields.display_key || '').trim() || null,
    width: fields.width == null ? null : Number(fields.width) || null,
    height: fields.height == null ? null : Number(fields.height) || null,
  })
  return getGalleryPhoto(id)
}

export function recordOriginalDownloadUrl({ token, photo_id, ip_hash = null, user_agent = '' }) {
  db.prepare(
    `INSERT INTO gallery_download_events (token, photo_id, ip_hash, user_agent)
     VALUES (?, ?, ?, ?)`,
  ).run(token, photo_id, ip_hash, String(user_agent || '').slice(0, 300))
  db.prepare(
    `UPDATE access_tokens
     SET download_url_count = download_url_count + 1, last_download_at = ?
     WHERE token = ?`,
  ).run(nowSql(), token)
}

export function countRecentOriginalDownloadUrls(token, sinceIso) {
  return db
    .prepare(
      `SELECT COUNT(*) AS count
       FROM gallery_download_events
       WHERE token = ? AND created_at >= ?`,
    )
    .get(token, sinceIso).count
}

function getGallerySetting(key, fallback = null) {
  const row = db.prepare('SELECT value FROM gallery_settings WHERE key = ?').get(key)
  return row ? row.value : fallback
}

function setGallerySetting(key, value) {
  db.prepare(
    `INSERT INTO gallery_settings (key, value)
     VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
  ).run(key, String(value))
  return getGallerySetting(key)
}

export function setGalleryMonthlyBudget(value) {
  const amount = Math.max(0, Number(value) || 0)
  return Number(setGallerySetting('monthly_budget_usd', amount.toFixed(2)))
}

export function getGalleryBudgetStatus({ monthStart, defaultBudgetUsd = 10 } = {}) {
  const budgetSetting = getGallerySetting('monthly_budget_usd', String(defaultBudgetUsd))
  const monthly_budget_usd = Math.max(0, Number(budgetSetting) || 0)
  const storage = db
    .prepare(
      `SELECT COUNT(*) AS photo_count,
              COALESCE(SUM(bytes), 0) AS original_storage_bytes
       FROM gallery_photos`,
    )
    .get()
  const monthly_download_url_count = db
    .prepare(
      `SELECT COUNT(*) AS count
       FROM gallery_download_events
       WHERE created_at >= ?`,
    )
    .get(monthStart || '0000-01-01 00:00:00').count

  const original_storage_bytes = Number(storage.original_storage_bytes) || 0
  const photo_count = Number(storage.photo_count) || 0
  const storage_gb = original_storage_bytes / 1024 / 1024 / 1024
  const estimated_class_a_ops = photo_count * 3
  const estimated_class_b_ops = monthly_download_url_count
  const storage_usd = storage_gb * 0.015
  const class_a_usd = Math.max(0, estimated_class_a_ops - 1_000_000) / 1000 * 0.0045
  const class_b_usd = Math.max(0, estimated_class_b_ops - 10_000_000) / 10000 * 0.00036
  const estimated_monthly_usd = Number((storage_usd + class_a_usd + class_b_usd).toFixed(4))

  return {
    monthly_budget_usd,
    estimated_monthly_usd,
    budget_exceeded: monthly_budget_usd > 0 && estimated_monthly_usd >= monthly_budget_usd,
    photo_count,
    original_storage_bytes,
    monthly_download_url_count,
    estimated_class_a_ops,
    estimated_class_b_ops,
  }
}
