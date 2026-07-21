import { useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  Check as CheckIcon,
  ChevronDown,
  CircleCheckBig,
  Pencil,
  Plus,
  Search,
  Send,
  Trash2,
  UserRound,
  UserPlus,
  UsersRound,
  X,
} from 'lucide-react'
import AppIcon from '../components/AppIcon'

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
      totalPeople: guests.reduce((n, guest) => n + (guest.party_size || 1), 0),
      sent: guests.filter((g) => g.sent).length,
      accepted: by('accepted'),
      maybe: by('maybe'),
      declined: by('declined'),
      pending: by('pending'),
      notSent: guests.filter((g) => !g.sent).length,
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
  const filters = [
    { key: 'all', label: t.filterAll, count: stats.total },
    { key: 'notSent', label: t.filterNotSent, count: stats.notSent },
    { key: 'pending', label: t.filterPending, count: stats.pending },
    { key: 'accepted', label: t.filterAccepted, count: stats.accepted },
    { key: 'maybe', label: t.filterMaybe, count: stats.maybe },
    { key: 'declined', label: t.filterDeclined, count: stats.declined },
  ]

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
        className="stats stats--primary"
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.25 }}
      >
        <Stat label={t.guests} value={stats.total} icon={UsersRound} />
        <Stat label={t.persons} value={stats.totalPeople} accent="people" icon={UserRound} />
        <Stat label={t.sentCount} value={stats.sent} accent="sent" icon={Send} />
        <Stat label={t.acceptedCount} value={stats.accepted} accent="accepted" icon={CircleCheckBig} />
      </motion.section>

      <div className="stats-more">
        <button
          type="button"
          className={`stats-toggle ${showStats ? 'open' : ''}`}
          aria-expanded={showStats}
          onClick={() => setShowStats((v) => !v)}
        >
          {showStats ? t.statsLess : t.statsMore}
          <AppIcon icon={ChevronDown} className="chev" size={15} />
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
        className="add-form guest-add-form"
        onSubmit={onSubmit}
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.4 }}
      >
        <div className="guest-add-field">
          <AppIcon icon={UserPlus} size={18} />
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t.addPlaceholder}
            aria-label={t.guests}
          />
        </div>
        <motion.button type="submit" whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.96 }}>
          <AppIcon icon={Plus} size={17} />
          {t.add}
        </motion.button>
      </motion.form>

      <div className="guest-list-tools">
        <div className="search-box">
          <AppIcon icon={Search} className="search-ico" size={18} />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t.searchPlaceholder}
            aria-label={t.searchPlaceholder}
          />
        </div>

        <div className="filters">
          {filters.map((option) => (
            <button
              key={option.key}
              type="button"
              className={filter === option.key ? 'on' : ''}
              aria-pressed={filter === option.key}
              onClick={() => setFilter(option.key)}
            >
              <span>{option.label}</span>
              <span className="filter-count">{option.count}</span>
            </button>
          ))}
        </div>
      </div>

      <ul className="guest-list">
        <AnimatePresence initial={false}>
          {visible.map((guest) => {
            const statusLabel = {
              accepted: t.statusAccepted,
              maybe: t.statusMaybe,
              declined: t.statusDeclined,
              pending: t.statusPending,
            }[guest.reply_status] || t.statusPending
            return (
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
                  <div className="guest-identity">
                    <span className="guest-monogram" aria-hidden="true">{initials(guest.name)}</span>
                    <div className="guest-name-wrap">
                      <EditableGuestName guest={guest} t={t} updateGuest={updateGuest} />
                      <span className="guest-meta">
                        <span className="guest-status-dot" />
                        {statusLabel}
                        {(guest.party_size || 1) > 1 && (
                          <span className="guest-party">×{guest.party_size}</span>
                        )}
                      </span>
                    </div>
                  </div>

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
                        // A real reply implies the invite went out - mark it sent if
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
                  <AppIcon icon={Trash2} size={15} strokeWidth={1.9} />
                </button>
              </motion.li>
            )
          })}
        </AnimatePresence>

        {!loading && guests.length === 0 && (
          <motion.li className="empty guest-list-empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <span className="guest-empty-icon"><AppIcon icon={UsersRound} size={24} /></span>
            <span>{t.empty}</span>
          </motion.li>
        )}
        {!loading && guests.length > 0 && visible.length === 0 && (
          <motion.li className="empty guest-list-empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <span className="guest-empty-icon"><AppIcon icon={Search} size={22} /></span>
            <span>{t.noResults}</span>
          </motion.li>
        )}
      </ul>
    </>
  )
}

function EditableGuestName({ guest, t, updateGuest }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(guest.name)

  useEffect(() => {
    if (!editing) setDraft(guest.name)
  }, [guest.name, editing])

  function cancel() {
    setDraft(guest.name)
    setEditing(false)
  }

  function save(event) {
    event.preventDefault()
    const name = draft.trim()
    if (!name) return
    setDraft(name)
    setEditing(false)
    if (name !== guest.name) updateGuest(guest.id, { name })
  }

  if (editing) {
    return (
      <form className="guest-name-editor" onSubmit={save}>
        <input
          autoFocus
          type="text"
          value={draft}
          maxLength={200}
          aria-label={t.guestName}
          onChange={(event) => setDraft(event.target.value)}
          onFocus={(event) => event.target.select()}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.preventDefault()
              cancel()
            }
          }}
        />
        <button
          type="submit"
          className="guest-name-save"
          disabled={!draft.trim()}
          aria-label={t.saveGuestName}
          title={t.saveGuestName}
        >
          <AppIcon icon={CheckIcon} size={15} />
        </button>
        <button
          type="button"
          className="guest-name-cancel"
          onClick={cancel}
          aria-label={t.cancelGuestName}
          title={t.cancelGuestName}
        >
          <AppIcon icon={X} size={15} />
        </button>
      </form>
    )
  }

  return (
    <span className="guest-name-row">
      <span className="guest-name" title={guest.name}>{guest.name}</span>
      <button
        type="button"
        className="guest-name-edit"
        onClick={() => setEditing(true)}
        aria-label={t.editGuestName(guest.name)}
        title={t.editGuestName(guest.name)}
      >
        <AppIcon icon={Pencil} size={13} strokeWidth={1.9} />
      </button>
    </span>
  )
}

function initials(name) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => Array.from(part)[0] || '')
    .join('')
    .toLocaleUpperCase()
}

function Stat({ label, value, accent, hint, icon }) {
  return (
    <div className={`stat ${accent ? `stat--${accent}` : ''}`}>
      {icon && <span className="stat-icon"><AppIcon icon={icon} size={18} /></span>}
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

// Three-way reply status control. No button active means the guest is still 'pending';
// clicking the active status returns them to pending.
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
