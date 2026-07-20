import { REPLY_STATUSES } from '../db/connection.js'

export class RequestValidationError extends Error {}

const fail = (message) => {
  throw new RequestValidationError(message)
}

function objectBody(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) fail('request body must be a JSON object')
  return body
}

function text(value, field, { required = false, max = 200 } = {}) {
  if (value == null && !required) return undefined
  if (typeof value !== 'string') fail(`${field} must be a string`)
  const clean = value.trim()
  if (required && !clean) fail(`${field} is required`)
  if (clean.length > max) fail(`${field} must be at most ${max} characters`)
  return clean
}

function boolean(value, field) {
  if (typeof value !== 'boolean') fail(`${field} must be a boolean`)
  return value
}

function integer(value, field, { min, max, nullable = false } = {}) {
  if (nullable && value === null) return null
  if (!Number.isSafeInteger(value)) fail(`${field} must be an integer`)
  if (min != null && value < min) fail(`${field} must be at least ${min}`)
  if (max != null && value > max) fail(`${field} must be at most ${max}`)
  return value
}

function finiteNumber(value, field, { min, max } = {}) {
  if (typeof value !== 'number' || !Number.isFinite(value)) fail(`${field} must be a finite number`)
  if (min != null && value < min) fail(`${field} must be at least ${min}`)
  if (max != null && value > max) fail(`${field} must be at most ${max}`)
  return value
}

function onlyFields(body, allowed) {
  const unknown = Object.keys(body).filter((key) => !allowed.has(key))
  if (unknown.length) fail(`unknown field${unknown.length === 1 ? '' : 's'}: ${unknown.join(', ')}`)
}

export function entityId(raw) {
  const id = Number(raw)
  if (!Number.isSafeInteger(id) || id < 1) fail('id must be a positive integer')
  return id
}

export function guestCreateBody(rawBody) {
  const body = objectBody(rawBody)
  onlyFields(body, new Set(['name']))
  return { name: text(body.name, 'name', { required: true }) }
}

export function guestPatchBody(rawBody) {
  const body = objectBody(rawBody)
  const allowed = new Set(['name', 'sent', 'accepted', 'reply_status', 'party_size', 'table_id', 'seat_index'])
  onlyFields(body, allowed)
  const fields = {}

  if ('name' in body) fields.name = text(body.name, 'name', { required: true })
  if ('sent' in body) fields.sent = boolean(body.sent, 'sent')
  if ('accepted' in body) fields.accepted = boolean(body.accepted, 'accepted')
  if ('reply_status' in body) {
    if (!REPLY_STATUSES.includes(body.reply_status)) fail(`reply_status must be one of: ${REPLY_STATUSES.join(', ')}`)
    fields.reply_status = body.reply_status
  }
  if ('party_size' in body) fields.party_size = integer(body.party_size, 'party_size', { min: 1, max: 100 })
  if ('table_id' in body) fields.table_id = integer(body.table_id, 'table_id', { min: 1, nullable: true })
  if ('seat_index' in body) fields.seat_index = integer(body.seat_index, 'seat_index', { min: 0, nullable: true })
  if (!Object.keys(fields).length) fail('at least one guest field is required')
  return fields
}

const TABLE_FIELDS = new Set(['label', 'shape', 'seats', 'x', 'y', 'w', 'h', 'rotation'])

export function tableBody(rawBody, { partial = false } = {}) {
  const body = objectBody(rawBody)
  onlyFields(body, TABLE_FIELDS)
  const fields = {}

  if ('label' in body) fields.label = text(body.label, 'label', { required: true, max: 100 })
  if ('shape' in body) {
    if (!['round', 'rect'].includes(body.shape)) fail('shape must be round or rect')
    fields.shape = body.shape
  }
  if ('seats' in body) fields.seats = integer(body.seats, 'seats', { min: 1, max: 100 })
  if ('x' in body) fields.x = finiteNumber(body.x, 'x', { min: 0, max: 1 })
  if ('y' in body) fields.y = finiteNumber(body.y, 'y', { min: 0, max: 1 })
  if ('w' in body) fields.w = finiteNumber(body.w, 'w', { min: 0.01, max: 1 })
  if ('h' in body) fields.h = finiteNumber(body.h, 'h', { min: 0.01, max: 1 })
  if ('rotation' in body) fields.rotation = finiteNumber(body.rotation, 'rotation', { min: -360, max: 360 })
  if (partial && !Object.keys(fields).length) fail('at least one table field is required')
  return fields
}

