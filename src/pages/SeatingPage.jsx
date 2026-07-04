import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'

const partySize = (g) => g.party_size || 1
// Accepted and "maybe" guests both need a seat and count toward capacity.
const needsSeat = (g) => g.reply_status === 'accepted' || g.reply_status === 'maybe'
const tableSize = (seats) => 42 + seats * 2.2 // px diameter in the overview

// Short label for a chair: first up-to-2 letters of the party name.
function initials(name) {
  const letters = (name || '').replace(/[^\p{L}]/gu, '')
  return letters.slice(0, 2).toUpperCase() || '·'
}

// Which guest sits on each seat of a table (a party spans consecutive seats).
function buildSeatMap(guests, tableId, seats, excludeId = null) {
  const map = new Array(seats).fill(null)
  for (const g of guests) {
    if (g.table_id !== tableId || g.seat_index == null || g.id === excludeId) continue
    for (let k = 0; k < partySize(g); k++) map[(g.seat_index + k) % seats] = g
  }
  return map
}

function elementAt(x, y, selector) {
  for (const el of document.elementsFromPoint(x, y)) {
    const match = el.closest?.(selector)
    if (match) return match
  }
  return null
}

export default function SeatingPage({
  t,
  guests,
  tables,
  updateGuest,
  updateTable,
  addTable,
  removeTable,
}) {
  const roomRef = useRef(null)
  const [mode, setMode] = useState('assign') // 'assign' | 'layout'
  const [selectedGuestId, setSelectedGuestId] = useState(null)
  const [openTableId, setOpenTableId] = useState(null)
  const [drag, setDrag] = useState(null) // { id, x, y } while moving a table
  const [newLabel, setNewLabel] = useState('')
  const [newSeats, setNewSeats] = useState(10)
  const [printKind, setPrintKind] = useState(null) // null | 'chart' | 'cards'

  // Render the chosen print sheet, fire the browser print dialog, then reset.
  useEffect(() => {
    if (!printKind) return
    const reset = () => setPrintKind(null)
    window.addEventListener('afterprint', reset)
    const id = setTimeout(() => window.print(), 80)
    return () => {
      window.removeEventListener('afterprint', reset)
      clearTimeout(id)
    }
  }, [printKind])

  function createTable() {
    addTable({
      label: newLabel.trim() || `Tav. ${tables.length + 1}`,
      seats: Math.max(1, Number(newSeats) || 10),
      x: 0.5,
      y: 0.5,
    })
    setNewLabel('')
  }

  // Guests who need a seat: accepted OR maybe.
  const unassigned = guests.filter((g) => needsSeat(g) && g.table_id == null)
  const totalPeople = guests
    .filter((g) => needsSeat(g))
    .reduce((s, g) => s + partySize(g), 0)
  const seatedPeople = guests
    .filter((g) => needsSeat(g) && g.table_id != null)
    .reduce((s, g) => s + partySize(g), 0)

  // Capacity math counts only guests who need a seat; a guest who has since
  // declined but is still parked at a table is flagged, not counted (below).
  const occupancyOf = (id) =>
    guests.filter((g) => g.table_id === id && needsSeat(g)).reduce((s, g) => s + partySize(g), 0)
  const guestsAt = (id) => guests.filter((g) => g.table_id === id)
  const openTable = tables.find((tb) => tb.id === openTableId) || null

  // ---- validation summary (shown as a banner when there are issues) ----
  const overTablesCount = tables.filter((tb) => occupancyOf(tb.id) > tb.seats).length
  const toSeatPeople = unassigned.reduce((s, g) => s + partySize(g), 0)
  const staleSeated = guests.filter((g) => g.table_id != null && !needsSeat(g)).length
  const hasIssues = overTablesCount > 0 || toSeatPeople > 0 || staleSeated > 0

  // ---- assignment helpers ----
  // Seat a party starting at a chair; only if it fits in free consecutive seats.
  function trySeat(guest, tableId, startSeat) {
    const table = tables.find((tb) => tb.id === tableId)
    if (!table) return false
    const map = buildSeatMap(guests, tableId, table.seats, guest.id)
    for (let k = 0; k < partySize(guest); k++) {
      if (map[(startSeat + k) % table.seats]) return false // seat taken
    }
    updateGuest(guest.id, { table_id: tableId, seat_index: startSeat })
    setSelectedGuestId(null)
    return true
  }

  function assignToTable(guest, tableId) {
    if (guest.table_id !== tableId || guest.seat_index != null) {
      updateGuest(guest.id, { table_id: tableId, seat_index: null })
    }
    setSelectedGuestId(null)
  }

  // Drop handler for a dragged chip: prefer a specific chair, else the table.
  function dropByPoint(guest, clientX, clientY) {
    const chair = elementAt(clientX, clientY, '[data-seat-index]')
    if (chair) {
      trySeat(guest, Number(chair.dataset.tableId), Number(chair.dataset.seatIndex))
      return
    }
    const target = tables.find((tb) => {
      const el = roomRef.current?.querySelector(`[data-table-id="${tb.id}"]`)
      if (!el) return false
      const r = el.getBoundingClientRect()
      return clientX >= r.left && clientX <= r.right && clientY >= r.top && clientY <= r.bottom
    })
    if (target) assignToTable(guest, target.id)
  }

  function onTableClick(tb) {
    if (mode !== 'assign') return
    if (selectedGuestId != null) {
      assignToTable(guests.find((g) => g.id === selectedGuestId), tb.id)
      setOpenTableId(tb.id)
      return
    }
    setOpenTableId((cur) => (cur === tb.id ? null : tb.id))
  }

  // ---- table repositioning (layout mode, pointer-based) ----
  function onTablePointerDown(e, tb) {
    if (mode !== 'layout') return
    e.currentTarget.setPointerCapture(e.pointerId)
    setDrag({ id: tb.id, x: tb.x, y: tb.y })
  }
  function onTablePointerMove(e) {
    if (!drag) return
    const rect = roomRef.current.getBoundingClientRect()
    const x = Math.min(0.97, Math.max(0.03, (e.clientX - rect.left) / rect.width))
    const y = Math.min(0.95, Math.max(0.05, (e.clientY - rect.top) / rect.height))
    setDrag((d) => ({ ...d, x, y }))
  }
  function onTablePointerUp() {
    if (!drag) return
    updateTable(drag.id, { x: drag.x, y: drag.y })
    setDrag(null)
  }

  return (
    <div className="seating">
      <header className="seating-head">
        <h2 className="seating-title">{t.seatingTitle}</h2>
        <p className="seating-sub">
          {seatedPeople >= totalPeople && totalPeople > 0
            ? t.allSeated
            : t.seatedOf(seatedPeople, totalPeople)}
        </p>

        <div className="mode-switch">
          <button
            className={mode === 'assign' ? 'on' : ''}
            onClick={() => {
              setMode('assign')
              setDrag(null)
            }}
          >
            {t.modeAssign}
          </button>
          <button
            className={mode === 'layout' ? 'on' : ''}
            onClick={() => {
              setMode('layout')
              setSelectedGuestId(null)
              setOpenTableId(null)
            }}
          >
            {t.modeLayout}
          </button>
        </div>

        <div className="print-actions">
          <button onClick={() => setPrintKind('chart')}>🖨 {t.printList}</button>
          <button onClick={() => setPrintKind('cards')}>🖨 {t.printCards}</button>
        </div>
      </header>

      <AnimatePresence>
        {hasIssues && (
          <motion.div
            className="seating-validation"
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
          >
            <span className="val-ico" aria-hidden="true">⚠</span>
            <ul>
              {overTablesCount > 0 && <li>{t.valOverTables(overTablesCount)}</li>}
              {toSeatPeople > 0 && <li>{t.valToSeat(toSeatPeople)}</li>}
              {staleSeated > 0 && <li>{t.valStale(staleSeated)}</li>}
            </ul>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ---- room / floorplan ---- */}
      <div
        className={`room ${mode === 'layout' ? 'is-layout' : ''}`}
        ref={roomRef}
        onPointerMove={onTablePointerMove}
        onPointerUp={onTablePointerUp}
        onPointerLeave={onTablePointerUp}
      >
        <svg className="room-shape" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          {/* floor tint */}
          <polygon
            className="room-floor"
            points="0,0 68.5,0 68.5,9.4 71.9,9.4 71.9,0 100,0 100,100 70.2,100 70.2,79.4 25.8,79.4 25.8,38.3 0,38.3"
          />
          {/* walls as segments, leaving gaps for the CUCINE + INGRESSO doorways */}
          <g className="room-walls">
            <polyline points="0,0 68.5,0 68.5,9.4 71.9,9.4 71.9,0 100,0 100,100 70.2,100 70.2,79.4 59.5,79.4" />
            <line x1="54.5" y1="79.4" x2="35.5" y2="79.4" />
            <polyline points="30.5,79.4 25.8,79.4 25.8,38.3 0,38.3 0,0" />
          </g>
        </svg>
        <span className="room-label" style={{ left: '26%', top: '50%' }}>Focolare</span>
        <span className="room-label" style={{ left: '33%', top: '82%' }}>CUCINE</span>
        <span className="room-label" style={{ left: '57%', top: '82%' }}>INGRESSO INVITATI</span>

        {tables.length === 0 && <p className="room-empty">{t.emptyTables}</p>}

        {tables.map((tb) => {
          const pos = drag && drag.id === tb.id ? drag : tb
          const occ = occupancyOf(tb.id)
          const over = occ > tb.seats
          const d = tableSize(tb.seats)
          return (
            <div
              key={tb.id}
              data-table-id={tb.id}
              className={[
                'table-node',
                tb.shape === 'rect' ? 'rect' : 'round',
                over ? 'over' : '',
                openTableId === tb.id ? 'open' : '',
                mode === 'layout' ? 'draggable' : '',
              ].join(' ')}
              style={{
                left: `${pos.x * 100}%`,
                top: `${pos.y * 100}%`,
                width: d,
                height: tb.shape === 'rect' ? Math.round(d * 0.62) : d,
              }}
              onPointerDown={(e) => onTablePointerDown(e, tb)}
              onClick={() => onTableClick(tb)}
            >
              <span className="table-label">{tb.label}</span>
              <span className={`table-occ ${over ? 'over' : ''}`}>
                {occ}/{tb.seats}
              </span>

              {mode === 'layout' && (
                <button
                  className="table-del"
                  title={t.deleteTable}
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation()
                    removeTable(tb.id)
                    if (openTableId === tb.id) setOpenTableId(null)
                  }}
                >
                  ×
                </button>
              )}
            </div>
          )
        })}

      </div>

      {/* ---- create-table form (layout mode) ---- */}
      {mode === 'layout' && (
        <div className="table-form">
          <input
            className="tf-name"
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            placeholder={t.tableNamePlaceholder}
          />
          <label className="tf-seats">
            <input
              type="number"
              min="1"
              value={newSeats}
              onChange={(e) => setNewSeats(e.target.value)}
            />
            <span>{t.seatsWord}</span>
          </label>
          <button className="tf-add" onClick={createTable}>
            {t.addTable}
          </button>
        </div>
      )}

      {/* ---- open table: seat map ---- */}
      <AnimatePresence>
        {openTable && (
          <motion.section
            className="table-detail"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
          >
            <h3>
              {openTable.label} · {occupancyOf(openTable.id)}/{openTable.seats}
              <span className="seat-count-edit">
                <button
                  onClick={() =>
                    updateTable(openTable.id, { seats: Math.max(1, openTable.seats - 1) })
                  }
                  aria-label="-"
                >
                  −
                </button>
                <span className="scn">
                  {openTable.seats} {t.seatsWord}
                </span>
                <button
                  onClick={() => updateTable(openTable.id, { seats: openTable.seats + 1 })}
                  aria-label="+"
                >
                  +
                </button>
              </span>
            </h3>
            <p className="seat-hint">{t.seatHint}</p>

            <SeatMap
              table={openTable}
              guests={guests}
              t={t}
              selectedGuestId={selectedGuestId}
              onSeatClick={(seatIndex, occupant) => {
                if (occupant) {
                  updateGuest(occupant.id, { seat_index: null }) // free the chair
                } else if (selectedGuestId != null) {
                  trySeat(guests.find((g) => g.id === selectedGuestId), openTable.id, seatIndex)
                }
              }}
            />

            <div className="chips">
              {guestsAt(openTable.id).map((g) => (
                <div
                  className={`chip seated ${g.seat_index == null ? 'noseat' : ''} ${
                    selectedGuestId === g.id ? 'selected' : ''
                  }`}
                  key={g.id}
                  onClick={() =>
                    setSelectedGuestId((cur) => (cur === g.id ? null : g.id))
                  }
                >
                  <span className="chip-name">
                    {g.name}
                    {g.seat_index == null && <em className="tag"> · {t.noSeat}</em>}
                  </span>
                  <PartyStepper guest={g} updateGuest={updateGuest} />
                  <button
                    className="chip-x"
                    title={t.unassign}
                    onClick={(e) => {
                      e.stopPropagation()
                      updateGuest(g.id, { table_id: null })
                    }}
                  >
                    ×
                  </button>
                </div>
              ))}
              {guestsAt(openTable.id).length === 0 && <p className="muted">{t.dropHint}</p>}
            </div>
          </motion.section>
        )}
      </AnimatePresence>

      {/* ---- unassigned tray ---- */}
      <section className="tray">
        <h3 className="tray-title">
          {t.unassigned} · {unassigned.reduce((s, g) => s + partySize(g), 0)}
        </h3>
        <div className="chips">
          <AnimatePresence initial={false}>
            {unassigned.map((g) => (
              <GuestChip
                key={g.id}
                guest={g}
                t={t}
                selected={selectedGuestId === g.id}
                onSelect={() => setSelectedGuestId((cur) => (cur === g.id ? null : g.id))}
                onDropAt={(x, y) => dropByPoint(g, x, y)}
                updateGuest={updateGuest}
              />
            ))}
          </AnimatePresence>
          {unassigned.length === 0 && <p className="muted">{t.allSeated}</p>}
        </div>
      </section>

      {/* ---- print sheets (hidden on screen, shown when printing) ---- */}
      {printKind && (
        <div className="print-area">
          {printKind === 'chart' ? (
            <PrintChart guests={guests} tables={tables} />
          ) : (
            <PrintCards guests={guests} tables={tables} />
          )}
        </div>
      )}
    </div>
  )
}

