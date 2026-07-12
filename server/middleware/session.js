import crypto from 'node:crypto'
import { ALLOW_INSECURE_AUTH } from '../config.js'
import { getValidSession } from '../db/sessions.js'
import { createFailureLimiter } from './rateLimit.js'

export const COOKIE_NAME = 'nozze_session'
const SLIDING_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000

// Per-IP failure limiter for the login endpoint (reused pattern from the old
// Basic Auth). Single-process, resets on restart.
export const loginLimiter = createFailureLimiter()

// Constant-time string compare (equal-length hashed buffers, no length/prefix
// timing leak). Kept here for any callers that still need it.
export function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest()
  const hb = crypto.createHash('sha256').update(String(b)).digest()
  return crypto.timingSafeEqual(ha, hb)
}

export function readSessionCookie(req) {
  const header = req.headers.cookie || ''
  for (const part of header.split(';')) {
    const eq = part.indexOf('=')
    if (eq === -1) continue
    const key = part.slice(0, eq).trim()
    if (key === COOKIE_NAME) return decodeURIComponent(part.slice(eq + 1).trim())
  }
  return null
}

// Secure by default; relaxed only for explicit local dev so an HTTP origin keeps
// the cookie (browsers drop Secure cookies over plain HTTP).
function cookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    secure: !ALLOW_INSECURE_AUTH,
  }
}

export function setSessionCookie(res, rawId) {
  res.cookie(COOKIE_NAME, rawId, { ...cookieOptions(), maxAge: SLIDING_MAX_AGE_MS })
}

export function clearSessionCookie(res) {
  res.clearCookie(COOKIE_NAME, cookieOptions())
}

// Any valid session (couple or admin). Slides last_seen_at and re-issues the
// cookie so an active user's 30-day window keeps moving forward.
export function requireSession(req, res, next) {
  const rawId = readSessionCookie(req)
  const session = getValidSession(rawId)
  if (!session) return res.status(401).json({ error: 'authentication required' })
  req.role = session.role
  req.sessionId = rawId
  setSessionCookie(res, rawId)
  next()
}

// Layer after requireSession. Accepts a set of roles for future extensibility.
export function requireRole(...roles) {
  const allowed = new Set(roles)
  return (req, res, next) => {
    if (!req.role || !allowed.has(req.role)) return res.status(403).json({ error: 'forbidden' })
    next()
  }
}
