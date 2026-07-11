import crypto from 'node:crypto'
import { db } from './connection.js'
import { nowSql, normalizeSqlDate } from './helpers.js'

const SUPPORTED_LANGS = ['it', 'en', 'ro']

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
  default_lang: SUPPORTED_LANGS.includes(row.default_lang) ? row.default_lang : 'it',
})

const getTokenRow = (token) => db.prepare('SELECT * FROM access_tokens WHERE token = ?').get(token)

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
  const lang = SUPPORTED_LANGS.includes(default_lang) ? default_lang : 'it'
  const token = crypto.randomBytes(24).toString('base64url')
  db.prepare(
    `INSERT INTO access_tokens (token, label, expires_at, note, default_lang)
     VALUES (?, ?, ?, ?, ?)`,
  ).run(token, cleanLabel, normalizeSqlDate(expires_at), String(note || '').trim() || null, lang)
  return toAccessToken(getTokenRow(token))
}

export function revokeAccessToken(token) {
  const info = db
    .prepare("UPDATE access_tokens SET revoked = 1 WHERE token = ? AND scope = 'gallery' AND deleted_at IS NULL")
    .run(token)
  if (!info.changes) return null
  return toAccessToken(getTokenRow(token))
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
  return toAccessToken(getTokenRow(token))
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
    return toAccessToken(getTokenRow(token))
  }
  return toAccessToken(row)
}
