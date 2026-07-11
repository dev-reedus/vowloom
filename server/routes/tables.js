import { Router } from 'express'
import { addTable, deleteTable, listTables, updateTable } from '../db.js'

export const tablesRouter = Router()

tablesRouter.get('/api/tables', (_req, res) => res.json(listTables()))

tablesRouter.post('/api/tables', (req, res) => {
  res.status(201).json(addTable(req.body ?? {}))
})

tablesRouter.patch('/api/tables/:id', (req, res) => {
  const table = updateTable(Number(req.params.id), req.body ?? {})
  if (!table) return res.status(404).json({ error: 'not found' })
  res.json(table)
})

tablesRouter.delete('/api/tables/:id', (req, res) => {
  if (!deleteTable(Number(req.params.id))) return res.status(404).json({ error: 'not found' })
  res.status(204).end()
})
