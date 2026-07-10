import { useEffect, useRef, useState } from 'react'
import PhotoSwipeLightbox from 'photoswipe/lightbox'
import 'photoswipe/style.css'
import { api } from '../api'
import { getStoredGalleryLang, nextLang, normalizeLang, setStoredGalleryLang, translations } from '../i18n'

const GALLERY_PAGE_SIZE = 48

function photoDimensions(photo) {
  const width = Number(photo?.width) > 0 ? Number(photo.width) : 1600
  const height = Number(photo?.height) > 0 ? Number(photo.height) : Math.round(width * 0.667)
  return { width, height }
}

function photoLightboxUrl(photo) {
  return photo?.display_url || photo?.thumb_url || ''
}

function photoTileUrl(photo) {
  return photo?.display_url || photo?.thumb_url || ''
}

function photoTileRowsForWidth(dimensions, tileWidth = 280, rowHeight = 8, rowGap = 0) {
  const { width, height } = dimensions
  const ratio = height / width
  const targetHeight = Math.max(1, tileWidth * ratio)
  const span = Math.ceil((targetHeight + rowGap) / (rowHeight + rowGap))
  return Math.max(4, Math.min(80, span))
}

function updateDownloadButton(button, pswp, photos, t) {
  const photo = photos[pswp.currIndex]
  button.textContent = t.galleryDownloadOriginal
  button.setAttribute('aria-label', t.galleryDownloadOriginal)
  button.title = t.galleryDownloadOriginal
  button.disabled = !photo?.has_original
}

function updateCaption(caption, pswp, photos) {
  const title = photos[pswp.currIndex]?.title || ''
  caption.textContent = title
  caption.hidden = !title
}

function GalleryPhotoTile({ photo }) {
  const ref = useRef(null)
  const dimensions = photoDimensions(photo)
  const [rowSpan, setRowSpan] = useState(() => photoTileRowsForWidth(dimensions, 280, 8, 14.4))
  const url = photoLightboxUrl(photo)
  const tileUrl = photoTileUrl(photo)

  useEffect(() => {
    const node = ref.current
    if (!node) return undefined

    function updateSpan() {
      const parentStyle = node.parentElement ? window.getComputedStyle(node.parentElement) : null
      const rowHeight = parentStyle ? Number.parseFloat(parentStyle.gridAutoRows) || 8 : 8
      const rowGap = parentStyle ? Number.parseFloat(parentStyle.rowGap) || 0 : 0
      const tileWidth = node.getBoundingClientRect().width || 280
      const nextSpan = photoTileRowsForWidth(dimensions, tileWidth, rowHeight, rowGap)
      setRowSpan((current) => (current === nextSpan ? current : nextSpan))
    }

    updateSpan()
    const observer = new ResizeObserver(updateSpan)
    observer.observe(node)
    return () => observer.disconnect()
  }, [dimensions.width, dimensions.height])

  if (!url) {
    return (
      <span className="photo-tile photo-tile--empty" style={{ gridRowEnd: `span ${rowSpan}` }}>
        <span>{photo.title}</span>
      </span>
    )
  }

  return (
    <a
      ref={ref}
      className="photo-tile"
      href={url}
      data-pswp-width={dimensions.width}
      data-pswp-height={dimensions.height}
      style={{
        aspectRatio: `${dimensions.width} / ${dimensions.height}`,
        gridRowEnd: `span ${rowSpan}`,
      }}
    >
      {tileUrl ? (
        <img src={tileUrl} alt={photo.title} loading="lazy" decoding="async" />
      ) : (
        <span>{photo.title}</span>
      )}
    </a>
  )
}

