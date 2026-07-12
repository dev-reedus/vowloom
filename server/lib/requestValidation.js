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

export function validationErrorResponse(res, error) {
  if (!(error instanceof RequestValidationError)) return false
  res.status(400).json({ error: error.message })
  return true
}
