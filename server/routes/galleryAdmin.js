import path from 'node:path'
import crypto from 'node:crypto'
import { Router } from 'express'
import {
  deleteGalleryPhoto,
  getGalleryPhoto,
  listGalleryPhotos,
  listGalleryPhotosPage,
  setGalleryMonthlyBudget,
  updateGalleryPhotoDerivatives,
  upsertGalleryPhoto,
} from '../db.js'
import { generateGalleryDerivatives } from '../galleryImages.js'
import { deleteR2Object, isR2Configured, listR2Objects, presignR2Url } from '../r2.js'
import { DOWNLOAD_URL_EXPIRES_SECONDS } from '../config.js'
import { requireSession, requireRole } from '../middleware/session.js'
import {
  blockIfGalleryBudgetExceeded,
  galleryBudgetStatus,
  galleryDownloadFilename,
  galleryPhotoPayload,
  galleryPagePayload,
  paginationParams,
  titleFromR2Key,
} from '../lib/gallery.js'

// Gallery photo admin API - every route needs a session; the plumbing routes
// (metadata save, budget, import-R2) additionally require the admin role.
// Per-route guards: this router mounts at '/', so a router-level `.use` would
// also gate the public SPA shell, /assets, and the guest gallery.
export const galleryAdminRouter = Router()

const session = requireSession
const admin = [requireSession, requireRole('admin')]

galleryAdminRouter.get('/api/admin/gallery/status', session, (_req, res) => {
  res.json({
    r2_configured: isR2Configured(),
    budget: galleryBudgetStatus(),
  })
})

galleryAdminRouter.post('/api/admin/gallery/settings/budget', admin, (req, res) => {
  setGalleryMonthlyBudget(req.body?.monthly_budget_usd)
  res.json(galleryBudgetStatus())
})

galleryAdminRouter.get('/api/admin/gallery/photos', session, (req, res) => {
  const photos = listGalleryPhotos()
  res.json(req.query.include_urls === '1' ? photos.map(adminPhotoPayload) : photos)
})

galleryAdminRouter.delete('/api/admin/gallery/photos/:id', session, async (req, res) => {
  const photo = deleteGalleryPhoto(Number(req.params.id))
  if (!photo) return res.status(404).json({ error: 'photo not found' })

  const cleanupErrors = []
  if (isR2Configured()) {
    const keys = [...new Set([photo.original_key, photo.thumb_key, photo.display_key].filter(Boolean))]
    await Promise.all(
      keys.map(async (key) => {
        try {
          await deleteR2Object(key)
        } catch (err) {
          cleanupErrors.push({ key, error: err.message || 'delete failed' })
        }
      }),
    )
  }

  res.json({ deleted: photo, cleanup_errors: cleanupErrors })
})

galleryAdminRouter.get('/api/admin/gallery/preview', session, (req, res) => {
  const page = galleryPagePayload(listGalleryPhotosPage(paginationParams(req)))
  res.json({
    album: { id: 1 },
    guest: { label: null, default_lang: 'it', preview: true },
    ...page,
  })
})

galleryAdminRouter.post('/api/admin/gallery/photos/:id/download-url', session, (req, res) => {
  if (!isR2Configured()) return res.status(503).json({ error: 'R2 is not configured' })
  const photo = getGalleryPhoto(Number(req.params.id))
  if (!photo?.original_key) return res.status(404).json({ error: 'photo not found' })

  res.json({
    url: presignR2Url({
      method: 'GET',
      key: photo.original_key,
      expiresIn: DOWNLOAD_URL_EXPIRES_SECONDS,
      filename: galleryDownloadFilename(photo),
      disposition: 'attachment',
    }),
    expires_in: DOWNLOAD_URL_EXPIRES_SECONDS,
  })
})

galleryAdminRouter.post('/api/admin/gallery/photos', admin, (req, res) => {
  try {
    res.status(201).json(adminPhotoPayload(upsertGalleryPhoto(req.body ?? {})))
  } catch (err) {
    res.status(400).json({ error: err.message || 'could not save photo' })
  }
})

galleryAdminRouter.post('/api/admin/gallery/photos/:id/generate-derivatives', session, async (req, res) => {
  if (!isR2Configured()) return res.status(503).json({ error: 'R2 is not configured' })
  if (blockIfGalleryBudgetExceeded(res)) return
  const photo = getGalleryPhoto(Number(req.params.id))
  if (!photo) return res.status(404).json({ error: 'photo not found' })

  try {
    const derivatives = await generateGalleryDerivatives(photo)
    res.json(adminPhotoPayload(updateGalleryPhotoDerivatives(photo.id, derivatives)))
  } catch (err) {
    console.error('[gallery] derivative generation failed', err)
    res.status(500).json({ error: err.message || 'could not generate derivatives' })
  }
})

galleryAdminRouter.post('/api/admin/gallery/upload-url', session, (req, res) => {
  if (!isR2Configured()) return res.status(503).json({ error: 'R2 is not configured' })
  if (blockIfGalleryBudgetExceeded(res)) return
  const filename = String(req.body?.filename || '').trim()
  if (!filename) return res.status(400).json({ error: 'filename is required' })

  const safeName = path.basename(filename).replace(/[^\w.\-()[\] ]+/g, '_')
  const key = `originals/${Date.now()}-${crypto.randomBytes(6).toString('hex')}-${safeName}`
  const photo = upsertGalleryPhoto({
    title: req.body?.title || safeName,
    original_key: key,
    content_type: req.body?.content_type || null,
    bytes: req.body?.bytes || null,
  })

  res.status(201).json({
    photo: adminPhotoPayload(photo),
    key,
    upload_url: presignR2Url({ method: 'PUT', key, expiresIn: 600, disposition: null }),
    expires_in: 600,
  })
})

galleryAdminRouter.post('/api/admin/gallery/import-r2', admin, async (req, res) => {
  if (!isR2Configured()) return res.status(503).json({ error: 'R2 is not configured' })
  if (blockIfGalleryBudgetExceeded(res)) return

  const prefix = String(req.body?.prefix || 'originals/').trim() || 'originals/'
  try {
    const existing = new Set(listGalleryPhotos().map((photo) => photo.original_key))
    const objects = (await listR2Objects({ prefix })).filter((object) => object.key && !object.key.endsWith('/'))
    const imported = []
    let skipped = 0

    for (const object of objects) {
      if (existing.has(object.key)) {
        skipped += 1
        continue
      }
      const photo = upsertGalleryPhoto({
        title: titleFromR2Key(object.key),
        original_key: object.key,
        bytes: object.size || null,
      })
      existing.add(object.key)
      imported.push(photo)
    }

    res.status(201).json({
      imported: imported.map(adminPhotoPayload),
      imported_count: imported.length,
      skipped_count: skipped,
      scanned_count: objects.length,
      prefix,
    })
  } catch (err) {
    console.error('[gallery] R2 import failed', err)
    res.status(500).json({ error: err.message || 'could not import R2 originals' })
  }
})

function adminPhotoPayload(photo) {
  return { ...photo, ...galleryPhotoPayload(photo) }
}
