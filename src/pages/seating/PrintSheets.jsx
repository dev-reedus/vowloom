const tableNum = (label) => {
  const m = String(label).match(/\d+/)
  return m ? Number(m[0]) : Number.POSITIVE_INFINITY
}
const bySeatThenName = (a, b) =>
  (a.seat_index ?? 99) - (b.seat_index ?? 99) || a.name.localeCompare(b.name)

// Print sheet: one block per table with its seated guests, ordered by table number then seat.
export function PrintChart({ guests, tables, title }) {
  const sorted = [...tables].sort((a, b) => tableNum(a.label) - tableNum(b.label))
  return (
    <div className="print-chart">
      <h1 className="print-title">{title}</h1>
      <div className="pc-grid">
        {sorted.map((tb) => {
          const gs = guests.filter((g) => g.table_id === tb.id).sort(bySeatThenName)
          const occ = gs.reduce((s, g) => s + (g.party_size || 1), 0)
          return (
            <div className="pc-table" key={tb.id}>
              <h2>
                {tb.label} <span>{occ}/{tb.seats}</span>
              </h2>
              <ol>
                {gs.map((g) => (
                  <li key={g.id}>
                    {g.name}
                    {(g.party_size || 1) > 1 ? ` (${g.party_size})` : ''}
                  </li>
                ))}
              </ol>
              {gs.length === 0 && <p className="pc-empty">-</p>}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// Print sheet: one place card per seated guest, alphabetical.
export function PrintCards({ guests, tables }) {
  const labelOf = (id) => tables.find((t) => t.id === id)?.label || ''
  const seated = guests
    .filter((g) => g.table_id != null)
    .sort((a, b) => a.name.localeCompare(b.name))
  return (
    <div className="print-cards">
      {seated.map((g) => (
        <div className="place-card" key={g.id}>
          <div className="pcard-name">{g.name}</div>
          <div className="pcard-table">{labelOf(g.table_id)}</div>
        </div>
      ))}
    </div>
  )
}
