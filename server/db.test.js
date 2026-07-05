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
  raw.close()
}

const { addGuest, updateGuest, listGuests, backupDatabase } = await import('./db.js')

after(() => fs.rmSync(TMP, { recursive: true, force: true }))

test('migration backfills reply_status from the legacy accepted column', () => {
  const legacy = listGuests().find((g) => g.name === 'Legacy Accepted')
  assert.equal(legacy.reply_status, 'accepted')
  assert.equal(legacy.accepted, true)
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
