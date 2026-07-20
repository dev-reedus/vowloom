import express, { Router } from 'express'
import sharp from 'sharp'
import {
  deleteFloorplanBackground,
  getFloorplan,
  getFloorplanBackground,
  saveFloorplanBackground,
  updateFloorplan,
} from '../db.js'
import { floorplanBody, validationErrorResponse } from '../lib/requestValidation.js'
import { requireSession } from '../middleware/session.js'

export const floorplanRouter = Router()

floorplanRouter.get('/api/floorplan', requireSession, (_req, res) => res.json(getFloorplan()))

floorplanRouter.put('/api/floorplan', requireSession, (req, res) => {
  try {
    const { data, revision } = floorplanBody(req.body)
    const saved = updateFloorplan(data, revision)
    if (!saved) return res.status(409).json({ error: 'floorplan was changed in another session' })
    res.json(saved)
  } catch (err) {
    if (!validationErrorResponse(res, err)) throw err
  }
})

floorplanRouter.get('/api/floorplan/background', requireSession, (_req, res) => {
  const background = getFloorplanBackground()
  if (!background) return res.status(404).json({ error: 'not found' })
  res.set({
    'Content-Type': background.content_type,
    'Cache-Control': 'private, no-store',
    'Last-Modified': new Date(`${background.updated_at}Z`).toUTCString(),
  })
  res.send(background.image_data)
})

const backgroundBody = express.raw({ type: ['image/jpeg', 'image/png', 'image/webp'], limit: '10mb' })

floorplanRouter.post('/api/floorplan/background', requireSession, backgroundBody, async (req, res) => {
  if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
    return res.status(415).json({ error: 'background must be a JPEG, PNG, or WebP image' })
  }
  try {
    const image = await sharp(req.body, { failOn: 'error', limitInputPixels: 40_000_000 })
      .rotate()
      .resize({ width: 2400, height: 2400, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 84 })
      .toBuffer()
    res.status(201).json(saveFloorplanBackground('image/webp', image))
  } catch {
    res.status(400).json({ error: 'could not read background image' })
  }
})

floorplanRouter.delete('/api/floorplan/background', requireSession, (_req, res) => {
  deleteFloorplanBackground()
  res.status(204).end()
})
