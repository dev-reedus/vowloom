import { Router } from 'express'
import { resolveRole } from '../config.js'
import { createSession, deleteSession } from '../db/sessions.js'
import {
  requireSession,
  setSessionCookie,
  clearSessionCookie,
  loginLimiter,
} from '../middleware/session.js'

const clientKey = (req) => req.ip || req.socket?.remoteAddress || 'unknown'

export const authRouter = Router()

// Password-only login. resolveRole maps the password to a role (timing-safe,
// whole-registry). Behind the per-IP failure limiter to blunt online guessing.
authRouter.post('/api/login', (req, res) => {
  const ip = clientKey(req)
  const retryAfter = loginLimiter.retryAfter(ip)
  if (retryAfter > 0) {
    res.set('Retry-After', String(retryAfter))
    return res.status(429).json({ error: 'too many failed attempts, try again later', retry_after: retryAfter })
  }

  const password = String(req.body?.password || '')
  const role = resolveRole(password)
  if (!role) {
    loginLimiter.recordFailure(ip)
    return res.status(401).json({ error: 'invalid password' })
  }
  loginLimiter.recordSuccess(ip)
  const rawId = createSession(role)
  setSessionCookie(res, rawId)
  res.json({ role })
})

authRouter.post('/api/logout', requireSession, (req, res) => {
  deleteSession(req.sessionId)
  clearSessionCookie(res)
  res.status(204).end()
})

authRouter.get('/api/me', requireSession, (req, res) => {
  res.json({ role: req.role })
})
