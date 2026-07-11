import path from 'node:path'
import crypto from 'node:crypto'
import { getGalleryBudgetStatus } from '../db.js'
import { isR2Configured, presignR2Url, publicR2Url } from '../r2.js'
import { DEFAULT_MONTHLY_BUDGET_USD, DISPLAY_URL_EXPIRES_SECONDS } from '../config.js'

// A short, non-reversible fingerprint of the caller's IP for download logging.
export function ipHash(req) {
  const ip = req.ip || req.socket?.remoteAddress || ''
  return crypto.createHash('sha256').update(ip).digest('hex').slice(0, 24)
}

// SQLite-format date, and the first instant of the current month.
export function toSqlDate(date) {
  return date.toISOString().replace('T', ' ').slice(0, 19)
}

export function monthStartSql(date = new Date()) {
  return toSqlDate(new Date(date.getFullYear(), date.getMonth(), 1))
}

// Current-month R2 spend estimate vs. the configured budget.
export function galleryBudgetStatus() {
  return getGalleryBudgetStatus({
    monthStart: monthStartSql(),
    defaultBudgetUsd: DEFAULT_MONTHLY_BUDGET_USD,
  })
}

// Guard used by write/derivative endpoints: responds 429 and returns true when
// the monthly budget is spent, so the caller can `return` early.
export function blockIfGalleryBudgetExceeded(res) {
  const budget = galleryBudgetStatus()
  if (!budget.budget_exceeded) return false
  res.status(429).json({ error: 'gallery monthly budget reached', budget })
  return true
}

// Best-effort human title from an R2 object key (used when importing).
export function titleFromR2Key(key) {
  return path.basename(String(key || 'photo'), path.extname(String(key || ''))).replace(/[-_]+/g, ' ').trim() || 'Photo'
}

// Shape a stored photo row into the public payload, resolving thumb/display URLs
// from public R2 or a presigned GET when the bucket is private.
export function galleryPhotoPayload(photo) {
  const displayKey = photo.display_key || photo.thumb_key
  const thumbKey = photo.thumb_key || photo.display_key
  return {
    id: photo.id,
    title: photo.title,
    width: photo.width,
    height: photo.height,
    bytes: photo.bytes,
    thumb_url: publicR2Url(thumbKey) || (thumbKey && isR2Configured()
      ? presignR2Url({ method: 'GET', key: thumbKey, expiresIn: DISPLAY_URL_EXPIRES_SECONDS, disposition: null })
      : null),
    display_url: publicR2Url(displayKey) || (displayKey && isR2Configured()
      ? presignR2Url({ method: 'GET', key: displayKey, expiresIn: DISPLAY_URL_EXPIRES_SECONDS, disposition: null })
      : null),
    has_original: !!photo.original_key,
  }
}

export function paginationParams(req) {
  return {
    limit: req.query.limit,
    offset: req.query.offset,
  }
}

export function galleryPagePayload(page) {
  return {
    photos: page.photos.map(galleryPhotoPayload),
    total: page.total,
    limit: page.limit,
    offset: page.offset,
    next_offset: page.next_offset,
    has_more: page.has_more,
  }
}
