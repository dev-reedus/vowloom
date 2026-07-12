import { useEffect, useState } from 'react'
import { api } from '../api'
import { AdminNumberInput, AdminTextInput, UploadDropzone, formatBytes } from '../components/AdminControls'
import { GuestLinksTable } from './GuestLinksAdminPage'
import useUploadQueue from './gallery/useUploadQueue'
import GalleryUploadQueue from './gallery/GalleryUploadQueue'

export default function GalleryAdminPage({ isAdmin, t }) {
  const [photos, setPhotos] = useState([])
  const [adminStatus, setAdminStatus] = useState(null)
  const [budgetInput, setBudgetInput] = useState('')
  const [importPrefix, setImportPrefix] = useState('originals/')
  const [photoFields, setPhotoFields] = useState({ title: '', original_key: '', thumb_key: '', display_key: '' })
  const [guestTokens, setGuestTokens] = useState([])
  const [status, setStatus] = useState('')
  const [loading, setLoading] = useState(true)

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
  }

  useEffect(() => {
    let alive = true
    reload()
      .catch((err) => {
        console.error('Failed to load gallery admin data', err)
        if (alive) setStatus(t.galleryAdminLoadError)
      })
      .finally(() => alive && setLoading(false))
    return () => {
      alive = false
    }
  }, [isAdmin])

  function copyGuestLink(token) {
    navigator.clipboard?.writeText(`${window.location.origin}/g/${token}`)
    setStatus(t.guestLinksCopied)
  }

  async function savePhoto(event) {
    event.preventDefault()
    setStatus('')
    try {
      const photo = await api.saveGalleryPhoto(photoFields)
      setPhotos((prev) => [photo, ...prev.filter((item) => item.id !== photo.id)])
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
    setStatus(t.galleryAdminDerivativeStatus(photo.title))
    try {
      const processed = await api.generateGalleryDerivatives(photo.id)
      setPhotos((prev) => prev.map((item) => (item.id === processed.id ? processed : item)))
      setStatus(t.galleryAdminDerivativesDone)
    } catch (err) {
      console.error('Failed to generate derivatives', err)
      setStatus(t.galleryAdminDerivativesError)
    }
  }

  if (loading) return <section className="admin-panel">{t.galleryAdminLoading}</section>

  const budget = adminStatus?.budget
  const budgetExceeded = !!budget?.budget_exceeded
  const canConfigureBudget = isAdmin
  const canUseSensitiveGalleryTools = isAdmin

  return (
    <section className="admin-panel">
      <header className="admin-head">
        <div>
          <p className="kicker">{t.galleryAdminKicker}</p>
          <h2>{t.galleryAdminTitle}</h2>
        </div>
        {status && <p className="admin-status">{status}</p>}
      </header>

      {budget && (
        <section className={`gallery-status-panel ${budgetExceeded ? 'is-over' : ''}`}>
          <div>
            <strong>{adminStatus?.r2_configured ? t.galleryAdminR2Ready : t.galleryAdminR2Missing}</strong>
            <span>
              {t.galleryAdminBudgetEstimate(
                budget.estimated_monthly_usd.toFixed(4),
                budget.monthly_budget_usd.toFixed(2),
              )}
            </span>
            <span>
              {t.galleryAdminUsageSummary(
                budget.photo_count,
                formatBytes(budget.original_storage_bytes),
                budget.monthly_download_url_count,
              )}
            </span>
          </div>
          {canConfigureBudget && (
            <form onSubmit={saveBudget}>
              <label>
                <span>{t.galleryAdminMonthlyBudget}</span>
                <AdminNumberInput
                  type="text"
                  value={budgetInput}
                  onChange={(e) => setBudgetInput(e.target.value)}
                />
              </label>
              <button type="submit">{t.galleryAdminSaveBudget}</button>
            </form>
          )}
        </section>
      )}

      <form className="upload-admin-form" onSubmit={uploadOriginals}>
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
          {t.galleryAdminUploadOriginal}
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

      {!isAdmin && guestTokens.length > 0 && (
        <section className="gallery-guest-links">
          <header className="admin-head admin-head--spaced">
            <div>
              <p className="kicker">{t.guestLinksKicker}</p>
              <h2>{t.guestLinksTitle}</h2>
            </div>
          </header>
          <p className="admin-readonly-note">{t.guestLinksReadonly}</p>
          <GuestLinksTable
            tokens={guestTokens}
            t={t}
            onCopy={copyGuestLink}
            showEmpty={false}
          />
        </section>
      )}

      {canUseSensitiveGalleryTools && (
        <form className="admin-form" onSubmit={importR2Originals}>
          <AdminTextInput
            value={importPrefix}
            onChange={(e) => setImportPrefix(e.target.value)}
            placeholder={t.galleryAdminImportPrefix}
          />
          <button type="submit" disabled={budgetExceeded || !adminStatus?.r2_configured}>
            {t.galleryAdminImport}
          </button>
        </form>
      )}

      {canUseSensitiveGalleryTools && (
        <>
          <form className="admin-form admin-form--stack" onSubmit={savePhoto}>
            <AdminTextInput
              value={photoFields.title}
              onChange={(e) => setPhotoFields((p) => ({ ...p, title: e.target.value }))}
              placeholder={t.galleryAdminTitlePlaceholder}
            />
            <AdminTextInput
              value={photoFields.original_key}
              onChange={(e) => setPhotoFields((p) => ({ ...p, original_key: e.target.value }))}
              placeholder={t.galleryAdminOriginalKeyPlaceholder}
            />
            <AdminTextInput
              value={photoFields.thumb_key}
              onChange={(e) => setPhotoFields((p) => ({ ...p, thumb_key: e.target.value }))}
              placeholder={t.galleryAdminThumbKeyPlaceholder}
            />
            <AdminTextInput
              value={photoFields.display_key}
              onChange={(e) => setPhotoFields((p) => ({ ...p, display_key: e.target.value }))}
              placeholder={t.galleryAdminDisplayKeyPlaceholder}
            />
            <button type="submit">{t.galleryAdminSaveMetadata}</button>
          </form>

          <div className="photo-admin-list">
            {photos.map((photo) => (
              <div className="photo-admin-item has-actions" key={photo.id}>
                <div>
                  <strong>{photo.title}</strong>
                  <span>{photo.original_key}</span>
                </div>
                <div>
                  <span>{photo.thumb_key || t.galleryAdminNoThumb}</span>
                  <span>{photo.display_key || t.galleryAdminNoDisplay}</span>
                </div>
                <div className="admin-actions">
                  <button type="button" onClick={() => generateDerivatives(photo)} disabled={budgetExceeded}>
                    {t.galleryAdminGenerate}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  )
}