const tableNum = (label) => {
  const m = String(label).match(/\d+/)
  return m ? Number(m[0]) : Number.POSITIVE_INFINITY
}
const bySeatThenName = (a, b) =>
  (a.seat_index ?? 99) - (b.seat_index ?? 99) || a.name.localeCompare(b.name)

function PrintChart({ guests, tables }) {
  const sorted = [...tables].sort((a, b) => tableNum(a.label) - tableNum(b.label))
  return (
    <div className="print-chart">
      <h1 className="print-title">Nozze di Marius e Giorgiana</h1>
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
              {gs.length === 0 && <p className="pc-empty">—</p>}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function PrintCards({ guests, tables }) {
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

function SeatMap({ table, guests, t, selectedGuestId, onSeatClick }) {
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

function GuestChip({ guest, t, selected, onSelect, onDropAt, updateGuest }) {
  const ref = useRef(null)
  return (
    <motion.div
      ref={ref}
      layout
      className={`chip draggable ${guest.reply_status === 'maybe' ? 'maybe' : ''} ${
        selected ? 'selected' : ''
      }`}
      drag
      dragSnapToOrigin
      whileDrag={{ scale: 1.06, zIndex: 30 }}
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      onDragEnd={() => {
        const r = ref.current?.getBoundingClientRect()
        if (r) onDropAt(r.left + r.width / 2, r.top + r.height / 2)
      }}
      onClick={onSelect}
    >
      <span className="chip-name">
        {guest.name}
        {guest.reply_status === 'maybe' && <em className="tag tag--maybe"> · {t.maybeTag}</em>}
      </span>
      <PartyStepper guest={guest} updateGuest={updateGuest} />
    </motion.div>
  )
}

function PartyStepper({ guest, updateGuest }) {
  const n = guest.party_size || 1
  const set = (v) => updateGuest(guest.id, { party_size: Math.max(1, v) })
  return (
    <span
      className="party"
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      <button className="party-btn" onClick={() => set(n - 1)} disabled={n <= 1} aria-label="-">
        −
      </button>
      <span className="party-n">{n}</span>
      <button className="party-btn" onClick={() => set(n + 1)} aria-label="+">
        +
      </button>
    </span>
  )
}
