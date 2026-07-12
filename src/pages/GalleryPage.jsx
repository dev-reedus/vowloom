import { useEffect, useRef, useState } from 'react'
import 'photoswipe/style.css'
import { api } from '../api'
import { getStoredGalleryLang, nextLang, normalizeLang, setStoredGalleryLang, translations } from '../i18n'
import { GALLERY_PAGE_SIZE } from './gallery/galleryUtils'
import GalleryPhotoTile from './gallery/GalleryPhotoTile'
import useGalleryLightbox from './gallery/useGalleryLightbox'

export default function GalleryPage({
  token,
  isAdmin = false,
  preview = false,
  lang: forcedLang = '',
  showLangToggle = true,
  publicConfig = { couple_names: 'The Couple' },
}) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState('')
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

  const photos = data?.photos || []

  useEffect(() => {
    photosRef.current = photos
    tokenRef.current = token
    tRef.current = t
    loadingMoreRef.current = loadingMore
  }, [photos, token, t, loadingMore])

  useGalleryLightbox({
    photosLength: photos.length,
    preview,
    photosRef,
    tRef,
    onDownloadOriginal: downloadOriginal,
    onDeletePhoto: deletePreviewPhoto,
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
      alert(tRef.current.galleryDownloadError)
    } finally {
      if (button) {
        button.disabled = false
        button.textContent = previousText
      }
    }
  }

  async function deletePreviewPhoto(photo, button, pswp) {
    if (!preview) return
    if (!window.confirm(tRef.current.galleryAdminDeleteConfirm(photo.title))) return
    const previousText = button?.textContent || tRef.current.galleryAdminDelete
    if (button) {
      button.disabled = true
      button.textContent = tRef.current.galleryPreparing
    }
    try {
      await api.deleteGalleryPhoto(photo.id)
      pswp?.close()
      setData((current) => {
        if (!current) return current
        return {
          ...current,
          photos: (current.photos || []).filter((item) => item.id !== photo.id),
          total: Math.max(0, Number(current.total || 0) - 1),
        }
      })
      setPageInfo((current) => ({
        ...current,
        next_offset: Math.max(0, Number(current.next_offset || 0) - 1),
      }))
    } catch (err) {
      console.error('Failed to delete gallery photo', err)
      alert(tRef.current.galleryAdminDeleteError)
    } finally {
      if (button) {
        button.disabled = false
        button.textContent = previousText
      }
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
        <h1 className="script">{data?.album?.title || t.galleryDefaultTitle}</h1>
        <p>
          {preview
            ? t.galleryPreviewLabel
            : data?.guest?.label
              ? t.galleryPrivateFor(data.guest.label)
              : t.galleryPrivate}
        </p>
      </header>

      {photos.length === 0 ? (
        <section className="gallery-empty">
          <h2>{t.galleryEmptyTitle}</h2>
          <p>{t.galleryEmptyBody}</p>
        </section>
      ) : (
        <section className="photo-grid" aria-label={t.galleryPhotosLabel}>
          {photos.map((photo) => (
            <GalleryPhotoTile key={photo.id} photo={photo} />
          ))}
        </section>
      )}

      {pageInfo.has_more && (
        <div className="gallery-load-more" ref={loadMoreRef}>
          {loadingMore ? t.galleryLoading : ''}
        </div>
      )}
    </main>
  )
}
