import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { DatabaseBackup } from 'lucide-react'
import AppIcon from './components/AppIcon'
import { LANG_KEY, loadLang, nextLang, translations } from './i18n'
import { api } from './api'
import GuestListPage from './pages/GuestListPage'
import GalleryAdminPage from './pages/GalleryAdminPage'
import GalleryPage from './pages/GalleryPage'
import GuestLinksAdminPage from './pages/GuestLinksAdminPage'
import SeatingPage from './pages/SeatingPage'
import LoginView from './pages/LoginView'
import './App.css'

const FALLBACK_PUBLIC_CONFIG = {
  couple_names: 'The Couple',
  wedding_year: '',
  default_language: 'it',
}

function galleryTokenFromPath() {
  const match = window.location.pathname.match(/^\/g\/([^/]+)\/?$/)
  return match ? decodeURIComponent(match[1]) : null
}

export default function App() {
  const [publicConfig, setPublicConfig] = useState(null)
  const galleryToken = galleryTokenFromPath()

  useEffect(() => {
    let alive = true
    api
      .publicConfig()
      .then((config) => alive && setPublicConfig({ ...FALLBACK_PUBLIC_CONFIG, ...config }))
      .catch(() => alive && setPublicConfig(FALLBACK_PUBLIC_CONFIG))
    return () => {
      alive = false
    }
  }, [])

  useEffect(() => {
    if (publicConfig) document.title = `${publicConfig.couple_names} · Vowloom`
  }, [publicConfig])

  if (!publicConfig) return null
  if (galleryToken) return <GalleryPage token={galleryToken} publicConfig={publicConfig} />
  return <AuthGate publicConfig={publicConfig} />
}

// Bootstrap the session: GET /api/me decides login screen vs. the app.
function AuthGate({ publicConfig }) {
  const [role, setRole] = useState(null)
  const [checked, setChecked] = useState(false)
  const [lang, setLang] = useState(() => loadLang(publicConfig.default_language))
  const t = { ...translations[lang], title: publicConfig.couple_names }

  useEffect(() => {
    let alive = true
    api
      .me()
      .then((me) => alive && setRole(me?.role || null))
      .catch(() => alive && setRole(null))
      .finally(() => alive && setChecked(true))
    return () => {
      alive = false
    }
  }, [])

  useEffect(
    () =>
      api.onUnauthorized(() => {
        setRole(null)
        setChecked(true)
      }),
    [],
  )

  useEffect(() => {
    localStorage.setItem(LANG_KEY, lang)
    document.documentElement.lang = lang
  }, [lang])

  if (!checked) return null // brief bootstrap; avoids flashing the login screen
  if (!role) return <LoginView t={t} onLogin={setRole} lang={lang} setLang={setLang} />
  return (
    <AdminApp
      role={role}
      lang={lang}
      setLang={setLang}
      onLoggedOut={() => setRole(null)}
      publicConfig={publicConfig}
    />
  )
}

function AdminApp({ role, lang, setLang, onLoggedOut, publicConfig }) {
  const [guests, setGuests] = useState([])
  const [tables, setTables] = useState([])
  const [floorplan, setFloorplan] = useState(null)
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState('list') // 'list' | 'seating' | 'galleryAdmin' | 'galleryPreview' | 'guestLinks'
  const isAdmin = role === 'admin'
  const t = { ...translations[lang], title: publicConfig.couple_names }

  // Load seating data and the configurable room on mount.
  useEffect(() => {
    let alive = true
    Promise.all([api.list(), api.listTables(), api.floorplan()])
      .then(([g, tb, fp]) => {
        if (!alive) return
        setGuests(g)
        setTables(tb)
        setFloorplan(fp)
      })
      .catch((err) => console.error('Failed to load data', err))
      .finally(() => alive && setLoading(false))
    return () => {
      alive = false
    }
  }, [])

  async function logout() {
    try {
      await api.logout()
    } catch (err) {
      console.error('Failed to log out', err)
    }
    onLoggedOut()
  }

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

  async function updateFloorplan(data) {
    const saved = await api.updateFloorplan(floorplan.revision, data)
    setFloorplan(saved)
    return saved
  }

  async function uploadFloorplanBackground(file) {
    const saved = await api.uploadFloorplanBackground(file)
    setFloorplan(saved)
    return saved
  }

  async function removeFloorplanBackground() {
    await api.removeFloorplanBackground()
    setFloorplan((current) => current && {
      ...current,
      has_background: false,
      background_revision: null,
    })
  }

  return (
    <div className={`page ${['galleryAdmin', 'galleryPreview', 'guestLinks'].includes(view) ? 'page--wide' : ''} ${view === 'seating' ? 'page--planning' : ''}`}>
      <div className="page-actions">
        <button className="logout-btn" onClick={logout} title={t.logout}>
          {t.logout}
        </button>

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
      </div>

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
        <button className={view === 'galleryPreview' ? 'on' : ''} onClick={() => setView('galleryPreview')}>
          {t.navGalleryPreview}
        </button>
        {isAdmin && (
          <button className={view === 'guestLinks' ? 'on' : ''} onClick={() => setView('guestLinks')}>
            {t.navGuestLinks}
          </button>
        )}
      </nav>

      {view === 'galleryAdmin' ? (
        <GalleryAdminPage isAdmin={isAdmin} t={t} lang={lang} />
      ) : view === 'galleryPreview' ? (
        <GalleryPage
          preview
          lang={lang}
          showLangToggle={false}
          publicConfig={publicConfig}
        />
      ) : view === 'guestLinks' && isAdmin ? (
        <GuestLinksAdminPage isAdmin={isAdmin} t={t} lang={lang} />
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
          floorplan={floorplan}
          loading={loading}
          updateGuest={updateGuest}
          updateTable={updateTable}
          addTable={addTable}
          removeTable={removeTable}
          updateFloorplan={updateFloorplan}
          uploadFloorplanBackground={uploadFloorplanBackground}
          removeFloorplanBackground={removeFloorplanBackground}
          printTitle={t.printWeddingTitle(publicConfig.couple_names)}
        />
      )}

      <footer className="foot">
        {isAdmin && (
          <a className="backup-btn" href="/api/backup" title={t.backupTitle} download>
            <AppIcon icon={DatabaseBackup} />
            {t.backup}
          </a>
        )}
        <span className="foot-credit">
          {t.footerCredit(publicConfig.couple_names, publicConfig.wedding_year)}
        </span>
      </footer>
    </div>
  )
}
