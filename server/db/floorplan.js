import { db, isLegacyFloorplanUpgrade } from './connection.js'

// New installations start without an assumed venue shape. The client allows
// guest assignment immediately, then offers a custom outline or an explicit
// rectangular quick start before tables are positioned.
export const DEFAULT_FLOORPLAN = {
  version: 1,
  canvas: { width: 12, height: 8, unit: 'm' },
  boundary: [],
  walls: [],
  doors: [],
  labels: [],
  background: { opacity: 0.35 },
}

// Exact logical-coordinate conversion of the floorplan that releases before
// the editor rendered as a hardcoded SVG. It is used only for that one upgrade
// path, never for a genuinely new installation.
export const LEGACY_FLOORPLAN = {
  version: 1,
  canvas: { width: 16.25, height: 9, unit: 'm' },
  boundary: [
    { x: 0, y: 0 },
    { x: 11.13, y: 0 },
    { x: 11.13, y: 0.85 },
    { x: 11.68, y: 0.85 },
    { x: 11.68, y: 0 },
    { x: 16.25, y: 0 },
    { x: 16.25, y: 9 },
    { x: 11.41, y: 9 },
    { x: 11.41, y: 7.15 },
    { x: 4.19, y: 7.15 },
    { x: 4.19, y: 3.45 },
    { x: 0, y: 3.45 },
  ],
  walls: [],
  doors: [
    { id: 'door-kitchen', x: 9.26, y: 7.15, width: 0.82, rotation: 0 },
    { id: 'door-guest', x: 5.36, y: 7.15, width: 0.82, rotation: 0 },
  ],
  labels: [
    { id: 'label-hearth', text: 'Focolare', x: 4.23, y: 4.5 },
    { id: 'label-kitchen', text: 'CUCINE', x: 5.36, y: 7.38 },
    { id: 'label-entry', text: 'INGRESSO INVITATI', x: 9.26, y: 7.38 },
  ],
  background: { opacity: 0.35 },
}

function ensureFloorplan() {
  const exists = db.prepare('SELECT 1 FROM floorplans WHERE id = 1').get()
  if (!exists) {
    const initial = isLegacyFloorplanUpgrade ? LEGACY_FLOORPLAN : DEFAULT_FLOORPLAN
    db.prepare('INSERT INTO floorplans (id, data_json) VALUES (1, ?)').run(JSON.stringify(initial))
  }
}

// Persist the upgrade decision during startup. If this waited for the first
// GET, restarting an upgraded instance before login could lose the distinction.
ensureFloorplan()

export function getFloorplan() {
  ensureFloorplan()
  const row = db.prepare('SELECT revision, data_json, updated_at FROM floorplans WHERE id = 1').get()
  const background = db.prepare('SELECT updated_at FROM floorplan_backgrounds WHERE id = 1').get()
  return {
    revision: row.revision,
    data: JSON.parse(row.data_json),
    has_background: Boolean(background),
    background_revision: background?.updated_at || null,
    updated_at: row.updated_at,
  }
}

export function updateFloorplan(data, expectedRevision) {
  ensureFloorplan()
  const current = db.prepare('SELECT revision FROM floorplans WHERE id = 1').get()
  if (expectedRevision != null && expectedRevision !== current.revision) return null
  db.prepare(
    "UPDATE floorplans SET data_json = ?, revision = revision + 1, updated_at = datetime('now') WHERE id = 1",
  ).run(JSON.stringify(data))
  return getFloorplan()
}

export function getFloorplanBackground() {
  return db.prepare('SELECT content_type, image_data, updated_at FROM floorplan_backgrounds WHERE id = 1').get() || null
}

export function saveFloorplanBackground(contentType, imageData) {
  db.prepare(`
    INSERT INTO floorplan_backgrounds (id, content_type, image_data)
    VALUES (1, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      content_type = excluded.content_type,
      image_data = excluded.image_data,
      updated_at = datetime('now')
  `).run(contentType, imageData)
  return getFloorplan()
}

export function deleteFloorplanBackground() {
  return db.prepare('DELETE FROM floorplan_backgrounds WHERE id = 1').run().changes > 0
}
