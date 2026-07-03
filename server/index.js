import path from 'node:path'
import { fileURLToPath } from 'node:url'
import express from 'express'
import {
  addGuest,
  deleteGuest,
  listGuests,
  seedIfEmpty,
  updateGuest,
} from './db.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DIST_DIR = path.join(__dirname, '..', 'dist')
const PORT = process.env.PORT || 80

const AUTH_USER = process.env.AUTH_USER || 'sposi'
const AUTH_PASSWORD = process.env.AUTH_PASSWORD || ''

const app = express()
app.use(express.json())

// Health probe — always open, so the container healthcheck works with auth on.
app.get('/healthz', (_req, res) => res.type('text').send('ok'))

// ---- HTTP Basic Auth (skipped when AUTH_PASSWORD is empty) ----
if (AUTH_PASSWORD) {
  app.use((req, res, next) => {
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

// ---- API ----
app.get('/api/guests', (_req, res) => {
  res.json(listGuests())
})

app.post('/api/guests', (req, res) => {
  const name = (req.body?.name || '').trim()
  if (!name) return res.status(400).json({ error: 'name is required' })
  res.status(201).json(addGuest(name))
})

app.patch('/api/guests/:id', (req, res) => {
  const { sent, accepted } = req.body ?? {}
  const guest = updateGuest(Number(req.params.id), { sent, accepted })
  if (!guest) return res.status(404).json({ error: 'not found' })
  res.json(guest)
})

app.delete('/api/guests/:id', (req, res) => {
  const ok = deleteGuest(Number(req.params.id))
  if (!ok) return res.status(404).json({ error: 'not found' })
  res.status(204).end()
})

// ---- static frontend + SPA fallback ----
app.use(express.static(DIST_DIR))
app.get('*', (_req, res) => res.sendFile(path.join(DIST_DIR, 'index.html')))

const result = seedIfEmpty()
if (result.seeded > 0) console.log(`[server] Seeded ${result.seeded} guests from lista.txt.`)

app.listen(PORT, () => console.log(`[server] Listening on :${PORT}`))
