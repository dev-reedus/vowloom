import { useEffect, useState } from 'react'
import { api } from '../api'
import { getStoredLang, LANG_KEY, nextLang, normalizeLang, translations } from '../i18n'

export default function GalleryPage({ token }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [active, setActive] = useState(null)
  const [downloadingId, setDownloadingId] = useState(null)
  const [lang, setLang] = useState(() => getStoredLang() || 'it')
  const t = translations[lang]

  useEffect(() => {
    let alive = true
    api
      .gallery(token)
      .then((payload) => {
        if (!alive) return
        setData(payload)
        if (!getStoredLang()) setLang(normalizeLang(payload?.guest?.default_lang))
      })
      .catch(() => alive && setError(t.galleryInvalidLink))
      .finally(() => alive && setLoading(false))
    return () => {
      alive = false
    }
  }, [token])

  useEffect(() => {
    document.documentElement.lang = lang
  }, [lang])

  function changeLang() {
    setLang((current) => {
      const next = nextLang(current)
      try {
        localStorage.setItem(LANG_KEY, next)
      } catch {
        /* ignore */
      }
      return next
    })
  }

  async function downloadOriginal(photo) {
    setDownloadingId(photo.id)
    try {
      const { url } = await api.originalDownloadUrl(photo.id, token)
      window.location.href = url
    } catch (err) {
      console.error('Failed to create download URL', err)
      alert(t.galleryDownloadError)
    } finally {
      setDownloadingId(null)
    }
  }

  if (loading) {
    return (
      <main className="gallery-page gallery-state">
        <p>{t.galleryLoading}</p>
      </main>
    )
  }

  if (error) {
    return (
      <main className="gallery-page gallery-state">
        <h1>{t.galleryUnavailableTitle}</h1>
        <p>{error}</p>
      </main>
    )
  }

  const photos = data?.photos || []

  return (
    <main className="gallery-page">
      <button
        className="lang-toggle gallery-lang-toggle"
        onClick={changeLang}
        aria-label="Change language"
        title="Change language"
      >
        {t.langLabel}
      </button>

      <header className="gallery-head">
        <p className="kicker">Marius & Giorgiana</p>
        <h1>{data?.album?.title || t.galleryDefaultTitle}</h1>
        <p>{data?.guest?.label ? t.galleryPrivateFor(data.guest.label) : t.galleryPrivate}</p>
      </header>

      {photos.length === 0 ? (
        <section className="gallery-empty">
          <h2>{t.galleryEmptyTitle}</h2>
          <p>{t.galleryEmptyBody}</p>
        </section>
      ) : (
        <section className="photo-grid" aria-label={t.galleryPhotosLabel}>
          {photos.map((photo) => (
            <button key={photo.id} className="photo-tile" onClick={() => setActive(photo)}>
              {photo.thumb_url ? (
                <img src={photo.thumb_url} alt={photo.title} loading="lazy" />
              ) : (
                <span>{photo.title}</span>
              )}
            </button>
          ))}
        </section>
      )}

      {active && (
        <div className="lightbox" role="dialog" aria-modal="true" aria-label={active.title}>
          <button className="lightbox-close" onClick={() => setActive(null)} aria-label={t.galleryClose}>
            x
          </button>
          <div className="lightbox-media">
            {active.display_url ? <img src={active.display_url} alt={active.title} /> : <p>{active.title}</p>}
          </div>
          <div className="lightbox-bar">
            <strong>{active.title}</strong>
            <button onClick={() => downloadOriginal(active)} disabled={downloadingId === active.id}>
              {downloadingId === active.id ? t.galleryPreparing : t.galleryDownloadOriginal}
            </button>
          </div>
        </div>
      )}
    </main>
  )
}
