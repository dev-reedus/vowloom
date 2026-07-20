const tableNum = (label) => {
  const m = String(label).match(/\d+/)
  return m ? Number(m[0]) : Number.POSITIVE_INFINITY
}
const bySeatThenName = (a, b) =>
  (a.seat_index ?? 99) - (b.seat_index ?? 99) || a.name.localeCompare(b.name)

const chunk = (items, size) =>
  Array.from({ length: Math.ceil(items.length / size) }, (_, index) =>
    items.slice(index * size, (index + 1) * size),
  )

function PrintFlourish() {
  return (
    <span className="print-flourish" aria-hidden="true">
      <i />
      <b>♥</b>
      <i />
    </span>
  )
}

// Print sheet: one block per table with its seated guests, ordered by table number then seat.
export function PrintChart({ guests, tables, title }) {
  const sorted = [...tables].sort((a, b) => tableNum(a.label) - tableNum(b.label))
  return (
    <div className="print-chart">
      <header className="print-masthead">
        <PrintFlourish />
        <h1 className="print-title">{title}</h1>
        <span className="print-title-rule" aria-hidden="true" />
      </header>
      <div className="pc-grid">
        {sorted.map((tb) => {
          const gs = guests.filter((g) => g.table_id === tb.id).sort(bySeatThenName)
          const occ = gs.reduce((s, g) => s + (g.party_size || 1), 0)
          return (
            <section className="pc-table" key={tb.id}>
              <header className="pc-table-head">
                <h2>{tb.label}</h2>
                <span className="pc-capacity">{occ}<i>/</i>{tb.seats}</span>
              </header>
              <ol>
                {gs.map((g) => (
                  <li key={g.id}>
                    <span className="pc-guest-name">{g.name}</span>
                    {(g.party_size || 1) > 1 && (
                      <span className="pc-party-size">×{g.party_size}</span>
                    )}
                  </li>
                ))}
              </ol>
              {gs.length === 0 && <p className="pc-empty" aria-hidden="true">—</p>}
            </section>
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
  const pages = chunk(seated, 8)

  return (
    <div className="print-cards">
      {pages.map((page, pageIndex) => (
        <div className="print-cards-page" key={pageIndex}>
          {page.map((g) => (
            <article className="place-card" key={g.id}>
              <div className="pcard-frame" aria-hidden="true" />
              <PrintFlourish />
              <div className="pcard-name">{g.name}</div>
              <div className="pcard-table">
                <span aria-hidden="true" />
                <strong>{labelOf(g.table_id)}</strong>
                <span aria-hidden="true" />
              </div>
            </article>
          ))}
        </div>
      ))}
    </div>
  )
}
