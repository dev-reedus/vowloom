import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { buildSeatMap, elementAt, needsSeat, partySize, tableSize } from './seating/seatingUtils'
import SeatMap from './seating/SeatMap'
import GuestChip from './seating/GuestChip'
import PartyStepper from './seating/PartyStepper'
import { PrintCards, PrintChart } from './seating/PrintSheets'

export default function SeatingPage({
  t,
  guests,
  tables,
  updateGuest,
  updateTable,
  addTable,
  removeTable,
  printTitle,
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

  // Capacity math counts only guests who need a seat; a guest who has since declined
  // but is still parked at a table is flagged, not counted (below).
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
        {/* TODO: Render room geometry, walls, doors, labels, and an optional
            background from deployment configuration instead of a fixed room. */}
        <svg className="room-shape" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          <polygon
            className="room-floor"
            points="0,0 68.5,0 68.5,9.4 71.9,9.4 71.9,0 100,0 100,100 70.2,100 70.2,79.4 25.8,79.4 25.8,38.3 0,38.3"
          />
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
            <PrintChart guests={guests} tables={tables} title={printTitle} />
          ) : (
            <PrintCards guests={guests} tables={tables} />
          )}
        </div>
      )}
    </div>
  )
}
