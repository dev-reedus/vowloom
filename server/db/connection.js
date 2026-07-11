import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import Database from 'better-sqlite3'
import { encryptToken, tokenLookup, tokenPreview } from './tokenCrypto.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// DB lives in a directory that is mounted as a Docker volume, so the data
// survives container stop/rm. Override with DB_PATH if needed.
const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', '..', 'data', 'nozze.db')

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
  // Token-at-rest protection: store an encrypted copy + a keyed lookup hash
  // instead of the raw token. Legacy rows (token_enc IS NULL) still hold the raw
  // token as their key - encrypt them, replace the key with the lookup hash, and
  // re-point their download events so counters keep matching.
  if (!columnExists('access_tokens', 'token_enc')) {
    db.exec('ALTER TABLE access_tokens ADD COLUMN token_enc TEXT')
  }
  if (!columnExists('access_tokens', 'token_preview')) {
    db.exec('ALTER TABLE access_tokens ADD COLUMN token_preview TEXT')
  }
  const legacyTokens = db.prepare('SELECT token FROM access_tokens WHERE token_enc IS NULL').all()
  if (legacyTokens.length) {
    const updEvents = db.prepare('UPDATE gallery_download_events SET token = ? WHERE token = ?')
    const updToken = db.prepare(
      'UPDATE access_tokens SET token = ?, token_enc = ?, token_preview = ? WHERE token = ?',
    )
    db.transaction(() => {
      for (const { token: raw } of legacyTokens) {
        const lookup = tokenLookup(raw)
        updEvents.run(lookup, raw)
        updToken.run(lookup, encryptToken(raw), tokenPreview(raw), raw)
      }
    })()
    // Scrub the old plaintext tokens from freed pages / WAL by rewriting the
    // file. One-time cost, only when a migration actually happened.
    db.pragma('wal_checkpoint(TRUNCATE)')
    db.exec('VACUUM')
    db.pragma('wal_checkpoint(TRUNCATE)')
  }
}
migrate()

function ensureDefaultAlbum() {
  const row = db.prepare('SELECT id FROM gallery_albums WHERE id = 1').get()
  if (!row) db.prepare('INSERT INTO gallery_albums (id, title) VALUES (1, ?)').run('Wedding')
}
ensureDefaultAlbum()

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
