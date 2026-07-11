import path from 'node:path'
import express from 'express'
import { seedIfEmpty, seedTablesIfEmpty } from './db.js'
import { assertAuthConfig, DIST_DIR, PORT } from './config.js'
import { basicAuth } from './middleware/auth.js'
import { guestsRouter } from './routes/guests.js'
import { tablesRouter } from './routes/tables.js'
import { galleryRouter } from './routes/gallery.js'
import { guestLinksRouter } from './routes/guestLinks.js'
import { galleryAdminRouter } from './routes/galleryAdmin.js'

// Fail closed on missing/guessable auth secrets before we bind the port.
assertAuthConfig()

const app = express()
app.use(express.json())

// Health probe - always open, so the container healthcheck works with auth on.
app.get('/healthz', (_req, res) => res.type('text').send('ok'))

// HTTP Basic Auth (skipped when AUTH_PASSWORD is empty).
const auth = basicAuth()
if (auth) app.use(auth)

// API routes.
app.use(guestsRouter)
app.use(tablesRouter)
app.use(galleryRouter)
app.use(guestLinksRouter)
app.use(galleryAdminRouter)

// Static frontend + SPA fallback.
app.use(express.static(DIST_DIR))
app.get('*', (_req, res) => res.sendFile(path.join(DIST_DIR, 'index.html')))

const gseed = seedIfEmpty()
if (gseed.seeded > 0) console.log(`[server] Seeded ${gseed.seeded} guests from lista.txt.`)
const tseed = seedTablesIfEmpty()
if (tseed.seeded > 0) console.log(`[server] Seeded ${tseed.seeded} example tables.`)

app.listen(PORT, () => console.log(`[server] Listening on :${PORT}`))
