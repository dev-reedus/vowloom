import { Router } from 'express'
import { addGuest, backupDatabase, deleteGuest, listGuests, updateGuest } from '../db.js'
import { requireSession, requireRole } from '../middleware/session.js'

export const guestsRouter = Router()

// Guest-list routes need any valid session (couple or admin). Guards are applied
// per-route: these routers mount at '/', so a router-level `.use` would also
// gate the public SPA shell, /assets, and the guest gallery.
guestsRouter.get('/api/guests', requireSession, (_req, res) => res.json(listGuests()))

guestsRouter.post('/api/guests', requireSession, (req, res) => {
  const name = (req.body?.name || '').trim()
  if (!name) return res.status(400).json({ error: 'name is required' })
  res.status(201).json(addGuest(name))
})

guestsRouter.patch('/api/guests/:id', requireSession, (req, res) => {
  const guest = updateGuest(Number(req.params.id), req.body ?? {})
  if (!guest) return res.status(404).json({ error: 'not found' })
  res.json(guest)
})

guestsRouter.delete('/api/guests/:id', requireSession, (req, res) => {
  if (!deleteGuest(Number(req.params.id))) return res.status(404).json({ error: 'not found' })
  res.status(204).end()
})

// Database backup is admin-only (tightened from Basic-Auth-only + UI-hidden).
// Streams a consistent .db snapshot; restore = drop the file back into the volume.
guestsRouter.get('/api/backup', requireSession, requireRole('admin'), (_req, res) => {
  const stamp = new Date().toISOString().slice(0, 10)
  res.setHeader('Content-Type', 'application/octet-stream')
  res.setHeader('Content-Disposition', `attachment; filename="nozze-backup-${stamp}.db"`)
  res.send(backupDatabase())
})
