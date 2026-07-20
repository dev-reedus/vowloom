export const partySize = (g) => g.party_size || 1
// Accepted and "maybe" guests both need a seat and count toward capacity.
export const needsSeat = (g) => g.reply_status === 'accepted' || g.reply_status === 'maybe'
export const tableSize = (seats) => 42 + seats * 2.2 // px diameter in the overview

export function hasRoomOutline(floorplan) {
  return (floorplan?.data?.boundary?.length || 0) >= 3
}

export function rectangularFloorplan(data) {
  const next = structuredClone(data)
  const width = Math.max(1, Number(next.canvas?.width) || 12)
  const height = Math.max(1, Number(next.canvas?.height) || 8)
  const inset = Math.min(width, height) * 0.04
  next.canvas = { ...next.canvas, width, height }
  next.boundary = [
    { x: inset, y: inset },
    { x: width - inset, y: inset },
    { x: width - inset, y: height - inset },
    { x: inset, y: height - inset },
  ]
  next.walls = []
  next.doors = []
  next.labels = []
  return next
}

export function pointInPolygon(point, polygon = []) {
  let inside = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i]
    const b = polygon[j]
    const crosses = (a.y > point.y) !== (b.y > point.y)
      && point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x
    if (crosses) inside = !inside
  }
  return inside
}

// Short label for a chair: first up-to-2 letters of the party name.
export function initials(name) {
  const letters = (name || '').replace(/[^\p{L}]/gu, '')
  return letters.slice(0, 2).toUpperCase() || '·'
}

// Which guest sits on each seat of a table (a party spans consecutive seats).
export function buildSeatMap(guests, tableId, seats, excludeId = null) {
  const map = new Array(seats).fill(null)
  for (const g of guests) {
    if (g.table_id !== tableId || g.seat_index == null || g.id === excludeId) continue
    for (let k = 0; k < partySize(g); k++) map[(g.seat_index + k) % seats] = g
  }
  return map
}

export function elementAt(x, y, selector) {
  for (const el of document.elementsFromPoint(x, y)) {
    const match = el.closest?.(selector)
    if (match) return match
  }
  return null
}
