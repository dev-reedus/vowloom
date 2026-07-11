import crypto from 'node:crypto'
import { db } from './connection.js'
import { nowSql, normalizeSqlDate } from './helpers.js'
import { decryptToken, encryptToken, tokenLookup, tokenPreview } from './tokenCrypto.js'

const SUPPORTED_LANGS = ['it', 'en', 'ro']

// Map a DB row to the app shape. The stored `token` column holds the keyed
// lookup hash, never the raw token; the raw value is only recovered (by
// decrypting token_enc) for admin views that rebuild the share link.
function toAccessToken(row, { includeToken = false } = {}) {
  return {
    token: includeToken ? decryptToken(row.token_enc) : undefined,
    token_preview: row.token_preview || '',
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
    default_lang: SUPPORTED_LANGS.includes(row.default_lang) ? row.default_lang : 'it',
  }
}

const getRow = (lookup) => db.prepare('SELECT * FROM access_tokens WHERE token = ?').get(lookup)

export function listAccessTokens({ includeFullToken = false, includeDeleted = false } = {}) {
  const deletedFilter = includeDeleted ? '' : 'AND deleted_at IS NULL'
  return db
    .prepare(
      `SELECT * FROM access_tokens
       WHERE scope = 'gallery' ${deletedFilter}
       ORDER BY revoked ASC, created_at DESC`,
    )
    .all()
    .map((row) => toAccessToken(row, { includeToken: includeFullToken }))
}

export function createAccessToken({ label, expires_at = null, note = '', default_lang = 'it' }) {
  const cleanLabel = String(label || '').trim()
  if (!cleanLabel) throw new Error('label is required')
  const lang = SUPPORTED_LANGS.includes(default_lang) ? default_lang : 'it'
  const raw = crypto.randomBytes(24).toString('base64url')
  const lookup = tokenLookup(raw)
  db.prepare(
    `INSERT INTO access_tokens (token, token_enc, token_preview, label, expires_at, note, default_lang)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    lookup,
    encryptToken(raw),
    tokenPreview(raw),
    cleanLabel,
    normalizeSqlDate(expires_at),
    String(note || '').trim() || null,
    lang,
  )
  // Return the raw token once so the caller can build the shareable link.
  return { ...toAccessToken(getRow(lookup)), token: raw }
}

export function revokeAccessToken(rawToken) {
  const lookup = tokenLookup(rawToken)
  const info = db
    .prepare("UPDATE access_tokens SET revoked = 1 WHERE token = ? AND scope = 'gallery' AND deleted_at IS NULL")
    .run(lookup)
  if (!info.changes) return null
  return toAccessToken(getRow(lookup), { includeToken: true })
}

export function softDeleteAccessToken(rawToken) {
  const lookup = tokenLookup(rawToken)
  const info = db
    .prepare(
      `UPDATE access_tokens
       SET revoked = 1, deleted_at = COALESCE(deleted_at, ?)
       WHERE token = ? AND scope = 'gallery'`,
    )
    .run(nowSql(), lookup)
  if (!info.changes) return null
  return toAccessToken(getRow(lookup), { includeToken: true })
}

export function validateGalleryToken(rawToken, { markSeen = false } = {}) {
  if (!rawToken) return null
  const lookup = tokenLookup(rawToken)
  const row = db
    .prepare(
      `SELECT * FROM access_tokens
       WHERE token = ? AND scope = 'gallery' AND revoked = 0
       AND deleted_at IS NULL
       AND (expires_at IS NULL OR expires_at > datetime('now'))`,
    )
    .get(lookup)
  if (!row) return null
  if (markSeen) {
    db.prepare(
      `UPDATE access_tokens
       SET open_count = open_count + 1, last_seen_at = ?
       WHERE token = ?`,
    ).run(nowSql(), lookup)
    return toAccessToken(getRow(lookup))
  }
  return toAccessToken(row)
}
