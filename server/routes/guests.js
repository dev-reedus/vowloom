import { Router } from 'express'
import { addGuest, backupDatabase, deleteGuest, listGuests, updateGuest } from '../db.js'

export const guestsRouter = Router()

guestsRouter.get('/api/guests', (_req, res) => res.json(listGuests()))

guestsRouter.post('/api/guests', (req, res) => {
  const name = (req.body?.name || '').trim()
  if (!name) return res.status(400).json({ error: 'name is required' })
  res.status(201).json(addGuest(name))
})

guestsRouter.patch('/api/guests/:id', (req, res) => {
  const guest = updateGuest(Number(req.params.id), req.body ?? {})
  if (!guest) return res.status(404).json({ error: 'not found' })
  res.json(guest)
})

guestsRouter.delete('/api/guests/:id', (req, res) => {
  if (!deleteGuest(Number(req.params.id))) return res.status(404).json({ error: 'not found' })
  res.status(204).end()
})

// Database backup (protected by the same auth). Streams a consistent .db
// snapshot the user can save off-device, so the data survives a disk failure.
// Restore = drop the file back into the volume.
guestsRouter.get('/api/backup', (_req, res) => {
  const stamp = new Date().toISOString().slice(0, 10)
  res.setHeader('Content-Type', 'application/octet-stream')
  res.setHeader('Content-Disposition', `attachment; filename="nozze-backup-${stamp}.db"`)
  res.send(backupDatabase())
})
