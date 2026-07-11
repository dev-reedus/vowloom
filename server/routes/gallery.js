import path from 'node:path'
import { Router } from 'express'
import {
  countRecentOriginalDownloadUrls,
  getGalleryPhoto,
  listGalleryPhotosPage,
  recordOriginalDownloadUrl,
  validateGalleryToken,
} from '../db.js'
import { isR2Configured, presignR2Url } from '../r2.js'
import { DAILY_DOWNLOAD_URL_LIMIT, DOWNLOAD_URL_EXPIRES_SECONDS } from '../config.js'
import {
  blockIfGalleryBudgetExceeded,
  galleryPagePayload,
  ipHash,
  paginationParams,
  toSqlDate,
} from '../lib/gallery.js'

// Public gallery API - capability-token protected, no Basic Auth prompt.
export const galleryRouter = Router()

galleryRouter.get('/api/gallery', (req, res) => {
  const token = String(req.query.token || '')
  const offset = Math.max(0, Number(req.query.offset) || 0)
  const access = validateGalleryToken(token, { markSeen: offset === 0 })
  if (!access) return res.status(401).json({ error: 'invalid or expired gallery link' })

  const page = galleryPagePayload(listGalleryPhotosPage(paginationParams(req)))

  res.json({
    album: { id: 1, title: 'Wedding' },
    guest: { label: access.label, default_lang: access.default_lang },
    ...page,
  })
})

galleryRouter.post('/api/gallery/photos/:id/download-url', (req, res) => {
  const token = String(req.body?.token || req.query.token || '')
  const access = validateGalleryToken(token)
  if (!access) return res.status(401).json({ error: 'invalid or expired gallery link' })
  if (!isR2Configured()) return res.status(503).json({ error: 'R2 is not configured' })
  if (blockIfGalleryBudgetExceeded(res)) return

  const since = toSqlDate(new Date(Date.now() - 24 * 60 * 60 * 1000))
  if (DAILY_DOWNLOAD_URL_LIMIT > 0 && countRecentOriginalDownloadUrls(token, since) >= DAILY_DOWNLOAD_URL_LIMIT) {
    return res.status(429).json({ error: 'daily download limit reached' })
  }

  const photo = getGalleryPhoto(Number(req.params.id))
  if (!photo) return res.status(404).json({ error: 'photo not found' })

  recordOriginalDownloadUrl({
    token,
    photo_id: photo.id,
    ip_hash: ipHash(req),
    user_agent: req.get('user-agent') || '',
  })

  res.json({
    url: presignR2Url({
      method: 'GET',
      key: photo.original_key,
      expiresIn: DOWNLOAD_URL_EXPIRES_SECONDS,
      filename: path.basename(photo.original_key),
      disposition: 'attachment',
    }),
    expires_in: DOWNLOAD_URL_EXPIRES_SECONDS,
  })
})
