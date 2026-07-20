const clamp = (value, min, max) => Math.min(max, Math.max(min, value))

export function projectToSegment(point, start, end) {
  const dx = end.x - start.x
  const dy = end.y - start.y
  const lengthSquared = dx * dx + dy * dy
  const ratio = lengthSquared === 0
    ? 0
    : clamp(((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared, 0, 1)
  const projected = { x: start.x + dx * ratio, y: start.y + dy * ratio }
  return { point: projected, distance: Math.hypot(point.x - projected.x, point.y - projected.y) }
}

function shiftGeometry(data, dx, dy) {
  data.boundary.forEach((point) => { point.x += dx; point.y += dy })
  data.walls.forEach((wall) => {
    wall.start.x += dx; wall.start.y += dy
    wall.end.x += dx; wall.end.y += dy
  })
  data.doors.forEach((door) => { door.x += dx; door.y += dy })
  data.labels.forEach((label) => { label.x += dx; label.y += dy })
}

const roundCoordinate = (value) => Math.round(value * 1000) / 1000

// Crops the persisted artboard to the geometry that was actually drawn. The
// editor itself can use unrestricted world coordinates; normalization happens
// only at save time so the viewer and API still receive a compact, positive
// coordinate system.
export function cropFloorplanToContent(data) {
  if (!data.boundary.length) return data

  const points = [...data.boundary]
  data.walls.forEach((wall) => points.push(wall.start, wall.end))
  data.labels.forEach((label) => points.push(label))
  data.doors.forEach((door) => {
    const angle = (door.rotation || 0) * Math.PI / 180
    const halfWidth = door.width / 2
    const dx = Math.abs(Math.cos(angle) * halfWidth)
    const dy = Math.abs(Math.sin(angle) * halfWidth)
    points.push(
      { x: door.x - dx, y: door.y - dy },
      { x: door.x + dx, y: door.y + dy },
    )
  })

  const minX = Math.min(...points.map((point) => point.x))
  const minY = Math.min(...points.map((point) => point.y))
  const maxX = Math.max(...points.map((point) => point.x))
  const maxY = Math.max(...points.map((point) => point.y))
  const span = Math.max(maxX - minX, maxY - minY)
  const padding = Math.max(0.1, span * 0.02)
  const left = minX - padding
  const top = minY - padding

  shiftGeometry(data, -left, -top)
  data.canvas.width = roundCoordinate(Math.max(1, maxX - minX + padding * 2))
  data.canvas.height = roundCoordinate(Math.max(1, maxY - minY + padding * 2))
  data.boundary.forEach((point) => { point.x = roundCoordinate(point.x); point.y = roundCoordinate(point.y) })
  data.walls.forEach((wall) => {
    wall.start.x = roundCoordinate(wall.start.x); wall.start.y = roundCoordinate(wall.start.y)
    wall.end.x = roundCoordinate(wall.end.x); wall.end.y = roundCoordinate(wall.end.y)
  })
  data.doors.forEach((door) => { door.x = roundCoordinate(door.x); door.y = roundCoordinate(door.y) })
  data.labels.forEach((label) => { label.x = roundCoordinate(label.x); label.y = roundCoordinate(label.y) })
  return data
}

// Mutates a cloned floorplan draft, expanding the logical artboard when a
// newly placed or dragged point lands beyond an edge. Existing geometry is
// shifted when the expansion happens above or to the left.
export function expandForPoint(data, rawPoint) {
  const padding = Math.max(0.5, Math.min(data.canvas.width, data.canvas.height) * 0.05)
  const left = rawPoint.x < 0 ? rawPoint.x - padding : 0
  const top = rawPoint.y < 0 ? rawPoint.y - padding : 0
  const right = rawPoint.x > data.canvas.width ? rawPoint.x + padding : data.canvas.width
  const bottom = rawPoint.y > data.canvas.height ? rawPoint.y + padding : data.canvas.height
  if (left === 0 && top === 0 && right === data.canvas.width && bottom === data.canvas.height) {
    return { point: rawPoint, expanded: false, dx: 0, dy: 0 }
  }
  const dx = -left
  const dy = -top
  shiftGeometry(data, dx, dy)
  data.canvas.width = right - left
  data.canvas.height = bottom - top
  return { point: { x: rawPoint.x + dx, y: rawPoint.y + dy }, expanded: true, dx, dy }
}
