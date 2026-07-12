import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

// Config reads env at import time, so set env BEFORE importing it.
process.env.COUPLE_PASSWORD = 'couple-secret-123'
process.env.ADMIN_PASSWORD = 'admin-secret-456'
delete process.env.ALLOW_INSECURE_AUTH

const { resolveRole, assertAuthConfig, ROLES } = await import('./config.js')

test('resolveRole maps each password to its role', () => {
  assert.equal(resolveRole('couple-secret-123'), 'couple')
  assert.equal(resolveRole('admin-secret-456'), 'admin')
})

test('resolveRole returns null for unknown or empty passwords', () => {
  assert.equal(resolveRole('nope'), null)
  assert.equal(resolveRole(''), null)
})

test('ROLES lists both roles', () => {
  assert.deepEqual([...ROLES].sort(), ['admin', 'couple'])
})

test('assertAuthConfig passes with two distinct strong passwords', () => {
  assert.doesNotThrow(() => assertAuthConfig())
})

test('assertAuthConfig throws when the two passwords are identical', async () => {
  process.env.COUPLE_PASSWORD = 'same-secret-000'
  process.env.ADMIN_PASSWORD = 'same-secret-000'
  const fresh = await import(`./config.js?identical=${Date.now()}`)
  assert.throws(() => fresh.assertAuthConfig(), /distinct/)
})

// --- session data module (opens a throwaway DB; set DB_PATH before importing) ---
const SESS_TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'nozze-sess-'))
process.env.DB_PATH = path.join(SESS_TMP, 'sessions.db')
process.env.SEED_FILE = path.join(SESS_TMP, 'no-seed.txt')

const { createSession, getValidSession, deleteSession, pruneExpiredSessions, SESSION_SLIDING_MS, SESSION_ABSOLUTE_MS, db } =
  await import('./db.js')

test('createSession stores only the hash, never the raw id', () => {
  const raw = createSession('couple')
  const row = db.prepare('SELECT id_hash, role FROM sessions').all().find((r) => r.role === 'couple')
  assert.ok(row)
  assert.notEqual(row.id_hash, raw) // raw id is not in the DB
})

test('getValidSession returns the role and rejects unknown ids', () => {
  const raw = createSession('admin')
  assert.equal(getValidSession(raw).role, 'admin')
  assert.equal(getValidSession('not-a-real-id'), null)
})

test('sliding-window lapse invalidates and removes the session', () => {
  const t0 = Date.now()
  const raw = createSession('couple', t0)
  assert.equal(getValidSession(raw, t0 + SESSION_SLIDING_MS + 1000), null)
  assert.equal(getValidSession(raw), null) // row deleted
})

test('absolute cap invalidates even an actively-used session', () => {
  const t0 = Date.now()
  const raw = createSession('admin', t0)
  getValidSession(raw, t0 + SESSION_SLIDING_MS - 1000) // keep it "seen"
  assert.equal(getValidSession(raw, t0 + SESSION_ABSOLUTE_MS + 1000), null)
})

test('deleteSession removes the row', () => {
  const raw = createSession('couple')
  assert.equal(deleteSession(raw), true)
  assert.equal(getValidSession(raw), null)
})

test('pruneExpiredSessions removes expired rows', () => {
  createSession('couple', Date.now() - SESSION_ABSOLUTE_MS - 10_000)
  assert.ok(pruneExpiredSessions() >= 1)
})
