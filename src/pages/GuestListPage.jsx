import { useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'

export default function GuestListPage({ t, guests, loading, addGuest, updateGuest, removeGuest }) {
  const [name, setName] = useState('')

  const stats = useMemo(
    () => ({
      total: guests.length,
      sent: guests.filter((g) => g.sent).length,
      accepted: guests.filter((g) => g.accepted).length,
    }),
    [guests],
  )

  function onSubmit(e) {
    e.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) return
    setName('')
    addGuest(trimmed)
  }

  const toggle = (guest, field) => updateGuest(guest.id, { [field]: !guest[field] })

  return (
    <>
      <motion.header
        className="hero"
        initial={{ opacity: 0, y: -24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, ease: 'easeOut' }}
      >
        <p className="kicker">{t.kicker}</p>
        <h1 className="script">{t.title}</h1>
        <div className="divider">
          <span className="rule" />
          <svg className="heart" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 21s-6.716-4.35-9.428-8.06C.86 10.63 1.06 7.7 3.05 6.03a5.02 5.02 0 0 1 6.9.48L12 8.5l2.05-1.99a5.02 5.02 0 0 1 6.9-.48c1.99 1.67 2.19 4.6.48 6.91C18.716 16.65 12 21 12 21z" />
          </svg>
          <span className="rule" />
        </div>
        <p className="subtitle">{t.subtitle}</p>
      </motion.header>

      <motion.section
        className="stats"
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.25 }}
      >
        <Stat label={t.guests} value={stats.total} />
        <Stat label={t.sentCount} value={stats.sent} accent="sent" />
        <Stat label={t.acceptedCount} value={stats.accepted} accent="accepted" />
      </motion.section>

      <motion.form
        className="add-form"
        onSubmit={onSubmit}
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.4 }}
      >
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t.addPlaceholder}
          aria-label={t.guests}
        />
        <motion.button type="submit" whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.96 }}>
          {t.add}
        </motion.button>
      </motion.form>

      <ul className="guest-list">
        <AnimatePresence initial={false}>
          {guests.map((guest) => (
            <motion.li
              key={guest.id}
              className="guest"
              layout
              initial={{ opacity: 0, y: -12, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, x: 40, scale: 0.95 }}
              transition={{ type: 'spring', stiffness: 380, damping: 30 }}
            >
              <span className="guest-name">{guest.name}</span>

              <div className="guest-actions">
                <Check
                  label={t.sent}
                  checked={guest.sent}
                  accent="sent"
                  onChange={() => toggle(guest, 'sent')}
                />
                <Check
                  label={t.accepted}
                  checked={guest.accepted}
                  accent="accepted"
                  onChange={() => toggle(guest, 'accepted')}
                />
                <button
                  className="remove"
                  onClick={() => removeGuest(guest.id)}
                  aria-label={t.remove(guest.name)}
                  title={t.remove(guest.name)}
                >
                  ×
                </button>
              </div>
            </motion.li>
          ))}
        </AnimatePresence>

        {!loading && guests.length === 0 && (
          <motion.li className="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            {t.empty}
          </motion.li>
        )}
      </ul>
    </>
  )
}

function Stat({ label, value, accent }) {
  return (
    <div className={`stat ${accent ? `stat--${accent}` : ''}`}>
      <motion.span
        className="stat-value"
        key={value}
        initial={{ scale: 0.6, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 500, damping: 22 }}
      >
        {value}
      </motion.span>
      <span className="stat-label">{label}</span>
    </div>
  )
}

function Check({ label, checked, accent, onChange }) {
  return (
    <label className={`check check--${accent} ${checked ? 'is-on' : ''}`}>
      <input type="checkbox" checked={checked} onChange={onChange} />
      <span className="box">
        <AnimatePresence>
          {checked && (
            <motion.svg
              viewBox="0 0 24 24"
              initial={{ scale: 0, rotate: -30 }}
              animate={{ scale: 1, rotate: 0 }}
              exit={{ scale: 0 }}
              transition={{ type: 'spring', stiffness: 600, damping: 20 }}
            >
              <path
                d="M5 13l4 4L19 7"
                fill="none"
                stroke="currentColor"
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </motion.svg>
          )}
        </AnimatePresence>
      </span>
      <span className="check-label">{label}</span>
    </label>
  )
}