export default function GalleryPage({ token, adminKey = '', preview = false, lang: forcedLang = '', showLangToggle = true }) {
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
  const adminKeyRef = useRef(adminKey)
  const tRef = useRef(t)
  const loadingMoreRef = useRef(false)
  const loadMoreRef = useRef(null)

  useEffect(() => {
    let alive = true
    setLoading(true)
    setError('')
    setPageInfo({ has_more: false, next_offset: 0 })
    const params = { limit: GALLERY_PAGE_SIZE, offset: 0 }
    const request = preview ? api.galleryPreview(adminKey, params) : api.gallery(token, params)
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
  }, [token, adminKey, preview, forcedLang])

  useEffect(() => {
    document.documentElement.lang = lang
  }, [lang])

  const photos = data?.photos || []

  useEffect(() => {
    photosRef.current = photos
    tokenRef.current = token
    adminKeyRef.current = adminKey
    tRef.current = t
    loadingMoreRef.current = loadingMore
  }, [photos, token, adminKey, t, loadingMore])

  useEffect(() => {
    if (photos.length === 0) return undefined

    let downloadButton = null
    let deleteButton = null
    let caption = null
    let activeTile = null
    const lightbox = new PhotoSwipeLightbox({
      gallery: '.photo-grid',
      children: 'a.photo-tile',
      pswpModule: () => import('photoswipe'),
      bgOpacity: 1,
      showHideAnimationType: 'zoom',
      showAnimationDuration: 260,
      hideAnimationDuration: 220,
      thumbSelector: 'img',
      padding: { top: 52, right: 16, bottom: 72, left: 16 },
    })

    lightbox.addFilter('clickedIndex', (clickedIndex, event) => {
      activeTile = event.target?.closest?.('.photo-tile') || null
      return clickedIndex
    })

    lightbox.on('uiRegister', () => {
      lightbox.pswp.ui.registerElement({
        name: 'download-original',
        className: 'pswp__button--download-original',
        isButton: true,
        order: 9,
        html: tRef.current.galleryDownloadOriginal,
        title: tRef.current.galleryDownloadOriginal,
        ariaLabel: tRef.current.galleryDownloadOriginal,
        onInit: (element, pswp) => {
          downloadButton = element
          updateDownloadButton(element, pswp, photosRef.current, tRef.current)
        },
        onClick: async (_event, element, pswp) => {
          const photo = photosRef.current[pswp.currIndex]
          if (!photo?.has_original || element.disabled) return
          await downloadOriginal(photo, element)
        },
      })

      if (preview) {
        lightbox.pswp.ui.registerElement({
          name: 'delete-photo',
          className: 'pswp__button--delete-photo',
          isButton: true,
          order: 10,
          html: tRef.current.galleryAdminDelete,
          title: tRef.current.galleryAdminDelete,
          ariaLabel: tRef.current.galleryAdminDelete,
          onInit: (element) => {
            deleteButton = element
          },
          onClick: async (_event, element, pswp) => {
            const photo = photosRef.current[pswp.currIndex]
            if (!photo || element.disabled) return
            await deletePreviewPhoto(photo, element, pswp)
          },
        })
      }

      lightbox.pswp.ui.registerElement({
        name: 'caption',
        className: 'pswp__caption',
        appendTo: 'root',
        onInit: (element, pswp) => {
          caption = element
          updateCaption(element, pswp, photosRef.current)
        },
      })
    })

    lightbox.on('change', () => {
      if (downloadButton && lightbox.pswp) {
        updateDownloadButton(downloadButton, lightbox.pswp, photosRef.current, tRef.current)
      }
      if (deleteButton) {
        deleteButton.textContent = tRef.current.galleryAdminDelete
        deleteButton.title = tRef.current.galleryAdminDelete
        deleteButton.setAttribute('aria-label', tRef.current.galleryAdminDelete)
      }
      if (caption && lightbox.pswp) {
        updateCaption(caption, lightbox.pswp, photosRef.current)
      }
    })

    lightbox.on('openingAnimationStart', () => {
      activeTile?.classList.add('is-pswp-source')
    })

    lightbox.on('destroy', () => {
      activeTile?.classList.remove('is-pswp-source')
      activeTile = null
    })

    lightbox.init()

    return () => {
      lightbox.destroy()
    }
  }, [photos.length, preview])

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
      const payload = preview ? await api.galleryPreview(adminKeyRef.current, params) : await api.gallery(tokenRef.current, params)
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
        ? await api.adminOriginalDownloadUrl(adminKeyRef.current, photo.id)
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
      await api.deleteGalleryPhoto(adminKeyRef.current, photo.id)
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
        <p className="kicker">Marius & Giorgiana</p>
        <h1>{data?.album?.title || t.galleryDefaultTitle}</h1>
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
