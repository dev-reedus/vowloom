import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { LANG_KEY, loadLang, nextLang, translations } from './i18n'
import { api } from './api'
import GuestListPage from './pages/GuestListPage'
import GalleryAdminPage from './pages/GalleryAdminPage'
import GalleryPage from './pages/GalleryPage'
import GuestLinksAdminPage from './pages/GuestLinksAdminPage'
import SeatingPage from './pages/SeatingPage'
import './App.css'

function galleryTokenFromPath() {
  const match = window.location.pathname.match(/^\/g\/([^/]+)\/?$/)
  return match ? decodeURIComponent(match[1]) : null
}

export default function App() {
  const galleryToken = galleryTokenFromPath()
  if (galleryToken) return <GalleryPage token={galleryToken} />
  return <AdminApp />
}

function AdminApp() {
  const [guests, setGuests] = useState([])
  const [tables, setTables] = useState([])
  const [loading, setLoading] = useState(true)
  const [lang, setLang] = useState(loadLang)
  const [view, setView] = useState('list') // 'list' | 'seating' | 'galleryAdmin' | 'guestLinksAdmin'
  // Admin-only tools (e.g. DB backup) are gated behind localStorage mode="admin".
  const [adminKey] = useState(() => {
    try {
      return localStorage.getItem('adminKey') || (localStorage.getItem('mode') === 'admin' ? 'admin' : '')
    } catch {
      return ''
    }
  })
  const hasLocalAdminKey = !!adminKey
  const t = translations[lang]

  // Load guests + tables on mount.
  useEffect(() => {
    let alive = true
    Promise.all([api.list(), api.listTables()])
      .then(([g, tb]) => {
        if (!alive) return
        setGuests(g)
        setTables(tb)
      })
      .catch((err) => console.error('Failed to load data', err))
      .finally(() => alive && setLoading(false))
    return () => {
      alive = false
    }
  }, [])

  useEffect(() => {
    localStorage.setItem(LANG_KEY, lang)
    document.documentElement.lang = lang
  }, [lang])

  // ---- guest handlers (optimistic) ----
  async function addGuest(name) {
    try {
      const created = await api.add(name)
      setGuests((prev) => [...prev, created])
    } catch (err) {
      console.error('Failed to add guest', err)
    }
  }

  async function updateGuest(id, fields) {
    const snapshot = guests
    setGuests((prev) => prev.map((g) => (g.id === id ? { ...g, ...fields } : g)))
    try {
      const saved = await api.update(id, fields)
      setGuests((prev) => prev.map((g) => (g.id === id ? saved : g)))
    } catch (err) {
      console.error('Failed to update guest', err)
      setGuests(snapshot)
    }
  }

  async function removeGuest(id) {
    const snapshot = guests
    setGuests((prev) => prev.filter((g) => g.id !== id))
    try {
      await api.remove(id)
    } catch (err) {
      console.error('Failed to remove guest', err)
      setGuests(snapshot)
    }
  }

  // ---- table handlers (optimistic) ----
  async function addTable(fields) {
    try {
      const created = await api.addTable(fields)
      setTables((prev) => [...prev, created])
    } catch (err) {
      console.error('Failed to add table', err)
    }
  }

  async function updateTable(id, fields) {
    const snapshot = tables
    setTables((prev) => prev.map((tb) => (tb.id === id ? { ...tb, ...fields } : tb)))
    try {
      const saved = await api.updateTable(id, fields)
      setTables((prev) => prev.map((tb) => (tb.id === id ? saved : tb)))
    } catch (err) {
      console.error('Failed to update table', err)
      setTables(snapshot)
    }
  }

  async function removeTable(id) {
    const tSnap = tables
    const gSnap = guests
    setTables((prev) => prev.filter((tb) => tb.id !== id))
    // guests seated there get freed server-side; mirror that locally
    setGuests((prev) => prev.map((g) => (g.table_id === id ? { ...g, table_id: null } : g)))
    try {
      await api.removeTable(id)
    } catch (err) {
      console.error('Failed to remove table', err)
      setTables(tSnap)
      setGuests(gSnap)
    }
  }

  return (
    <div className="page">
      <motion.button
        className="lang-toggle"
        onClick={() => setLang((p) => nextLang(p))}
        whileHover={{ scale: 1.06 }}
        whileTap={{ scale: 0.94 }}
        aria-label="Change language"
        title="Change language"
      >
        {t.langLabel}
      </motion.button>

      <nav className="tabs">
        <button className={view === 'list' ? 'on' : ''} onClick={() => setView('list')}>
          {t.navList}
        </button>
        <button className={view === 'seating' ? 'on' : ''} onClick={() => setView('seating')}>
          {t.navSeating}
        </button>
        <button className={view === 'galleryAdmin' ? 'on' : ''} onClick={() => setView('galleryAdmin')}>
          {t.navGallery}
        </button>
        <button className={view === 'guestLinksAdmin' ? 'on' : ''} onClick={() => setView('guestLinksAdmin')}>
          {t.navGuestLinks}
        </button>
      </nav>

      {view === 'galleryAdmin' ? (
        <GalleryAdminPage adminKey={adminKey} t={t} />
      ) : view === 'guestLinksAdmin' ? (
        <GuestLinksAdminPage adminKey={adminKey} t={t} />
      ) : view === 'list' ? (
        <GuestListPage
          t={t}
          guests={guests}
          loading={loading}
          addGuest={addGuest}
          updateGuest={updateGuest}
          removeGuest={removeGuest}
        />
      ) : (
        <SeatingPage
          t={t}
          guests={guests}
          tables={tables}
          loading={loading}
          updateGuest={updateGuest}
          updateTable={updateTable}
          addTable={addTable}
          removeTable={removeTable}
        />
      )}

      <footer className="foot">
        {hasLocalAdminKey && (
          <a className="backup-btn" href="/api/backup" title={t.backupTitle} download>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path
                d="M12 3v12m0 0l-4-4m4 4l4-4M5 21h14"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            {t.backup}
          </a>
        )}
        <span className="foot-credit">Nozze di Marius e Giorgiana - 2026</span>
      </footer>
    </div>
  )
}
