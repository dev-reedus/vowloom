import { Router } from 'express'
import {
  createAccessToken,
  listAccessTokens,
  revokeAccessToken,
  softDeleteAccessToken,
} from '../db.js'
import { requireAdminKey } from '../middleware/auth.js'

// Guest-link admin API - Basic Auth (site-wide) plus the local admin key.
export const guestLinksRouter = Router()

guestLinksRouter.get('/api/admin/gallery/tokens', requireAdminKey, (_req, res) => {
  res.json(listAccessTokens({ includeFullToken: true }))
})

guestLinksRouter.post('/api/admin/gallery/tokens', requireAdminKey, (req, res) => {
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

guestLinksRouter.post('/api/admin/gallery/tokens/:token/revoke', requireAdminKey, (req, res) => {
  const token = revokeAccessToken(req.params.token)
  if (!token) return res.status(404).json({ error: 'token not found' })
  res.json(token)
})

guestLinksRouter.delete('/api/admin/gallery/tokens/:token', requireAdminKey, (req, res) => {
  const token = softDeleteAccessToken(req.params.token)
  if (!token) return res.status(404).json({ error: 'token not found' })
  res.json(token)
})