function point(value, field, canvas) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${field} must be a point`)
  onlyFields(value, new Set(['x', 'y']))
  return {
    x: finiteNumber(value.x, `${field}.x`, { min: 0, max: canvas.width }),
    y: finiteNumber(value.y, `${field}.y`, { min: 0, max: canvas.height }),
  }
}

function array(value, field, { min = 0, max = 100 } = {}) {
  if (!Array.isArray(value)) fail(`${field} must be an array`)
  if (value.length < min) fail(`${field} must contain at least ${min} items`)
  if (value.length > max) fail(`${field} must contain at most ${max} items`)
  return value
}

function polygonArea(points) {
  return Math.abs(points.reduce((sum, p, i) => {
    const next = points[(i + 1) % points.length]
    return sum + p.x * next.y - next.x * p.y
  }, 0) / 2)
}

function orientation(a, b, c) {
  const value = (b.y - a.y) * (c.x - b.x) - (b.x - a.x) * (c.y - b.y)
  if (Math.abs(value) < 1e-9) return 0
  return value > 0 ? 1 : 2
}

function onSegment(a, b, c) {
  return b.x <= Math.max(a.x, c.x) && b.x >= Math.min(a.x, c.x)
    && b.y <= Math.max(a.y, c.y) && b.y >= Math.min(a.y, c.y)
}

function segmentsIntersect(a, b, c, d) {
  const o1 = orientation(a, b, c)
  const o2 = orientation(a, b, d)
  const o3 = orientation(c, d, a)
  const o4 = orientation(c, d, b)
  if (o1 !== o2 && o3 !== o4) return true
  return (o1 === 0 && onSegment(a, c, b))
    || (o2 === 0 && onSegment(a, d, b))
    || (o3 === 0 && onSegment(c, a, d))
    || (o4 === 0 && onSegment(c, b, d))
}

function validateSimplePolygon(points) {
  if (polygonArea(points) < 0.01) fail('boundary must enclose an area')
  for (let i = 0; i < points.length; i++) {
    const a = points[i]
    const b = points[(i + 1) % points.length]
    for (let j = i + 1; j < points.length; j++) {
      if (j === i || j === i + 1 || (i === 0 && j === points.length - 1)) continue
      const c = points[j]
      const d = points[(j + 1) % points.length]
      if (segmentsIntersect(a, b, c, d)) fail('boundary must not cross itself')
    }
  }
}

export function floorplanBody(rawBody) {
  const body = objectBody(rawBody)
  onlyFields(body, new Set(['revision', 'data']))
  const revision = integer(body.revision, 'revision', { min: 1 })
  const data = objectBody(body.data)
  onlyFields(data, new Set(['version', 'canvas', 'boundary', 'walls', 'doors', 'labels', 'background']))

  if (data.version !== 1) fail('floorplan version must be 1')
  const rawCanvas = objectBody(data.canvas)
  onlyFields(rawCanvas, new Set(['width', 'height', 'unit']))
  const canvas = {
    width: finiteNumber(rawCanvas.width, 'canvas.width', { min: 1, max: 1000 }),
    height: finiteNumber(rawCanvas.height, 'canvas.height', { min: 1, max: 1000 }),
    unit: text(rawCanvas.unit, 'canvas.unit', { required: true, max: 12 }),
  }
  if (!['m', 'ft', 'custom'].includes(canvas.unit)) fail('canvas.unit must be m, ft, or custom')

  const boundary = array(data.boundary, 'boundary', { min: 3, max: 80 })
    .map((value, index) => point(value, `boundary[${index}]`, canvas))
  validateSimplePolygon(boundary)

  const walls = array(data.walls, 'walls', { max: 100 }).map((value, index) => {
    const wall = objectBody(value)
    onlyFields(wall, new Set(['id', 'start', 'end']))
    return {
      id: text(wall.id, `walls[${index}].id`, { required: true, max: 80 }),
      start: point(wall.start, `walls[${index}].start`, canvas),
      end: point(wall.end, `walls[${index}].end`, canvas),
    }
  })

  const doors = array(data.doors, 'doors', { max: 100 }).map((value, index) => {
    const door = objectBody(value)
    onlyFields(door, new Set(['id', 'x', 'y', 'width', 'rotation']))
    return {
      id: text(door.id, `doors[${index}].id`, { required: true, max: 80 }),
      x: finiteNumber(door.x, `doors[${index}].x`, { min: 0, max: canvas.width }),
      y: finiteNumber(door.y, `doors[${index}].y`, { min: 0, max: canvas.height }),
      width: finiteNumber(door.width, `doors[${index}].width`, { min: 0.2, max: Math.max(canvas.width, canvas.height) }),
      rotation: finiteNumber(door.rotation, `doors[${index}].rotation`, { min: -360, max: 360 }),
    }
  })

  const labels = array(data.labels, 'labels', { max: 100 }).map((value, index) => {
    const label = objectBody(value)
    onlyFields(label, new Set(['id', 'text', 'x', 'y']))
    return {
      id: text(label.id, `labels[${index}].id`, { required: true, max: 80 }),
      text: text(label.text, `labels[${index}].text`, { required: true, max: 100 }),
      x: finiteNumber(label.x, `labels[${index}].x`, { min: 0, max: canvas.width }),
      y: finiteNumber(label.y, `labels[${index}].y`, { min: 0, max: canvas.height }),
    }
  })

  const rawBackground = data.background == null ? {} : objectBody(data.background)
  onlyFields(rawBackground, new Set(['opacity']))
  const background = {
    opacity: 'opacity' in rawBackground
      ? finiteNumber(rawBackground.opacity, 'background.opacity', { min: 0, max: 1 })
      : 0.35,
  }

  return { revision, data: { version: 1, canvas, boundary, walls, doors, labels, background } }
}

export function validationErrorResponse(res, error) {
  if (!(error instanceof RequestValidationError)) return false
  res.status(400).json({ error: error.message })
  return true
}
