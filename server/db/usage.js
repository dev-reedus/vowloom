import { db } from './connection.js'
import { nowSql } from './helpers.js'

// ---- download-URL events (used for usage counters and budget) ----

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

// ---- gallery settings + budget ----

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
