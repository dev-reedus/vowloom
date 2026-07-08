import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'
import express from 'express'
import {
  addGuest,
  addTable,
  backupDatabase,
  countRecentOriginalDownloadUrls,
  createAccessToken,
  deleteGuest,
  deleteTable,
  getGalleryPhoto,
  listGuests,
  listAccessTokens,
  listGalleryPhotos,
  listTables,
  recordOriginalDownloadUrl,
  revokeAccessToken,
  seedIfEmpty,
  seedTablesIfEmpty,
  softDeleteAccessToken,
  updateGalleryPhotoDerivatives,
  upsertGalleryPhoto,
  updateGuest,
  updateTable,
  validateGalleryToken,
} from './db.js'
import { generateGalleryDerivatives } from './galleryImages.js'
import { isR2Configured, presignR2Url, publicR2Url } from './r2.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DIST_DIR = path.join(__dirname, '..', 'dist')
const PORT = process.env.PORT || 80

const AUTH_USER = process.env.AUTH_USER || 'sposi'
const AUTH_PASSWORD = process.env.AUTH_PASSWORD || ''
const ADMIN_KEY = process.env.ADMIN_KEY || 'admin'
const DOWNLOAD_URL_EXPIRES_SECONDS = Number(process.env.GALLERY_DOWNLOAD_URL_EXPIRES_SECONDS || 300)
const DISPLAY_URL_EXPIRES_SECONDS = Number(process.env.GALLERY_DISPLAY_URL_EXPIRES_SECONDS || 3600)
const DAILY_DOWNLOAD_URL_LIMIT = Number(process.env.GALLERY_TOKEN_DAILY_DOWNLOAD_LIMIT || 200)

const app = express()
app.use(express.json())

// Health probe — always open, so the container healthcheck works with auth on.
app.get('/healthz', (_req, res) => res.type('text').send('ok'))

function isPublicRoute(req) {
  return (
    req.path.startsWith('/g/') ||
    req.path.startsWith('/api/gallery') ||
    req.path.startsWith('/assets/') ||
    req.path === '/heart.svg' ||
    req.path === '/favicon.ico'
  )
}

// ---- HTTP Basic Auth (skipped when AUTH_PASSWORD is empty) ----
if (AUTH_PASSWORD) {
  app.use((req, res, next) => {
    if (isPublicRoute(req)) return next()
    const header = req.headers.authorization || ''
    const [scheme, encoded] = header.split(' ')
    if (scheme === 'Basic' && encoded) {
      const [user, pass] = Buffer.from(encoded, 'base64').toString().split(':')
      if (user === AUTH_USER && pass === AUTH_PASSWORD) return next()
    }
    res.set('WWW-Authenticate', 'Basic realm="Le Nostre Nozze"')
    res.status(401).send('Authentication required')
  })
  console.log(`[server] Basic Auth enabled for user '${AUTH_USER}'.`)
} else {
  console.warn('[server] WARNING: AUTH_PASSWORD not set — the site is unprotected.')
}

function requireAdminKey(req, res, next) {
  const key = req.get('x-admin-key') || ''
  if (key && key === ADMIN_KEY) return next()
  res.status(403).json({ error: 'admin key required' })
}

function ipHash(req) {
  const ip = req.ip || req.socket?.remoteAddress || ''
  return crypto.createHash('sha256').update(ip).digest('hex').slice(0, 24)
}

function toSqlDate(date) {
  return date.toISOString().replace('T', ' ').slice(0, 19)
}

// ---- guests API ----
app.get('/api/guests', (_req, res) => res.json(listGuests()))

app.post('/api/guests', (req, res) => {
  const name = (req.body?.name || '').trim()
  if (!name) return res.status(400).json({ error: 'name is required' })
  res.status(201).json(addGuest(name))
})

app.patch('/api/guests/:id', (req, res) => {
  const guest = updateGuest(Number(req.params.id), req.body ?? {})
  if (!guest) return res.status(404).json({ error: 'not found' })
  res.json(guest)
})

app.delete('/api/guests/:id', (req, res) => {
  if (!deleteGuest(Number(req.params.id))) return res.status(404).json({ error: 'not found' })
  res.status(204).end()
})

// ---- database backup (protected by the same auth) ----
// Streams a consistent .db snapshot the user can save off-device, so the data
// survives an SD-card failure. Restore = drop the file back into the volume.
app.get('/api/backup', (_req, res) => {
  const stamp = new Date().toISOString().slice(0, 10)
  res.setHeader('Content-Type', 'application/octet-stream')
  res.setHeader('Content-Disposition', `attachment; filename="nozze-backup-${stamp}.db"`)
  res.send(backupDatabase())
})

