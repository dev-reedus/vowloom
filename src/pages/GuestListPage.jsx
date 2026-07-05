import { useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'

export default function GuestListPage({ t, guests, loading, addGuest, updateGuest, removeGuest }) {
  const [name, setName] = useState('')
  const [query, setQuery] = useState('')
  const [showStats, setShowStats] = useState(false)
  // 'all' | 'notSent' | 'pending' | 'accepted' | 'maybe' | 'declined'
  const [filter, setFilter] = useState('all')

  const stats = useMemo(() => {
    const by = (s) => guests.filter((g) => g.reply_status === s).length
    const heads = (s) =>
      guests.filter((g) => g.reply_status === s).reduce((n, g) => n + (g.party_size || 1), 0)
    return {
      total: guests.length,
      sent: guests.filter((g) => g.sent).length,
      accepted: by('accepted'),
      maybe: by('maybe'),
      declined: by('declined'),
      pending: by('pending'),
      headsAccepted: heads('accepted'),
      headsMaybe: heads('maybe'),
    }
  }, [guests])

  const STATUS_FILTERS = ['pending', 'accepted', 'maybe', 'declined']

  // Filter by search text + status, then sort alphabetically.
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    return guests
      .filter((g) => !q || g.name.toLowerCase().includes(q))
      .filter(
        (g) =>
          filter === 'all' ||
          (filter === 'notSent' && !g.sent) ||
          (STATUS_FILTERS.includes(filter) && g.reply_status === filter),
      )
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))
  }, [guests, query, filter])

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

      <div className="stats-more">
        <button
          type="button"
          className={`stats-toggle ${showStats ? 'open' : ''}`}
          aria-expanded={showStats}
          onClick={() => setShowStats((v) => !v)}
        >
          {showStats ? t.statsLess : t.statsMore}
          <span className="chev" aria-hidden="true">▾</span>
        </button>

        <AnimatePresence initial={false}>
          {showStats && (
            <motion.section
              className="stats stats--extra"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.3, ease: 'easeInOut' }}
            >
              <Stat label={t.maybeCount} value={stats.maybe} accent="maybe" />
              <Stat label={t.declinedCount} value={stats.declined} accent="declined" />
              <Stat label={t.pendingCount} value={stats.pending} accent="pending" />
              <Stat
                label={t.headsCount}
                value={stats.headsAccepted}
                accent="heads"
                hint={stats.headsMaybe > 0 ? t.maybeHeadsHint(stats.headsMaybe) : null}
              />
            </motion.section>
          )}
        </AnimatePresence>
      </div>

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

      <div className="search-box">
        <svg className="search-ico" viewBox="0 0 24 24" aria-hidden="true">
          <path
            d="M21 21l-4.3-4.3M11 18a7 7 0 1 1 0-14 7 7 0 0 1 0 14z"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t.searchPlaceholder}
          aria-label={t.searchPlaceholder}
        />
      </div>

      <div className="filters">
        <button className={filter === 'all' ? 'on' : ''} onClick={() => setFilter('all')}>
          {t.filterAll}
        </button>
        <button
          className={filter === 'notSent' ? 'on' : ''}
          onClick={() => setFilter('notSent')}
        >
          {t.filterNotSent}
        </button>
        <button className={filter === 'pending' ? 'on' : ''} onClick={() => setFilter('pending')}>
          {t.filterPending}
        </button>
        <button className={filter === 'accepted' ? 'on' : ''} onClick={() => setFilter('accepted')}>
          {t.filterAccepted}
        </button>
        <button className={filter === 'maybe' ? 'on' : ''} onClick={() => setFilter('maybe')}>
          {t.filterMaybe}
        </button>
        <button className={filter === 'declined' ? 'on' : ''} onClick={() => setFilter('declined')}>
          {t.filterDeclined}
        </button>
      </div>

      <ul className="guest-list">
        <AnimatePresence initial={false}>
          {visible.map((guest) => (
            <motion.li
              key={guest.id}
              className={`guest guest--${guest.reply_status}`}
              layout
              initial={{ opacity: 0, y: -12, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, x: 40, scale: 0.95 }}
              transition={{ type: 'spring', stiffness: 380, damping: 30 }}
            >
              {/* Colored spine: re-keys on status change to replay the grow. */}
              <motion.span
                className="guest-spine"
                key={guest.reply_status}
                initial={{ scaleY: 0.3, opacity: 0.4 }}
                animate={{ scaleY: 1, opacity: 1 }}
                transition={{ type: 'spring', stiffness: 420, damping: 24 }}
              />
              <div className="guest-body">
                <span className="guest-name" title={guest.name}>
                  {guest.name}
                </span>

                <div className="guest-actions">
                  <Check
                    label={t.sent}
                    checked={guest.sent}
                    accent="sent"
                    onChange={() => toggle(guest, 'sent')}
                  />
                  <StatusSelect
                    t={t}
                    status={guest.reply_status}
                    onChange={(reply_status) => {
                      // A real reply implies the invite went out — mark it sent if
                      // it wasn't already. Clearing back to pending leaves sent alone.
                      const fields = { reply_status }
                      if (reply_status !== 'pending' && !guest.sent) fields.sent = true
                      updateGuest(guest.id, fields)
                    }}
                  />
                </div>
              </div>

              <button
                className="remove"
                onClick={() => removeGuest(guest.id)}
                aria-label={t.remove(guest.name)}
                title={t.remove(guest.name)}
              >
                ×
              </button>
            </motion.li>
          ))}
        </AnimatePresence>

        {!loading && guests.length === 0 && (
          <motion.li className="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            {t.empty}
          </motion.li>
        )}
        {!loading && guests.length > 0 && visible.length === 0 && (
          <motion.li className="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            {t.noResults}
          </motion.li>
        )}
      </ul>
    </>
  )
}

function Stat({ label, value, accent, hint }) {
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
      {hint && <span className="stat-hint">{hint}</span>}
    </div>
  )
}

// Three-way reply status control. No button active means the guest is still
// 'pending'; clicking the active status returns them to pending.
function StatusSelect({ t, status, onChange }) {
  const opts = [
    { key: 'accepted', short: t.btnYes, title: t.statusAccepted },
    { key: 'maybe', short: t.btnMaybe, title: t.statusMaybe },
    { key: 'declined', short: t.btnNo, title: t.statusDeclined },
  ]
  return (
    <div className="status-select" role="group" aria-label={t.statusPending}>
      {opts.map((o) => {
        const on = status === o.key
        return (
          <motion.button
            key={o.key}
            type="button"
            className={`status-btn status-btn--${o.key} ${on ? 'on' : ''}`}
            aria-pressed={on}
            title={o.title}
            whileTap={{ scale: 0.88 }}
            onClick={() => onChange(on ? 'pending' : o.key)}
          >
            {o.short}
          </motion.button>
        )
      })}
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
