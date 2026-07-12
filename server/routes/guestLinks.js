import { Router } from 'express'
import {
  createAccessToken,
  listAccessTokens,
  revokeAccessToken,
  softDeleteAccessToken,
} from '../db.js'
import { requireSession, requireRole } from '../middleware/session.js'

// Guest-link API for the protected app. Listing is available to any signed-in
// role so the couple can see existing gallery shares; mutations stay admin-only.
// Per-route guards: this router mounts at '/', so a router-level `.use` would
// gate public routes.
export const guestLinksRouter = Router()

const session = requireSession
const admin = [requireSession, requireRole('admin')]

guestLinksRouter.get('/api/admin/gallery/tokens', session, (_req, res) => {
  res.json(listAccessTokens({ includeFullToken: true }))
})

guestLinksRouter.post('/api/admin/gallery/tokens', admin, (req, res) => {
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

guestLinksRouter.post('/api/admin/gallery/tokens/:token/revoke', admin, (req, res) => {
  const token = revokeAccessToken(req.params.token)
  if (!token) return res.status(404).json({ error: 'token not found' })
  res.json(token)
})

guestLinksRouter.delete('/api/admin/gallery/tokens/:token', admin, (req, res) => {
  const token = softDeleteAccessToken(req.params.token)
  if (!token) return res.status(404).json({ error: 'token not found' })
  res.json(token)
})
