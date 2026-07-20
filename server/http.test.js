import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import sharp from 'sharp'

// Test env must be set before importing config/app (both read env at load).
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'nozze-http-'))
process.env.DB_PATH = path.join(TMP, 'http.db')
process.env.SEED_FILE = path.join(TMP, 'no-seed.txt')
process.env.COUPLE_PASSWORD = 'couple-pw-aaa'
process.env.ADMIN_PASSWORD = 'admin-pw-bbb'
process.env.ALLOW_INSECURE_AUTH = '1' // cookie Secure off, so http keeps it
process.env.WEDDING_COUPLE_NAMES = 'Test Couple'
process.env.WEDDING_YEAR = '2030'
process.env.DEFAULT_LANGUAGE = 'en'

const { createApp } = await import('./app.js')

let server
let base

before(async () => {
  server = createApp().listen(0)
  await new Promise((r) => server.once('listening', r))
  base = `http://127.0.0.1:${server.address().port}`
})

after(() => server?.close())

// Log in and return the session cookie string (name=value) for reuse.
async function loginCookie(password) {
  const res = await fetch(`${base}/api/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
  })
  const setCookie = res.headers.get('set-cookie') || ''
  const cookie = setCookie.split(';')[0]
  return { res, cookie }
}

test('login sets a cookie and returns the couple role', async () => {
  const { res, cookie } = await loginCookie('couple-pw-aaa')
  assert.equal(res.status, 200)
  assert.deepEqual(await res.json(), { role: 'couple' })
  assert.match(cookie, /^vowloom_session=/)
})

test('login returns the admin role for the admin password', async () => {
  const { res } = await loginCookie('admin-pw-bbb')
  assert.equal(res.status, 200)
  assert.deepEqual(await res.json(), { role: 'admin' })
})

test('GET /api/me returns the role with a valid cookie, 401 without', async () => {
  const { cookie } = await loginCookie('couple-pw-aaa')
  const ok = await fetch(`${base}/api/me`, { headers: { cookie } })
  assert.equal(ok.status, 200)
  assert.deepEqual(await ok.json(), { role: 'couple' })

  const anon = await fetch(`${base}/api/me`)
  assert.equal(anon.status, 401)
})

test('a legacy session cookie is accepted and upgraded', async () => {
  const { cookie } = await loginCookie('couple-pw-aaa')
  const legacyCookie = cookie.replace(/^vowloom_session=/, 'nozze_session=')
  const res = await fetch(`${base}/api/me`, { headers: { cookie: legacyCookie } })
  assert.equal(res.status, 200)
  assert.match(res.headers.get('set-cookie') || '', /^vowloom_session=/)
})

test('guest links are listable by couple and manageable only by admin', async () => {
  const { cookie: couple } = await loginCookie('couple-pw-aaa')
  const listBefore = await fetch(`${base}/api/admin/gallery/tokens`, { headers: { cookie: couple } })
  assert.equal(listBefore.status, 200)
  assert.ok(Array.isArray(await listBefore.json()))

  const coupleCreate = await fetch(`${base}/api/admin/gallery/tokens`, {
    method: 'POST',
    headers: { cookie: couple, 'Content-Type': 'application/json' },
    body: JSON.stringify({ label: 'Couple should not create' }),
  })
  assert.equal(coupleCreate.status, 403)

  const { cookie: admin } = await loginCookie('admin-pw-bbb')
  const created = await fetch(`${base}/api/admin/gallery/tokens`, {
    method: 'POST',
    headers: { cookie: admin, 'Content-Type': 'application/json' },
    body: JSON.stringify({ label: 'Gallery guests' }),
  })
  assert.equal(created.status, 201)
  const token = (await created.json()).token

  const gallery = await fetch(`${base}/api/gallery?token=${encodeURIComponent(token)}`)
  assert.equal(gallery.status, 200)
  assert.deepEqual((await gallery.json()).album, { id: 1 })

  const listAfter = await fetch(`${base}/api/admin/gallery/tokens`, { headers: { cookie: couple } })
  assert.equal(listAfter.status, 200)
  assert.ok((await listAfter.json()).some((item) => item.token === token))

  const coupleRevoke = await fetch(`${base}/api/admin/gallery/tokens/${encodeURIComponent(token)}/revoke`, {
    method: 'POST',
    headers: { cookie: couple },
  })
  assert.equal(coupleRevoke.status, 403)

  const coupleDelete = await fetch(`${base}/api/admin/gallery/tokens/${encodeURIComponent(token)}`, {
    method: 'DELETE',
    headers: { cookie: couple },
  })
  assert.equal(coupleDelete.status, 403)
})

test('gallery admin photo previews are resolved only when explicitly requested', async () => {
  const { cookie: admin } = await loginCookie('admin-pw-bbb')
  const created = await fetch(`${base}/api/admin/gallery/photos`, {
    method: 'POST',
    headers: { cookie: admin, 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: 'Lazy preview test', original_key: 'originals/lazy-preview.jpg' }),
  })
  assert.equal(created.status, 201)
  const photoId = (await created.json()).id

  const metadata = await fetch(`${base}/api/admin/gallery/photos`, { headers: { cookie: admin } })
  const metadataPhoto = (await metadata.json()).find((photo) => photo.id === photoId)
  assert.equal(metadataPhoto.original_key, 'originals/lazy-preview.jpg')
  assert.equal('has_original' in metadataPhoto, false)

  const previews = await fetch(`${base}/api/admin/gallery/photos?include_urls=1`, { headers: { cookie: admin } })
  const previewPhoto = (await previews.json()).find((photo) => photo.id === photoId)
  assert.equal(previewPhoto.has_original, true)
  assert.equal('thumb_url' in previewPhoto, true)
})

test('logout invalidates the session', async () => {
  const { cookie } = await loginCookie('couple-pw-aaa')
  const out = await fetch(`${base}/api/logout`, { method: 'POST', headers: { cookie } })
  assert.equal(out.status, 204)
  const after = await fetch(`${base}/api/me`, { headers: { cookie } })
  assert.equal(after.status, 401)
})

test('public routes need no session', async () => {
  const health = await fetch(`${base}/healthz`)
  assert.equal(health.status, 200)

  const config = await fetch(`${base}/api/config`)
  assert.equal(config.status, 200)
  assert.deepEqual(await config.json(), {
    couple_names: 'Test Couple',
    wedding_year: '2030',
    default_language: 'en',
  })

  // The SPA shell must load unauthenticated so the login screen can render.
  // (Regression guard: a router-level requireSession would 401 this.)
  const shell = await fetch(`${base}/`)
  assert.equal(shell.status, 200)

  // Public gallery API rejects a bad token with its own 401, not the session
  // middleware - reachable without a cookie either way.
  const gallery = await fetch(`${base}/api/gallery?token=nope`)
  assert.equal(gallery.status, 401)
})

test('malformed guest and table requests return JSON validation errors', async () => {
  const { cookie } = await loginCookie('couple-pw-aaa')
  const jsonHeaders = { cookie, 'Content-Type': 'application/json' }

  const badGuest = await fetch(`${base}/api/guests`, {
    method: 'POST',
    headers: jsonHeaders,
    body: JSON.stringify({ name: { nested: true } }),
  })
  assert.equal(badGuest.status, 400)
  assert.match((await badGuest.json()).error, /name must be a string/)

  const invalidStatus = await fetch(`${base}/api/guests/1`, {
    method: 'PATCH',
    headers: jsonHeaders,
    body: JSON.stringify({ reply_status: 'unknown' }),
  })
  assert.equal(invalidStatus.status, 400)

  const table = await fetch(`${base}/api/tables`, {
    method: 'POST',
    headers: jsonHeaders,
    body: JSON.stringify({ label: 'Validated table', seats: 8, x: 0.5, y: 0.5 }),
  })
  assert.equal(table.status, 201)
  const tableId = (await table.json()).id

  const badCoordinate = await fetch(`${base}/api/tables/${tableId}`, {
    method: 'PATCH',
    headers: jsonHeaders,
    body: JSON.stringify({ x: 'not-a-number' }),
  })
  assert.equal(badCoordinate.status, 400)
  assert.match((await badCoordinate.json()).error, /finite number/)

  const badId = await fetch(`${base}/api/tables/not-an-id`, { method: 'DELETE', headers: { cookie } })
  assert.equal(badId.status, 400)
})

test('floorplan can be loaded, validated, saved, and given a background', async () => {
  const anonymous = await fetch(`${base}/api/floorplan`)
  assert.equal(anonymous.status, 401)

  const { cookie } = await loginCookie('couple-pw-aaa')
  const jsonHeaders = { cookie, 'Content-Type': 'application/json' }
  const loaded = await fetch(`${base}/api/floorplan`, { headers: { cookie } })
  assert.equal(loaded.status, 200)
  const floorplan = await loaded.json()
  assert.equal(floorplan.data.version, 1)
  assert.deepEqual(floorplan.data.boundary, [])

  const changed = structuredClone(floorplan.data)
  changed.boundary = [
    { x: 0, y: 0 }, { x: 12, y: 0 }, { x: 12, y: 8 }, { x: 0, y: 8 },
  ]
  changed.labels.push({ id: 'http-label', text: 'Dance floor', x: 3, y: 3 })
  const saved = await fetch(`${base}/api/floorplan`, {
    method: 'PUT',
    headers: jsonHeaders,
    body: JSON.stringify({ revision: floorplan.revision, data: changed }),
  })
  assert.equal(saved.status, 200)
  assert.equal((await saved.json()).revision, floorplan.revision + 1)

  const stale = await fetch(`${base}/api/floorplan`, {
    method: 'PUT',
    headers: jsonHeaders,
    body: JSON.stringify({ revision: floorplan.revision, data: changed }),
  })
  assert.equal(stale.status, 409)

  const crossing = { ...changed, boundary: [
    { x: 0, y: 0 }, { x: 4, y: 4 }, { x: 0, y: 4 }, { x: 4, y: 0 },
  ] }
  const invalid = await fetch(`${base}/api/floorplan`, {
    method: 'PUT',
    headers: jsonHeaders,
    body: JSON.stringify({ revision: floorplan.revision + 1, data: crossing }),
  })
  assert.equal(invalid.status, 400)
  assert.match((await invalid.json()).error, /enclose an area|cross itself/)

  const onePixelPng = await sharp({
    create: { width: 1, height: 1, channels: 4, background: '#fffaf4' },
  }).png().toBuffer()
  const uploaded = await fetch(`${base}/api/floorplan/background`, {
    method: 'POST',
    headers: { cookie, 'Content-Type': 'image/png' },
    body: onePixelPng,
  })
  assert.equal(uploaded.status, 201)
  assert.equal((await uploaded.json()).has_background, true)

  const background = await fetch(`${base}/api/floorplan/background`, { headers: { cookie } })
  assert.equal(background.status, 200)
  assert.equal(background.headers.get('content-type'), 'image/webp')
  assert.ok((await background.arrayBuffer()).byteLength > 0)
})

test('a malformed session cookie returns 401 instead of 500', async () => {
  const res = await fetch(`${base}/api/me`, { headers: { cookie: 'vowloom_session=%' } })
  assert.equal(res.status, 401)
})

test('repeated bad logins trip the rate limiter (429)', async () => {
  let status = 0
  for (let i = 0; i < 12; i++) {
    const res = await fetch(`${base}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: 'wrong' }),
    })
    status = res.status
  }
  assert.equal(status, 429)
})
