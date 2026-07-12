import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import Database from 'better-sqlite3'

// Point the db module at a throwaway file and disable seeding BEFORE importing
// it (the module opens the DB and runs migrations at import time).
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'nozze-test-'))
const DB_PATH = path.join(TMP, 'test.db')
process.env.DB_PATH = DB_PATH
process.env.SEED_FILE = path.join(TMP, 'no-such-seed.txt')
delete process.env.SEED_EXAMPLE_TABLES

const LEGACY_RAW_TOKEN = 'legacy-raw-token-test'

// Pre-create a pre-migration database (base columns only, one accepted guest)
// so importing the module exercises the migration + backfill path.
{
  const raw = new Database(DB_PATH)
  raw.exec(`
    CREATE TABLE guests (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      name       TEXT    NOT NULL,
      sent       INTEGER NOT NULL DEFAULT 0,
      accepted   INTEGER NOT NULL DEFAULT 0,
      created_at TEXT    NOT NULL DEFAULT (datetime('now'))
    );
  `)
  raw.prepare('INSERT INTO guests (name, accepted) VALUES (?, 1)').run('Legacy Accepted')

  // A pre-encryption access token (raw value as the primary key) plus a download
  // event, so importing the module exercises the token-encryption migration.
  raw.exec(`
    CREATE TABLE access_tokens (
      token TEXT PRIMARY KEY, label TEXT NOT NULL, scope TEXT NOT NULL DEFAULT 'gallery',
      created_at TEXT NOT NULL DEFAULT (datetime('now')), expires_at TEXT,
      revoked INTEGER NOT NULL DEFAULT 0, note TEXT, open_count INTEGER NOT NULL DEFAULT 0,
      download_url_count INTEGER NOT NULL DEFAULT 0, last_seen_at TEXT, last_download_at TEXT,
      deleted_at TEXT, default_lang TEXT NOT NULL DEFAULT 'it'
    );
    CREATE TABLE gallery_download_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT, token TEXT NOT NULL, photo_id INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')), ip_hash TEXT, user_agent TEXT
    );
  `)
  raw.prepare('INSERT INTO access_tokens (token, label, download_url_count) VALUES (?, ?, 1)').run(LEGACY_RAW_TOKEN, 'Legacy Link')
  raw.prepare('INSERT INTO gallery_download_events (token, photo_id) VALUES (?, 1)').run(LEGACY_RAW_TOKEN)
  raw.close()
}

const {
  db,
  addGuest,
  backupDatabase,
  createAccessToken,
  deleteGalleryPhoto,
  getGalleryBudgetStatus,
  getGalleryPhoto,
  listAccessTokens,
  listGalleryPhotosPage,
  listGuests,
  listTables,
  recordOriginalDownloadUrl,
  revokeAccessToken,
  setGalleryMonthlyBudget,
  seedTablesIfEmpty,
  softDeleteAccessToken,
  updateGuest,
  upsertGalleryPhoto,
  validateGalleryToken,
} = await import('./db.js')

after(() => fs.rmSync(TMP, { recursive: true, force: true }))

test('migration backfills reply_status from the legacy accepted column', () => {
  const legacy = listGuests().find((g) => g.name === 'Legacy Accepted')
  assert.equal(legacy.reply_status, 'accepted')
  assert.equal(legacy.accepted, true)
})

test('example tables are opt-in and use a generic layout', () => {
  assert.deepEqual(seedTablesIfEmpty(), { seeded: 0, reason: 'disabled' })
  process.env.SEED_EXAMPLE_TABLES = '1'
  assert.deepEqual(seedTablesIfEmpty(), { seeded: 6, reason: 'seeded' })
  assert.deepEqual(listTables().map((table) => table.label), [
    'Table 1',
    'Table 2',
    'Table 3',
    'Table 4',
    'Table 5',
    'Table 6',
  ])
  delete process.env.SEED_EXAMPLE_TABLES
})

test('a new guest defaults to pending / not accepted', () => {
  const g = addGuest('Fresh Guest')
  assert.equal(g.reply_status, 'pending')
  assert.equal(g.accepted, false)
})

