import { ADMIN_KEY, AUTH_PASSWORD, AUTH_USER } from '../config.js'

// Routes reachable without the Basic Auth prompt: the guest gallery (token protected instead),
// static assets, and a couple of well-known files.
function isPublicRoute(req) {
  return (
    req.path.startsWith('/g/') ||
    req.path.startsWith('/api/gallery') ||
    req.path.startsWith('/assets/') ||
    req.path === '/heart.svg' ||
    req.path === '/favicon.ico'
  )
}

// HTTP Basic Auth middleware, or null when no password is configured (dev).
export function basicAuth() {
  if (!AUTH_PASSWORD) {
    console.warn('[server] WARNING: AUTH_PASSWORD not set - the site is unprotected.')
    return null
  }
  console.log(`[server] Basic Auth enabled for user '${AUTH_USER}'.`)
  return (req, res, next) => {
    if (isPublicRoute(req)) return next()
    const header = req.headers.authorization || ''
    const [scheme, encoded] = header.split(' ')
    if (scheme === 'Basic' && encoded) {
      const [user, pass] = Buffer.from(encoded, 'base64').toString().split(':')
      if (user === AUTH_USER && pass === AUTH_PASSWORD) return next()
    }
    res.set('WWW-Authenticate', 'Basic realm="Le Nostre Nozze"')
    res.status(401).send('Authentication required')
  }
}

// Gate for local-admin write endpoints, layered on top of Basic Auth.
export function requireAdminKey(req, res, next) {
  const key = req.get('x-admin-key') || ''
  if (key && key === ADMIN_KEY) return next()
  res.status(403).json({ error: 'admin key required' })
}
