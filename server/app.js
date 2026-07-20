import path from 'node:path'
import express from 'express'
import { DIST_DIR, publicWeddingConfig } from './config.js'
import { securityHeaders } from './middleware/securityHeaders.js'
import { authRouter } from './routes/auth.js'
import { guestsRouter } from './routes/guests.js'
import { tablesRouter } from './routes/tables.js'
import { floorplanRouter } from './routes/floorplan.js'
import { galleryRouter } from './routes/gallery.js'
import { guestLinksRouter } from './routes/guestLinks.js'
import { galleryAdminRouter } from './routes/galleryAdmin.js'

// Build the fully-wired Express app without binding a port, so tests can boot it
// with app.listen(0). index.js adds config assertion, seeding, and listen.
export function createApp() {
  const app = express()
  app.use(securityHeaders)
  app.use(express.json())

  // Health probe - always open, so the container healthcheck works.
  app.get('/healthz', (_req, res) => res.type('text').send('ok'))

  // Explicitly allowlisted public display settings used by the login shell and
  // guest gallery. Never expose process.env wholesale.
  app.get('/api/config', (_req, res) => res.json(publicWeddingConfig()))

  // Auth: /api/login is public (rate-limited); /api/logout and /api/me self-guard.
  app.use(authRouter)

  // API routers self-guard with requireSession / requireRole.
  app.use(guestsRouter)
  app.use(tablesRouter)
  app.use(floorplanRouter)
  app.use(galleryRouter) // public, capability-token protected
  app.use(guestLinksRouter)
  app.use(galleryAdminRouter)

  // Static frontend + SPA fallback (public: the shell renders the login screen).
  app.use(express.static(DIST_DIR))
  app.get('*', (_req, res) => res.sendFile(path.join(DIST_DIR, 'index.html')))

  return app
}
