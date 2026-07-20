import { useRef } from 'react'
import { motion } from 'framer-motion'
import PartyStepper from './PartyStepper'
import { initials } from './seatingUtils'

// A draggable guest chip in the unassigned tray. On drag end it reports its
// centre point so the page can drop it onto a chair or table.
export default function GuestChip({ guest, t, selected, onSelect, onDropAt, updateGuest }) {
  const ref = useRef(null)
  return (
    <motion.div
      ref={ref}
      role="button"
      tabIndex="0"
      aria-pressed={selected}
      aria-label={guest.name}
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
      onKeyDown={(event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return
        event.preventDefault()
        onSelect()
      }}
    >
      <span className="chip-avatar" aria-hidden="true">{initials(guest.name)}</span>
      <span className="chip-name">
        {guest.name}
        {guest.reply_status === 'maybe' && <em className="tag tag--maybe"> · {t.maybeTag}</em>}
      </span>
      <PartyStepper guest={guest} updateGuest={updateGuest} />
    </motion.div>
  )
}
