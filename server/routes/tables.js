import { Router } from 'express'
import { addTable, deleteTable, listTables, updateTable } from '../db.js'
import { requireSession } from '../middleware/session.js'
import { entityId, tableBody, validationErrorResponse } from '../lib/requestValidation.js'

export const tablesRouter = Router()

// All table routes need any valid session (couple or admin). Per-route guard
// (this router mounts at '/', so a router-level `.use` would gate public routes).
tablesRouter.get('/api/tables', requireSession, (_req, res) => res.json(listTables()))

tablesRouter.post('/api/tables', requireSession, (req, res) => {
  try {
    res.status(201).json(addTable(tableBody(req.body)))
  } catch (err) {
    if (!validationErrorResponse(res, err)) throw err
  }
})

tablesRouter.patch('/api/tables/:id', requireSession, (req, res) => {
  try {
    const table = updateTable(entityId(req.params.id), tableBody(req.body, { partial: true }))
    if (!table) return res.status(404).json({ error: 'not found' })
    res.json(table)
  } catch (err) {
    if (!validationErrorResponse(res, err)) throw err
  }
})

tablesRouter.delete('/api/tables/:id', requireSession, (req, res) => {
  try {
    if (!deleteTable(entityId(req.params.id))) return res.status(404).json({ error: 'not found' })
    res.status(204).end()
  } catch (err) {
    if (!validationErrorResponse(res, err)) throw err
  }
})
