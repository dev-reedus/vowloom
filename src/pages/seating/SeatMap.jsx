import { buildSeatMap, initials } from './seatingUtils'

// Circular seat map for one open table. Chairs are laid out around a ring;
// the party's starting chair shows initials, its spanned chairs a dot.
export default function SeatMap({ table, guests, t, selectedGuestId, onSeatClick }) {
  const seats = table.seats
  const size = 300
  const center = size / 2
  const tableR = size * 0.23
  const ring = tableR + 34
  const map = buildSeatMap(guests, table.id, seats)

  return (
    <div className="seatmap" style={{ width: size, height: size }}>
      <div
        className="seatmap-table"
        style={{ width: tableR * 2, height: tableR * 2 }}
      >
        <span>{table.label}</span>
      </div>

      {Array.from({ length: seats }).map((_, i) => {
        const ang = ((-90 + (i * 360) / seats) * Math.PI) / 180
        const cx = center + ring * Math.cos(ang)
        const cy = center + ring * Math.sin(ang)
        const g = map[i]
        const isStart = g && g.seat_index === i
        return (
          <button
            key={i}
            data-seat-index={i}
            data-table-id={table.id}
            className={`seat ${g ? 'occ' : ''} ${isStart ? 'start' : ''} ${
              !g && selectedGuestId != null ? 'target' : ''
            }`}
            style={{ left: cx, top: cy }}
            title={g ? g.name : `${t.seatWord} ${i + 1}`}
            onClick={() => onSeatClick(i, g)}
          >
            {g ? (isStart ? initials(g.name) : '•') : i + 1}
          </button>
        )
      })}
    </div>
  )
}
