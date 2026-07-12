import { Router } from 'express'
import { addTable, deleteTable, listTables, updateTable } from '../db.js'
import { requireSession } from '../middleware/session.js'

export const tablesRouter = Router()

// All table routes need any valid session (couple or admin). Per-route guard
// (this router mounts at '/', so a router-level `.use` would gate public routes).
tablesRouter.get('/api/tables', requireSession, (_req, res) => res.json(listTables()))

tablesRouter.post('/api/tables', requireSession, (req, res) => {
  res.status(201).json(addTable(req.body ?? {}))
})

tablesRouter.patch('/api/tables/:id', requireSession, (req, res) => {
  const table = updateTable(Number(req.params.id), req.body ?? {})
  if (!table) return res.status(404).json({ error: 'not found' })
  res.json(table)
})

tablesRouter.delete('/api/tables/:id', requireSession, (req, res) => {
  if (!deleteTable(Number(req.params.id))) return res.status(404).json({ error: 'not found' })
  res.status(204).end()
})