test('reply_status accepted derives accepted=true', () => {
  const g = addGuest('To Accept')
  const u = updateGuest(g.id, { reply_status: 'accepted' })
  assert.equal(u.reply_status, 'accepted')
  assert.equal(u.accepted, true)
})

test('maybe and declined derive accepted=false', () => {
  const g = addGuest('Undecided')
  assert.equal(updateGuest(g.id, { reply_status: 'maybe' }).accepted, false)
  assert.equal(updateGuest(g.id, { reply_status: 'maybe' }).reply_status, 'maybe')
  assert.equal(updateGuest(g.id, { reply_status: 'declined' }).accepted, false)
  assert.equal(updateGuest(g.id, { reply_status: 'declined' }).reply_status, 'declined')
})

test('an invalid reply_status is rejected, leaving the status unchanged', () => {
  const g = addGuest('Guarded')
  updateGuest(g.id, { reply_status: 'accepted' })
  const u = updateGuest(g.id, { reply_status: 'bogus' })
  assert.equal(u.reply_status, 'accepted')
})

test('a legacy { accepted } patch maps onto reply_status', () => {
  const g = addGuest('Legacy Patch')
  assert.equal(updateGuest(g.id, { accepted: true }).reply_status, 'accepted')
  assert.equal(updateGuest(g.id, { accepted: false }).reply_status, 'pending')
})

test('backupDatabase yields a valid, reopenable snapshot of the data', () => {
  addGuest('Snapshot Marker')
  const buf = backupDatabase()
  assert.ok(Buffer.isBuffer(buf) && buf.length > 0)

  const snapPath = path.join(TMP, 'snapshot.db')
  fs.writeFileSync(snapPath, buf)
  const snap = new Database(snapPath, { readonly: true })
  const snapCount = snap.prepare('SELECT COUNT(*) AS c FROM guests').get().c
  const hasMarker = snap.prepare("SELECT 1 FROM guests WHERE name = 'Snapshot Marker'").get()
  snap.close()

  assert.equal(snapCount, listGuests().length)
  assert.ok(hasMarker)
})

test('gallery tokens validate until they are revoked', () => {
  const token = createAccessToken({ label: 'Test Couple', default_lang: 'ro' })
  assert.equal(token.label, 'Test Couple')
  assert.equal(token.default_lang, 'ro')
  assert.ok(token.token.length > 24)

  const valid = validateGalleryToken(token.token, { markSeen: true })
  assert.equal(valid.label, 'Test Couple')
  assert.equal(valid.default_lang, 'ro')
  assert.equal(valid.open_count, 1)

  revokeAccessToken(token.token)
  assert.equal(validateGalleryToken(token.token), null)
})

test('access tokens are encrypted at rest, not stored in plaintext', () => {
  const token = createAccessToken({ label: 'At Rest' })
  const row = db.prepare('SELECT token, token_enc, token_preview FROM access_tokens WHERE token_preview = ?')
    .get(token.token_preview)
  // The stored key is a 64-hex lookup hash, never the raw token; the reversible
  // copy lives in token_enc.
  assert.notEqual(row.token, token.token)
  assert.equal(row.token.length, 64)
  assert.ok(row.token_enc)
  // And the admin path can still recover the raw token to rebuild the link.
  const listed = listAccessTokens({ includeFullToken: true }).find((t) => t.token_preview === token.token_preview)
  assert.equal(listed.token, token.token)
})

test('a legacy plaintext token is migrated to encrypted form and still works', () => {
  // Seeded as raw in the pre-import block; must validate after migration.
  const valid = validateGalleryToken(LEGACY_RAW_TOKEN)
  assert.equal(valid.label, 'Legacy Link')
  // Its download event was re-pointed, so the counter is preserved.
  assert.equal(valid.download_url_count, 1)
  // The raw value is no longer the stored key.
  const rawStillStored = db.prepare('SELECT 1 FROM access_tokens WHERE token = ?').get(LEGACY_RAW_TOKEN)
  assert.equal(rawStillStored, undefined)
})

