import crypto from 'node:crypto'
import { ADMIN_KEY, AUTH_PASSWORD, AUTH_USER } from '../config.js'

// Constant-time string compare. Hashing first gives equal-length buffers, so the
// comparison leaks neither the secret's length nor a matching prefix via timing.
function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest()
  const hb = crypto.createHash('sha256').update(String(b)).digest()
  return crypto.timingSafeEqual(ha, hb)
}

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
      // Evaluate both before AND-ing so neither result short-circuits the other.
      const okUser = safeEqual(user, AUTH_USER)
      const okPass = safeEqual(pass, AUTH_PASSWORD)
      if (okUser && okPass) return next()
    }
    res.set('WWW-Authenticate', 'Basic realm="Le Nostre Nozze"')
    res.status(401).send('Authentication required')
  }
}

// Gate for local-admin write endpoints, layered on top of Basic Auth.
export function requireAdminKey(req, res, next) {
  const key = req.get('x-admin-key') || ''
  if (key && safeEqual(key, ADMIN_KEY)) return next()
  res.status(403).json({ error: 'admin key required' })
}
