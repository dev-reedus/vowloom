import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { ImageOff, Images, LoaderCircle, Sparkles } from 'lucide-react'
import 'photoswipe/style.css'
import { api } from '../api'
import AppIcon from '../components/AppIcon'
import { getStoredGalleryLang, nextLang, normalizeLang, setStoredGalleryLang, translations } from '../i18n'
import { GALLERY_PAGE_SIZE } from './gallery/galleryUtils'
import GalleryPhotoTile from './gallery/GalleryPhotoTile'
import useGalleryLightbox from './gallery/useGalleryLightbox'

export default function GalleryPage({
  token,
  preview = false,
  lang: forcedLang = '',
  showLangToggle = true,
  publicConfig = { couple_names: 'The Couple' },
}) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [pageInfo, setPageInfo] = useState({ has_more: false, next_offset: 0 })
  const [localLang, setLocalLang] = useState(() => getStoredGalleryLang() || 'it')
  const lang = normalizeLang(forcedLang || localLang)
  const t = translations[lang]
  const photosRef = useRef([])
  const tokenRef = useRef(token)
  const tRef = useRef(t)
  const loadingMoreRef = useRef(false)
  const loadMoreRef = useRef(null)

  useEffect(() => {
    let alive = true
    setLoading(true)
    setError('')
    setPageInfo({ has_more: false, next_offset: 0 })
    const params = { limit: GALLERY_PAGE_SIZE, offset: 0 }
    const request = preview ? api.galleryPreview(params) : api.gallery(token, params)
    request
      .then((payload) => {
        if (!alive) return
        setData(payload)
        setPageInfo({
          has_more: !!payload?.has_more,
          next_offset: Number(payload?.next_offset) || 0,
        })
        if (!forcedLang && !getStoredGalleryLang()) setLocalLang(normalizeLang(payload?.guest?.default_lang))
      })
      .catch(() => alive && setError(t.galleryInvalidLink))
      .finally(() => alive && setLoading(false))
    return () => {
      alive = false
    }
  }, [token, preview, forcedLang])

  useEffect(() => {
    document.documentElement.lang = lang
  }, [lang])

  useEffect(() => {
    if (!notice) return undefined
    const timeout = window.setTimeout(() => setNotice(''), 4500)
    return () => window.clearTimeout(timeout)
  }, [notice])

  const photos = data?.photos || []

  useEffect(() => {
    photosRef.current = photos
    tokenRef.current = token
    tRef.current = t
    loadingMoreRef.current = loadingMore
  }, [photos, token, t, loadingMore])

  useGalleryLightbox({
    photosLength: photos.length,
    photosRef,
    tRef,
    onDownloadOriginal: downloadOriginal,
  })

  useEffect(() => {
    const target = loadMoreRef.current
    if (!target || !pageInfo.has_more) return undefined

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) loadMorePhotos()
      },
      { rootMargin: '600px 0px' },
    )
    observer.observe(target)
    return () => observer.disconnect()
  }, [pageInfo.has_more, pageInfo.next_offset])

  async function loadMorePhotos() {
    if (loadingMoreRef.current || !pageInfo.has_more) return
    loadingMoreRef.current = true
    setLoadingMore(true)
    try {
      const params = { limit: GALLERY_PAGE_SIZE, offset: pageInfo.next_offset }
      const payload = preview ? await api.galleryPreview(params) : await api.gallery(tokenRef.current, params)
      setData((current) => ({
        ...(current || payload),
        photos: [...(current?.photos || []), ...(payload?.photos || [])],
        total: payload?.total,
      }))
      setPageInfo({
        has_more: !!payload?.has_more,
        next_offset: Number(payload?.next_offset) || pageInfo.next_offset,
      })
    } catch (err) {
      console.error('Failed to load more gallery photos', err)
      setNotice(tRef.current.galleryLoadMoreError)
    } finally {
      loadingMoreRef.current = false
      setLoadingMore(false)
    }
  }

  function changeLang() {
    setLocalLang((current) => {
      const next = nextLang(current)
      setStoredGalleryLang(next)
      return next
    })
  }

  async function downloadOriginal(photo, button) {
    const previousText = button?.textContent || tRef.current.galleryDownloadOriginal
    if (button) {
      button.disabled = true
      button.textContent = tRef.current.galleryPreparing
    }
    try {
      const { url } = preview
        ? await api.adminOriginalDownloadUrl(photo.id)
        : await api.originalDownloadUrl(photo.id, tokenRef.current)
      window.location.href = url
    } catch (err) {
      console.error('Failed to create download URL', err)
      setNotice(tRef.current.galleryDownloadError)
    } finally {
      if (button) {
        button.disabled = false
        button.textContent = previousText
      }
    }
  }

  const totalPhotos = Math.max(photos.length, Number(data?.total) || 0)

  return (
    <main className="gallery-page">
      {showLangToggle && (
        <button
          className="lang-toggle gallery-lang-toggle"
          onClick={changeLang}
          aria-label="Change language"
          title="Change language"
        >
          {t.langLabel}
        </button>
      )}

      <header className="gallery-head">
        <p className="kicker">{publicConfig.couple_names}</p>
        <h1 className="script">{t.galleryDefaultTitle}</h1>
        <span className="gallery-head-divider" aria-hidden="true"><span /></span>
        <p>
          {preview
            ? t.galleryPreviewLabel
            : data?.guest?.label
              ? t.galleryPrivateFor(data.guest.label)
              : t.galleryPrivate}
        </p>
        {!loading && !error && totalPhotos > 0 && (
          <span className="gallery-photo-count">
            <AppIcon icon={Images} size={15} />
            {t.galleryPhotoCount(totalPhotos)}
          </span>
        )}
      </header>

      {loading ? (
        <section className="gallery-loading" aria-live="polite" aria-label={t.galleryLoading}>
          <div className="gallery-loading-label">
            <AppIcon icon={LoaderCircle} className="gallery-spin" size={17} />
            {t.galleryLoading}
          </div>
          <div className="gallery-skeleton-grid" aria-hidden="true">
            {Array.from({ length: 8 }, (_, index) => (
              <span key={index} className={`gallery-skeleton-card gallery-skeleton-card--${(index % 4) + 1}`} />
            ))}
          </div>
        </section>
      ) : error ? (
        <motion.section
          className="gallery-error"
          role="alert"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <span className="gallery-error-icon" aria-hidden="true">
            <AppIcon icon={ImageOff} size={30} strokeWidth={1.55} />
          </span>
          <h2>{t.galleryUnavailableTitle}</h2>
          <p>{error}</p>
        </motion.section>
      ) : photos.length === 0 ? (
        <motion.section
          className="gallery-empty"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, ease: 'easeOut' }}
        >
          <div className="gallery-empty-mark" aria-hidden="true">
            <span className="gallery-empty-card is-back" />
            <span className="gallery-empty-card is-front">
              <AppIcon icon={Images} size={35} strokeWidth={1.55} />
            </span>
            <AppIcon icon={Sparkles} className="gallery-empty-sparkle" size={23} strokeWidth={1.7} />
          </div>
          <span className="gallery-empty-kicker">{t.galleryEmptyKicker}</span>
          <h2>{t.galleryEmptyTitle}</h2>
          <p>{t.galleryEmptyBody}</p>
        </motion.section>
      ) : (
        <section className="photo-grid" aria-label={t.galleryPhotosLabel}>
          {photos.map((photo, index) => (
            <GalleryPhotoTile key={photo.id} photo={photo} index={index} />
          ))}
        </section>
      )}

      {!loading && !error && pageInfo.has_more && (
        <div className="gallery-load-more" ref={loadMoreRef} role="status" aria-live="polite">
          <button type="button" onClick={loadMorePhotos} disabled={loadingMore}>
            {loadingMore && <AppIcon icon={LoaderCircle} className="gallery-spin" size={16} />}
            {loadingMore ? t.galleryLoading : t.galleryLoadMore}
          </button>
        </div>
      )}

      <AnimatePresence>
        {notice && (
          <motion.div
            className="gallery-notice"
            role="status"
            aria-live="polite"
            initial={{ opacity: 0, y: 12, x: '-50%' }}
            animate={{ opacity: 1, y: 0, x: '-50%' }}
            exit={{ opacity: 0, y: 8, x: '-50%' }}
          >
            {notice}
          </motion.div>
        )}
      </AnimatePresence>
    </main>
  )
}