// ---- tables API ----
app.get('/api/tables', (_req, res) => res.json(listTables()))

app.post('/api/tables', (req, res) => {
  res.status(201).json(addTable(req.body ?? {}))
})

app.patch('/api/tables/:id', (req, res) => {
  const table = updateTable(Number(req.params.id), req.body ?? {})
  if (!table) return res.status(404).json({ error: 'not found' })
  res.json(table)
})

app.delete('/api/tables/:id', (req, res) => {
  if (!deleteTable(Number(req.params.id))) return res.status(404).json({ error: 'not found' })
  res.status(204).end()
})

// ---- public gallery API (capability-token protected, no Basic Auth prompt) ----
app.get('/api/gallery', (req, res) => {
  const token = String(req.query.token || '')
  const access = validateGalleryToken(token, { markSeen: true })
  if (!access) return res.status(401).json({ error: 'invalid or expired gallery link' })

  const photos = listGalleryPhotos().map((photo) => {
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
  })

  res.json({
    album: { id: 1, title: 'Wedding' },
    guest: { label: access.label, default_lang: access.default_lang },
    photos,
  })
})

app.post('/api/gallery/photos/:id/download-url', (req, res) => {
  const token = String(req.body?.token || req.query.token || '')
  const access = validateGalleryToken(token)
  if (!access) return res.status(401).json({ error: 'invalid or expired gallery link' })
  if (!isR2Configured()) return res.status(503).json({ error: 'R2 is not configured' })

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

// ---- guest-link admin API (Basic Auth + local admin key) ----
app.get('/api/admin/gallery/tokens', requireAdminKey, (_req, res) => {
  res.json(listAccessTokens({ includeFullToken: true }))
})

app.post('/api/admin/gallery/tokens', requireAdminKey, (req, res) => {
  const label = String(req.body?.label || '').trim()
  if (!label) return res.status(400).json({ error: 'label is required' })
  try {
    res.status(201).json(
      createAccessToken({
        label,
        expires_at: req.body?.expires_at || null,
        note: req.body?.note || '',
        default_lang: req.body?.default_lang || 'it',
      }),
    )
  } catch (err) {
    res.status(400).json({ error: err.message || 'could not create token' })
  }
})

app.post('/api/admin/gallery/tokens/:token/revoke', requireAdminKey, (req, res) => {
  const token = revokeAccessToken(req.params.token)
  if (!token) return res.status(404).json({ error: 'token not found' })
  res.json(token)
})

app.delete('/api/admin/gallery/tokens/:token', requireAdminKey, (req, res) => {
  const token = softDeleteAccessToken(req.params.token)
  if (!token) return res.status(404).json({ error: 'token not found' })
  res.json(token)
})

// ---- gallery photo admin API (Basic Auth) ----
app.get('/api/admin/gallery/photos', (_req, res) => {
  res.json(listGalleryPhotos())
})

app.post('/api/admin/gallery/photos', (req, res) => {
  try {
    res.status(201).json(upsertGalleryPhoto(req.body ?? {}))
  } catch (err) {
    res.status(400).json({ error: err.message || 'could not save photo' })
  }
})

app.post('/api/admin/gallery/photos/:id/generate-derivatives', async (req, res) => {
  if (!isR2Configured()) return res.status(503).json({ error: 'R2 is not configured' })
  const photo = getGalleryPhoto(Number(req.params.id))
  if (!photo) return res.status(404).json({ error: 'photo not found' })

  try {
    const derivatives = await generateGalleryDerivatives(photo)
    res.json(updateGalleryPhotoDerivatives(photo.id, derivatives))
  } catch (err) {
    console.error('[gallery] derivative generation failed', err)
    res.status(500).json({ error: err.message || 'could not generate derivatives' })
  }
})

app.post('/api/admin/gallery/upload-url', (req, res) => {
  if (!isR2Configured()) return res.status(503).json({ error: 'R2 is not configured' })
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
    photo,
    key,
    upload_url: presignR2Url({ method: 'PUT', key, expiresIn: 600, disposition: null }),
    expires_in: 600,
  })
})

// ---- static frontend + SPA fallback ----
app.use(express.static(DIST_DIR))
app.get('*', (_req, res) => res.sendFile(path.join(DIST_DIR, 'index.html')))

const gseed = seedIfEmpty()
if (gseed.seeded > 0) console.log(`[server] Seeded ${gseed.seeded} guests from lista.txt.`)
const tseed = seedTablesIfEmpty()
if (tseed.seeded > 0) console.log(`[server] Seeded ${tseed.seeded} example tables.`)

app.listen(PORT, () => console.log(`[server] Listening on :${PORT}`))
