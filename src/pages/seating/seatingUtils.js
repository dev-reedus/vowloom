export const partySize = (g) => g.party_size || 1
// Accepted and "maybe" guests both need a seat and count toward capacity.
export const needsSeat = (g) => g.reply_status === 'accepted' || g.reply_status === 'maybe'
export const tableSize = (seats) => 42 + seats * 2.2 // px diameter in the overview

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
