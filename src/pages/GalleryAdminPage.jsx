import { useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  ChevronDown,
  CircleAlert,
  CircleCheck,
  CloudUpload,
  Database,
  Download,
  HardDrive,
  Image as ImageIcon,
  Images,
  KeyRound,
  Link2,
  LoaderCircle,
  LockKeyhole,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  WandSparkles,
} from 'lucide-react'
import { api } from '../api'
import { AdminNumberInput, AdminTextInput, UploadDropzone, formatBytes } from '../components/AdminControls'
import AppIcon from '../components/AppIcon'
import { GuestLinksTable } from './GuestLinksAdminPage'
import useUploadQueue from './gallery/useUploadQueue'
import GalleryUploadQueue from './gallery/GalleryUploadQueue'

export default function GalleryAdminPage({ isAdmin, t, lang = 'it' }) {
  const [photos, setPhotos] = useState([])
  const [adminStatus, setAdminStatus] = useState(null)
  const [budgetInput, setBudgetInput] = useState('')
  const [importPrefix, setImportPrefix] = useState('originals/')
  const [photoFields, setPhotoFields] = useState({ title: '', original_key: '', thumb_key: '', display_key: '' })
  const [guestTokens, setGuestTokens] = useState([])
  const [status, setStatus] = useState('')
  const [loadError, setLoadError] = useState('')
  const [loading, setLoading] = useState(true)
  const [libraryOpen, setLibraryOpen] = useState(false)
  const [libraryLoading, setLibraryLoading] = useState(false)
  const [libraryPreviewsLoaded, setLibraryPreviewsLoaded] = useState(false)
  const [generatingIds, setGeneratingIds] = useState(() => new Set())
  const [deletingIds, setDeletingIds] = useState(() => new Set())

  const mergePhoto = (photo) =>
    setPhotos((prev) => [photo, ...prev.filter((item) => item.id !== photo.id)])

  const {
    uploadQueue,
    queueStats,
    uploading,
    addUploadFiles,
    uploadOriginals,
    clearCompletedUploads,
    retryFailedUploads,
  } = useUploadQueue({ t, onPhotoProcessed: mergePhoto, onStatus: setStatus })

  async function reload() {
    const [nextPhotos, nextStatus, nextGuestTokens = []] = await Promise.all([
      api.listGalleryPhotos(),
      api.galleryAdminStatus(),
      isAdmin ? Promise.resolve([]) : api.listGalleryTokens(),
    ])
    setPhotos(nextPhotos)
    setAdminStatus(nextStatus)
    setGuestTokens(nextGuestTokens)
    setBudgetInput(String(nextStatus?.budget?.monthly_budget_usd ?? ''))
    setLibraryPreviewsLoaded(false)
  }

  useEffect(() => {
    let alive = true
    setLoadError('')
    reload()
      .catch((err) => {
        console.error('Failed to load gallery admin data', err)
        if (alive) setLoadError(t.galleryAdminLoadError)
      })
      .finally(() => alive && setLoading(false))
    return () => {
      alive = false
    }
  }, [isAdmin])

  async function retryLoad() {
    setLoading(true)
    setLoadError('')
    try {
      await reload()
    } catch (err) {
      console.error('Failed to reload gallery admin data', err)
      setLoadError(t.galleryAdminLoadError)
    } finally {
      setLoading(false)
    }
  }

  function copyGuestLink(token) {
    navigator.clipboard?.writeText(`${window.location.origin}/g/${token}`)
    setStatus(t.guestLinksCopied)
  }

  async function savePhoto(event) {
    event.preventDefault()
    setStatus('')
    try {
      const photo = await api.saveGalleryPhoto(photoFields)
      mergePhoto(photo)
      setPhotoFields({ title: '', original_key: '', thumb_key: '', display_key: '' })
      setStatus(t.galleryAdminSaved)
    } catch (err) {
      console.error('Failed to save photo metadata', err)
      setStatus(t.galleryAdminSaveError)
    }
  }

  async function saveBudget(event) {
    event.preventDefault()
    setStatus('')
    try {
      const budget = await api.updateGalleryBudget(budgetInput)
      setAdminStatus((prev) => ({ ...(prev || {}), budget }))
      setBudgetInput(String(budget.monthly_budget_usd))
      setStatus(t.galleryAdminBudgetSaved)
    } catch (err) {
      console.error('Failed to save gallery budget', err)
      setStatus(t.galleryAdminBudgetError)
    }
  }

  async function importR2Originals(event) {
    event.preventDefault()
    setStatus(t.galleryAdminImporting)
    try {
      const result = await api.importGalleryR2({ prefix: importPrefix })
      setPhotos((prev) => [
        ...result.imported,
        ...prev.filter((photo) => !result.imported.some((item) => item.id === photo.id)),
      ])
      setStatus(t.galleryAdminImportDone(result.imported_count, result.skipped_count))
      const nextStatus = await api.galleryAdminStatus()
      setAdminStatus(nextStatus)
    } catch (err) {
      console.error('Failed to import R2 originals', err)
      setStatus(t.galleryAdminImportError)
    }
  }

  async function generateDerivatives(photo) {
    setGeneratingIds((current) => new Set(current).add(photo.id))
    setStatus(t.galleryAdminDerivativeStatus(photo.title))
    try {
      const processed = await api.generateGalleryDerivatives(photo.id)
      setPhotos((prev) => prev.map((item) => (item.id === processed.id ? processed : item)))
      setStatus(t.galleryAdminDerivativesDone)
    } catch (err) {
      console.error('Failed to generate derivatives', err)
      setStatus(t.galleryAdminDerivativesError)
    } finally {
      setGeneratingIds((current) => {
        const next = new Set(current)
        next.delete(photo.id)
        return next
      })
    }
  }

  async function toggleLibrary() {
    if (libraryOpen) {
      setLibraryOpen(false)
      return
    }

    setLibraryOpen(true)
    if (libraryPreviewsLoaded) return
    setLibraryLoading(true)
    try {
      const nextPhotos = await api.listGalleryPhotos({ includeUrls: true })
      setPhotos(nextPhotos)
      setLibraryPreviewsLoaded(true)
    } catch (err) {
      console.error('Failed to load gallery previews', err)
      setStatus(t.galleryAdminPreviewLoadError)
    } finally {
      setLibraryLoading(false)
    }
  }

  async function deletePhoto(photo) {
    if (!window.confirm(t.galleryAdminDeleteConfirm(photo.title))) return
    setDeletingIds((current) => new Set(current).add(photo.id))
    try {
      await api.deleteGalleryPhoto(photo.id)
      setPhotos((current) => current.filter((item) => item.id !== photo.id))
      setAdminStatus((current) => current ? {
        ...current,
        budget: current.budget ? {
          ...current.budget,
          photo_count: Math.max(0, Number(current.budget.photo_count || 0) - 1),
          original_storage_bytes: Math.max(0, Number(current.budget.original_storage_bytes || 0) - Number(photo.bytes || 0)),
        } : current.budget,
      } : current)
      setStatus(t.galleryAdminDeleted)
    } catch (err) {
      console.error('Failed to delete gallery photo', err)
      setStatus(t.galleryAdminDeleteError)
    } finally {
      setDeletingIds((current) => {
        const next = new Set(current)
        next.delete(photo.id)
        return next
      })
    }
  }

  async function copyPhotoKey(key, label, event) {
    if (!key) return
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard API unavailable')
      await navigator.clipboard.writeText(key)
      setStatus(t.galleryAdminKeyCopied(label))
      const menu = event.currentTarget.closest('details')
      if (menu) menu.open = false
    } catch (err) {
      console.error('Failed to copy gallery key', err)
      setStatus(t.galleryAdminCopyKeyError)
    }
  }

  const budget = adminStatus?.budget
  const budgetExceeded = !!budget?.budget_exceeded
  const currency = useMemo(
    () => new Intl.NumberFormat(lang, { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 4 }),
    [lang],
  )

  if (loading) {
    return (
      <section className="admin-panel gallery-admin-page gallery-admin-loading" aria-live="polite">
        <div className="gallery-admin-loading-head">
          <span />
          <span />
        </div>
        <div className="gallery-admin-loading-metrics">
          {Array.from({ length: 4 }, (_, index) => <span key={index} />)}
        </div>
        <div className="gallery-admin-loading-main" />
        <p><AppIcon icon={LoaderCircle} className="gallery-spin" /> {t.galleryAdminLoading}</p>
      </section>
    )
  }

  return (
    <section className="admin-panel gallery-admin-page">
      <header className="admin-head gallery-admin-hero">
        <div>
          <p className="kicker">{t.galleryAdminKicker}</p>
          <h2>{t.galleryAdminTitle}</h2>
          <p>{t.galleryAdminSubtitle}</p>
        </div>
        <span className="gallery-admin-photo-pill">
          <AppIcon icon={Images} size={16} />
          {t.galleryPhotoCount(photos.length)}
        </span>
      </header>

      <AnimatePresence>
        {status && (
          <motion.p
            className="admin-status gallery-admin-notice"
            role="status"
            aria-live="polite"
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
          >
            {status}
          </motion.p>
        )}
      </AnimatePresence>

      {loadError ? (
        <section className="gallery-admin-error" role="alert">
          <span><AppIcon icon={CircleAlert} size={28} strokeWidth={1.6} /></span>
          <h3>{t.galleryUnavailableTitle}</h3>
          <p>{loadError}</p>
          <button type="button" onClick={retryLoad}>{t.galleryAdminRetry}</button>
        </section>
      ) : (
        <>
          {budget && (
            <section className="gallery-admin-overview" aria-label={t.galleryAdminOverviewLabel}>
              <article>
                <span className="gallery-admin-metric-icon"><AppIcon icon={Images} size={19} /></span>
                <span>{t.galleryAdminPhotosMetric}</span>
                <strong>{photos.length}</strong>
              </article>
              <article>
                <span className="gallery-admin-metric-icon"><AppIcon icon={HardDrive} size={19} /></span>
                <span>{t.galleryAdminStorageMetric}</span>
                <strong>{formatBytes(budget.original_storage_bytes)}</strong>
              </article>
              <article>
                <span className="gallery-admin-metric-icon"><AppIcon icon={Download} size={19} /></span>
                <span>{t.galleryAdminDownloadsMetric}</span>
                <strong>{new Intl.NumberFormat(lang).format(budget.monthly_download_url_count)}</strong>
              </article>
              <article className={adminStatus?.r2_configured ? 'is-ready' : 'is-warning'}>
                <span className="gallery-admin-metric-icon">
                  <AppIcon icon={adminStatus?.r2_configured ? CircleCheck : CircleAlert} size={19} />
                </span>
                <span>{t.galleryAdminR2Metric}</span>
                <strong>{adminStatus?.r2_configured ? t.galleryAdminR2Ready : t.galleryAdminR2Missing}</strong>
              </article>
            </section>
          )}

          <div className="gallery-admin-workspace">
            <section className="gallery-admin-upload-card">
              <header className="gallery-section-head">
                <span className="gallery-section-icon"><AppIcon icon={CloudUpload} size={22} /></span>
                <div>
                  <h3>{t.galleryAdminUploadSectionTitle}</h3>
                  <p>{t.galleryAdminUploadSectionBody}</p>
                </div>
              </header>
              <form className="upload-admin-form" onSubmit={uploadOriginals} aria-busy={uploading}>
                <UploadDropzone
                  files={uploadQueue.map((item) => item.file)}
                  progress={queueStats.progress}
                  accept="image/*,.heic,.heif,.tif,.tiff"
                  multiple
                  title={t.galleryAdminDropTitle}
                  hint={t.galleryAdminDropHint}
                  selectedSummary={t.galleryAdminFilesSelected(uploadQueue.length)}
                  progressLabel={t.galleryAdminUploadProgress(queueStats.progress)}
                  onFiles={addUploadFiles}
                />
                <button type="submit" disabled={queueStats.queued === 0 || uploading || budgetExceeded}>
                  <AppIcon icon={uploading ? LoaderCircle : CloudUpload} className={uploading ? 'gallery-spin' : ''} />
                  {uploading ? t.galleryAdminUploading : t.galleryAdminUploadOriginal}
                </button>
              </form>

              <GalleryUploadQueue
                t={t}
                uploadQueue={uploadQueue}
                queueStats={queueStats}
                uploading={uploading}
                onRetryFailed={retryFailedUploads}
                onClearFinished={clearCompletedUploads}
              />
            </section>

            {budget && (
              <aside className={`gallery-budget-card ${budgetExceeded ? 'is-over' : ''}`}>
                <span className="gallery-section-icon"><AppIcon icon={Database} size={21} /></span>
                <div>
                  <span className="gallery-budget-eyebrow">{t.galleryAdminMonthlyBudget}</span>
                  <strong>{t.galleryAdminBudgetEstimate(
                    currency.format(budget.estimated_monthly_usd),
                    currency.format(budget.monthly_budget_usd),
                  )}</strong>
                  <p>{t.galleryAdminUsageSummary(
                    photos.length,
                    formatBytes(budget.original_storage_bytes),
                    budget.monthly_download_url_count,
                  )}</p>
                </div>
                {isAdmin && (
                  <form onSubmit={saveBudget}>
                    <label className="admin-field">
                      <span className="admin-field-label">{t.galleryAdminMonthlyBudget}</span>
                      <AdminNumberInput
                        name="gallery-budget"
                        type="number"
                        min="0"
                        step="0.01"
                        autoComplete="off"
                        value={budgetInput}
                        onChange={(event) => setBudgetInput(event.target.value)}
                      />
                    </label>
                    <button type="submit">{t.galleryAdminSaveBudget}</button>
                  </form>
                )}
              </aside>
            )}
          </div>

          {!isAdmin && guestTokens.length > 0 && (
            <section className="gallery-guest-links">
              <header className="gallery-section-head gallery-section-head--guest-links">
                <span className="gallery-section-icon"><AppIcon icon={Link2} size={21} /></span>
                <div>
                  <h3>{t.guestLinksTitle}</h3>
                  <p>{t.guestLinksTableLabel}</p>
                </div>
                <span className="gallery-admin-library-count">{guestTokens.length}</span>
              </header>
              <div className="gallery-guest-links-access">
                <AppIcon icon={LockKeyhole} size={15} />
                <span>{t.guestLinksReadonly}</span>
              </div>
              <GuestLinksTable
                tokens={guestTokens}
                t={t}
                lang={lang}
                onCopy={copyGuestLink}
                showEmpty={false}
                variant="studio"
              />
            </section>
          )}

          <section className="gallery-admin-library">
            <header className="gallery-section-head gallery-section-head--library">
              <span className="gallery-section-icon"><AppIcon icon={Images} size={22} /></span>
              <div>
                <h3>{t.galleryAdminLibraryTitle}</h3>
                <p>{t.galleryAdminLibraryBody}</p>
              </div>
              <div className="gallery-admin-library-actions">
                <span className="gallery-admin-library-count">{photos.length}</span>
                <button
                  type="button"
                  className="gallery-admin-library-toggle"
                  aria-expanded={libraryOpen}
                  aria-controls="gallery-admin-library-content"
                  onClick={toggleLibrary}
                >
                  {libraryOpen ? t.galleryAdminLibraryHide : t.galleryAdminLibraryShow}
                  <AppIcon icon={ChevronDown} className={libraryOpen ? 'is-open' : ''} />
                </button>
              </div>
            </header>

            {libraryOpen && (
              <div id="gallery-admin-library-content">
                {libraryLoading ? (
                  <div className="photo-admin-list photo-admin-list--loading" aria-live="polite" aria-label={t.galleryAdminLoadingPreviews}>
                    {Array.from({ length: Math.min(Math.max(photos.length, 3), 6) }, (_, index) => (
                      <span key={index} className="photo-admin-skeleton" aria-hidden="true" />
                    ))}
                  </div>
                ) : photos.length === 0 ? (
                  <div className="gallery-admin-empty">
                    <span className="gallery-admin-empty-icon">
                      <AppIcon icon={ImageIcon} size={32} strokeWidth={1.5} />
                      <AppIcon icon={Sparkles} className="gallery-admin-empty-sparkle" size={18} />
                    </span>
                    <h4>{t.galleryAdminEmptyTitle}</h4>
                    <p>{t.galleryAdminEmptyBody}</p>
                  </div>
                ) : (
                  <div className="photo-admin-list">
                    {photos.map((photo) => {
                      const previewUrl = photo.thumb_url || photo.display_url
                      const ready = !!(photo.thumb_key || photo.display_key)
                      const generating = generatingIds.has(photo.id)
                      const deleting = deletingIds.has(photo.id)
                      return (
                        <article className="photo-admin-item" key={photo.id}>
                          <div className="photo-admin-preview">
                            {previewUrl ? (
                              <img
                                src={previewUrl}
                                alt=""
                                width={photo.width || 640}
                                height={photo.height || 480}
                                loading="lazy"
                                decoding="async"
                              />
                            ) : (
                              <AppIcon icon={ImageIcon} size={30} strokeWidth={1.4} />
                            )}
                            <span className={`photo-admin-state ${ready ? 'is-ready' : 'is-pending'}`}>
                              <AppIcon icon={ready ? CircleCheck : CircleAlert} size={13} />
                              {ready ? t.galleryAdminPhotoReady : t.galleryAdminPhotoPending}
                            </span>
                          </div>
                          <div className="photo-admin-content">
                            <strong title={photo.title}>{photo.title}</strong>
                            <span title={photo.original_key}>{photo.original_key}</span>
                            <small>
                              {formatBytes(photo.bytes)}
                              {photo.width && photo.height ? ` · ${photo.width} × ${photo.height}` : ''}
                            </small>
                            <div className="photo-admin-actions">
                              {isAdmin && (
                                <button
                                  type="button"
                                  onClick={() => generateDerivatives(photo)}
                                  disabled={budgetExceeded || generating || deleting}
                                >
                                  <AppIcon icon={generating ? LoaderCircle : WandSparkles} className={generating ? 'gallery-spin' : ''} />
                                  {generating ? t.galleryAdminGenerating : t.galleryAdminGenerate}
                                </button>
                              )}
                              {isAdmin && (
                                <details className="photo-key-menu">
                                  <summary aria-label={t.galleryAdminKeysMenu} title={t.galleryAdminKeysMenu}>
                                    <AppIcon icon={KeyRound} />
                                    <span>{t.galleryAdminKeysMenu}</span>
                                    <AppIcon icon={ChevronDown} className="photo-key-menu-chevron" size={14} />
                                  </summary>
                                  <div>
                                    {[
                                      [photo.original_key, t.galleryAdminOriginalKeyPlaceholder],
                                      [photo.thumb_key, t.galleryAdminThumbKeyPlaceholder],
                                      [photo.display_key, t.galleryAdminDisplayKeyPlaceholder],
                                    ].map(([key, label]) => (
                                      <button
                                        key={label}
                                        type="button"
                                        disabled={!key}
                                        onClick={(event) => copyPhotoKey(key, label, event)}
                                      >
                                        {label}
                                      </button>
                                    ))}
                                  </div>
                                </details>
                              )}
                              <button
                                type="button"
                                className="danger"
                                onClick={() => deletePhoto(photo)}
                                disabled={deleting || generating}
                              >
                                <AppIcon icon={deleting ? LoaderCircle : Trash2} className={deleting ? 'gallery-spin' : ''} />
                                {deleting ? t.galleryPreparing : t.galleryAdminDelete}
                              </button>
                            </div>
                          </div>
                        </article>
                      )
                    })}
                  </div>
                )}
              </div>
            )}
          </section>

          {isAdmin && (
            <details className="gallery-admin-advanced">
              <summary>
                <span className="gallery-section-icon"><AppIcon icon={SlidersHorizontal} size={20} /></span>
                <span>
                  <strong>{t.galleryAdminAdvancedTitle}</strong>
                  <small>{t.galleryAdminAdvancedBody}</small>
                </span>
                <AppIcon icon={ChevronDown} className="gallery-admin-advanced-chevron" />
              </summary>
              <div className="gallery-admin-advanced-grid">
                <section>
                  <h3>{t.galleryAdminImportTitle}</h3>
                  <form className="admin-form admin-form--stack" onSubmit={importR2Originals}>
                    <label className="admin-field">
                      <span className="admin-field-label">{t.galleryAdminImportPrefix}</span>
                      <AdminTextInput
                        name="gallery-import-prefix"
                        autoComplete="off"
                        value={importPrefix}
                        onChange={(event) => setImportPrefix(event.target.value)}
                      />
                    </label>
                    <button type="submit" disabled={budgetExceeded || !adminStatus?.r2_configured}>
                      {t.galleryAdminImport}
                    </button>
                  </form>
                </section>

                <section>
                  <h3>{t.galleryAdminMetadataTitle}</h3>
                  <form className="admin-form admin-form--stack" onSubmit={savePhoto}>
                    {[
                      ['title', t.galleryAdminTitlePlaceholder],
                      ['original_key', t.galleryAdminOriginalKeyPlaceholder],
                      ['thumb_key', t.galleryAdminThumbKeyPlaceholder],
                      ['display_key', t.galleryAdminDisplayKeyPlaceholder],
                    ].map(([field, label]) => (
                      <label className="admin-field" key={field}>
                        <span className="admin-field-label">{label}</span>
                        <AdminTextInput
                          name={`gallery-${field.replace('_', '-')}`}
                          autoComplete="off"
                          value={photoFields[field]}
                          onChange={(event) => setPhotoFields((current) => ({ ...current, [field]: event.target.value }))}
                        />
                      </label>
                    ))}
                    <button type="submit">{t.galleryAdminSaveMetadata}</button>
                  </form>
                </section>
              </div>
            </details>
          )}
        </>
      )}
    </section>
  )
}
