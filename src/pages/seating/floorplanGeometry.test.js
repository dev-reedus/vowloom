import test from 'node:test'
import assert from 'node:assert/strict'
import { cropFloorplanToContent, expandForPoint, projectToSegment } from './floorplanGeometry.js'

test('projectToSegment finds the nearest pivot position on a wall', () => {
  const projected = projectToSegment(
    { x: 5, y: 3 },
    { x: 0, y: 0 },
    { x: 10, y: 0 },
  )
  assert.deepEqual(projected.point, { x: 5, y: 0 })
  assert.equal(projected.distance, 3)
})

test('expandForPoint grows and shifts the floorplan without losing geometry', () => {
  const data = {
    canvas: { width: 10, height: 5 },
    boundary: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 5 }],
    walls: [{ start: { x: 1, y: 1 }, end: { x: 2, y: 2 } }],
    doors: [{ x: 4, y: 4 }],
    labels: [{ x: 5, y: 2 }],
  }
  const result = expandForPoint(data, { x: -2, y: 6 })
  assert.equal(result.expanded, true)
  assert.deepEqual(result.point, { x: 0.5, y: 6 })
  assert.deepEqual(data.canvas, { width: 12.5, height: 6.5 })
  assert.deepEqual(data.boundary[0], { x: 2.5, y: 0 })
  assert.deepEqual(data.walls[0].start, { x: 3.5, y: 1 })
  assert.deepEqual(data.doors[0], { x: 6.5, y: 4 })
})

test('cropFloorplanToContent normalizes unrestricted drawing coordinates for saving', () => {
  const data = {
    canvas: { width: 40, height: 30, unit: 'm' },
    boundary: [{ x: -4, y: 2 }, { x: 6, y: 2 }, { x: 6, y: 8 }, { x: -4, y: 8 }],
    walls: [{ start: { x: -2, y: 5 }, end: { x: 4, y: 5 } }],
    doors: [{ x: 1, y: 2, width: 1, rotation: 0 }],
    labels: [{ x: 0, y: 6 }],
  }

  cropFloorplanToContent(data)

  assert.deepEqual(data.canvas, { width: 10.4, height: 6.4, unit: 'm' })
  assert.deepEqual(data.boundary[0], { x: 0.2, y: 0.2 })
  assert.deepEqual(data.boundary[2], { x: 10.2, y: 6.2 })
  assert.deepEqual(data.walls[0].start, { x: 2.2, y: 3.2 })
})
