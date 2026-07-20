import test from 'node:test'
import assert from 'node:assert/strict'
import { hasRoomOutline, pointInPolygon, rectangularFloorplan, tableSize } from './seatingUtils.js'

test('overview table sizes stay compact as seat counts grow', () => {
  assert.equal(tableSize(1), 44)
  assert.ok(tableSize(10) < 50)
  assert.ok(tableSize(20) > tableSize(10))
  assert.equal(tableSize(100), 56)
})

test('pointInPolygon handles rectangular and concave floorplans', () => {
  const concaveRoom = [
    { x: 0, y: 0 },
    { x: 6, y: 0 },
    { x: 6, y: 6 },
    { x: 3, y: 3 },
    { x: 0, y: 6 },
  ]
  assert.equal(pointInPolygon({ x: 1, y: 1 }, concaveRoom), true)
  assert.equal(pointInPolygon({ x: 3, y: 5 }, concaveRoom), false)
  assert.equal(pointInPolygon({ x: 7, y: 2 }, concaveRoom), false)
})

test('floorplan setup distinguishes an empty plan and builds an explicit rectangle', () => {
  const floorplan = {
    data: {
      version: 1,
      canvas: { width: 12, height: 8, unit: 'm' },
      boundary: [],
      walls: [],
      doors: [],
      labels: [],
      background: { opacity: 0.35 },
    },
  }
  assert.equal(hasRoomOutline(floorplan), false)

  const rectangle = rectangularFloorplan(floorplan.data)
  assert.equal(rectangle.boundary.length, 4)
  assert.equal(hasRoomOutline({ data: rectangle }), true)
  assert.deepEqual(rectangle.boundary[0], { x: 0.32, y: 0.32 })
  assert.deepEqual(rectangle.boundary[2], { x: 11.68, y: 7.68 })
  assert.deepEqual(floorplan.data.boundary, [])
})
