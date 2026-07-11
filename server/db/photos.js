import path from 'node:path'
import { db } from './connection.js'

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

export function listGalleryPhotos() {
  return db
    .prepare('SELECT * FROM gallery_photos ORDER BY created_at DESC, id DESC')
    .all()
    .map(toPhoto)
}

export function listGalleryPhotosPage({ limit = 48, offset = 0 } = {}) {
  const safeLimit = Math.max(1, Math.min(Number(limit) || 48, 100))
  const safeOffset = Math.max(0, Number(offset) || 0)
  const photos = db
    .prepare('SELECT * FROM gallery_photos ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?')
    .all(safeLimit, safeOffset)
    .map(toPhoto)
  const { total } = db.prepare('SELECT COUNT(*) AS total FROM gallery_photos').get()
  return {
    photos,
    total,
    limit: safeLimit,
    offset: safeOffset,
    next_offset: safeOffset + photos.length,
    has_more: safeOffset + photos.length < total,
  }
}

export function getGalleryPhoto(id) {
  const row = db.prepare('SELECT * FROM gallery_photos WHERE id = ?').get(id)
  return row ? toPhoto(row) : null
}

export function deleteGalleryPhoto(id) {
  const photo = getGalleryPhoto(id)
  if (!photo) return null
  db.transaction(() => {
    db.prepare('DELETE FROM gallery_download_events WHERE photo_id = ?').run(photo.id)
    db.prepare('DELETE FROM gallery_photos WHERE id = ?').run(photo.id)
  })()
  return photo
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