test('soft-deleted gallery tokens are hidden and invalid', () => {
  const token = createAccessToken({ label: 'Delete Tester' })
  assert.ok(listAccessTokens({ includeFullToken: true }).some((item) => item.token === token.token))

  const deleted = softDeleteAccessToken(token.token)
  assert.equal(deleted.revoked, true)
  assert.ok(deleted.deleted_at)
  assert.equal(validateGalleryToken(token.token), null)
  assert.equal(listAccessTokens({ includeFullToken: true }).some((item) => item.token === token.token), false)
  assert.ok(listAccessTokens({ includeFullToken: true, includeDeleted: true }).some((item) => item.token === token.token))
})

test('gallery photo metadata can be saved and download URL events are counted', () => {
  const token = createAccessToken({ label: 'Download Tester' })
  const photo = upsertGalleryPhoto({
    title: 'First Dance',
    original_key: 'originals/first-dance.jpg',
    thumb_key: 'thumbs/first-dance.jpg',
    display_key: 'display/first-dance.jpg',
  })

  assert.equal(getGalleryPhoto(photo.id).title, 'First Dance')
  recordOriginalDownloadUrl({ token: token.token, photo_id: photo.id, ip_hash: 'abc', user_agent: 'test' })
  assert.equal(validateGalleryToken(token.token).download_url_count, 1)
})

test('gallery photos can be deleted with their download events', () => {
  const token = createAccessToken({ label: 'Photo Delete Tester' })
  const photo = upsertGalleryPhoto({
    title: 'Delete Me',
    original_key: 'originals/delete-me.jpg',
    thumb_key: 'thumbs/delete-me.jpg',
    display_key: 'display/delete-me.jpg',
  })
  recordOriginalDownloadUrl({ token: token.token, photo_id: photo.id, ip_hash: 'abc', user_agent: 'test' })

  const deleted = deleteGalleryPhoto(photo.id)
  assert.equal(deleted.id, photo.id)
  assert.equal(deleted.original_key, 'originals/delete-me.jpg')
  assert.equal(getGalleryPhoto(photo.id), null)
  assert.equal(deleteGalleryPhoto(photo.id), null)
})

test('gallery photos can be listed in pages', () => {
  const first = upsertGalleryPhoto({ title: 'Page A', original_key: 'originals/page-a.jpg' })
  const second = upsertGalleryPhoto({ title: 'Page B', original_key: 'originals/page-b.jpg' })

  const page = listGalleryPhotosPage({ limit: 1, offset: 0 })
  assert.equal(page.photos.length, 1)
  assert.equal(page.total >= 2, true)
  assert.equal(page.has_more, true)
  assert.equal(page.next_offset, 1)
  assert.equal(page.photos[0].id, second.id)

  const nextPage = listGalleryPhotosPage({ limit: 1, offset: 1 })
  assert.equal(nextPage.photos.length, 1)
  assert.equal(nextPage.photos[0].id, first.id)
})

test('gallery budget status estimates storage and persists the monthly budget', () => {
  upsertGalleryPhoto({
    title: 'Budget Marker',
    original_key: 'originals/budget-marker.jpg',
    bytes: 2 * 1024 * 1024 * 1024,
  })

  const defaultStatus = getGalleryBudgetStatus({
    monthStart: '0000-01-01 00:00:00',
    defaultBudgetUsd: 10,
  })
  assert.equal(defaultStatus.monthly_budget_usd, 10)
  assert.ok(defaultStatus.original_storage_bytes >= 2 * 1024 * 1024 * 1024)
  assert.ok(defaultStatus.estimated_monthly_usd > 0)

  setGalleryMonthlyBudget(0.01)
  const tightStatus = getGalleryBudgetStatus({
    monthStart: '0000-01-01 00:00:00',
    defaultBudgetUsd: 10,
  })
  assert.equal(tightStatus.monthly_budget_usd, 0.01)
  assert.equal(tightStatus.budget_exceeded, true)
})
