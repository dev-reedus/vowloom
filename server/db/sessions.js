import crypto from 'node:crypto'
import { ROLES, sessionAuthVersion } from '../config.js'
import { db } from './connection.js'

// Sliding inactivity window and hard lifetime cap for a session.
export const SESSION_SLIDING_MS = 30 * 24 * 60 * 60 * 1000 // 30 days
export const SESSION_ABSOLUTE_MS = 180 * 24 * 60 * 60 * 1000 // 180 days
export const SESSION_TOUCH_INTERVAL_MS = 5 * 60 * 1000 // avoid a DB write on every request

// The DB only ever stores the hash of the raw id. A leaked DB cannot resume a
// session (same at-rest philosophy as the guest tokens).
function hashId(rawId) {
  return crypto.createHash('sha256').update(String(rawId)).digest('hex')
}

const iso = (ms) => new Date(ms).toISOString()

export function createSession(role, now = Date.now()) {
  const authVersion = sessionAuthVersion(role)
  if (!ROLES.includes(role) || !authVersion) throw new Error('invalid session role')
  const rawId = crypto.randomBytes(32).toString('base64url')
  const createdAt = iso(now)
  db.prepare(
    `INSERT INTO sessions (id_hash, role, auth_version, created_at, last_seen_at, absolute_expiry)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(hashId(rawId), role, authVersion, createdAt, createdAt, iso(now + SESSION_ABSOLUTE_MS))
  return rawId
}

// Validate + slide. Returns the session (and refreshes last_seen_at) when live,
// else deletes the lapsed/expired row and returns null.
export function getValidSession(rawId, now = Date.now()) {
  if (!rawId) return null
  const idHash = hashId(rawId)
  const row = db.prepare('SELECT * FROM sessions WHERE id_hash = ?').get(idHash)
  if (!row) return null

  const lastSeen = Date.parse(row.last_seen_at)
  const absolute = Date.parse(row.absolute_expiry)
  const expectedVersion = sessionAuthVersion(row.role)
  if (!expectedVersion || row.auth_version !== expectedVersion || now > absolute || now - lastSeen > SESSION_SLIDING_MS) {
    db.prepare('DELETE FROM sessions WHERE id_hash = ?').run(idHash)
    return null
  }
  if (now - lastSeen >= SESSION_TOUCH_INTERVAL_MS) {
    db.prepare('UPDATE sessions SET last_seen_at = ? WHERE id_hash = ?').run(iso(now), idHash)
  }
  return { role: row.role, created_at: row.created_at, absolute_expiry: row.absolute_expiry }
}

export function deleteSession(rawId) {
  if (!rawId) return false
  return db.prepare('DELETE FROM sessions WHERE id_hash = ?').run(hashId(rawId)).changes > 0
}

// Housekeeping: drop rows past the absolute cap or the sliding window. Run at
// startup and opportunistically.
export function pruneExpiredSessions(now = Date.now()) {
  const coupleVersion = sessionAuthVersion('couple') || ''
  const adminVersion = sessionAuthVersion('admin') || ''
  return db
    .prepare(
      `DELETE FROM sessions
       WHERE absolute_expiry < ? OR last_seen_at < ? OR auth_version IS NULL
       OR role NOT IN ('couple', 'admin')
       OR (role = 'couple' AND auth_version <> ?)
       OR (role = 'admin' AND auth_version <> ?)`,
    )
    .run(iso(now), iso(now - SESSION_SLIDING_MS), coupleVersion, adminVersion).changes
}
