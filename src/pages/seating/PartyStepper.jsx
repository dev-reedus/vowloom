import { Minus, Plus } from 'lucide-react'
import AppIcon from '../../components/AppIcon'

// Inline +/- control for a party's headcount. Stops pointer/click propagation so
// it works inside draggable chips and clickable rows without triggering them.
export default function PartyStepper({ guest, updateGuest }) {
  const n = guest.party_size || 1
  const set = (v) => updateGuest(guest.id, { party_size: Math.max(1, v) })
  return (
    <span
      className="party"
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      <button className="party-btn" onClick={() => set(n - 1)} disabled={n <= 1} aria-label="-">
        <AppIcon icon={Minus} size={13} />
      </button>
      <span className="party-n">{n}</span>
      <button className="party-btn" onClick={() => set(n + 1)} aria-label="+">
        <AppIcon icon={Plus} size={13} />
      </button>
    </span>
  )
}
