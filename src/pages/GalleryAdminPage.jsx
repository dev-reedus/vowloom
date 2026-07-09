import { useEffect, useMemo, useState } from 'react'
import { api } from '../api'
import { AdminNumberInput, AdminTextInput, UploadDropzone, formatBytes } from '../components/AdminControls'

function putFileWithProgress(url, file, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('PUT', url)
    if (file.type) xhr.setRequestHeader('Content-Type', file.type)
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100))
    }
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve()
      else reject(new Error(`PUT R2 -> ${xhr.status}`))
    }
    xhr.onerror = () => reject(new Error('PUT R2 failed'))
    xhr.send(file)
  })
}

function createQueueItem(file) {
  return {
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    file,
    status: 'queued',
    progress: 0,
    error: '',
  }
}

function itemOverallProgress(item) {
  if (item.status === 'done' || item.status === 'error') return 100
  if (item.status === 'processing') return 85
  if (item.status === 'uploading') return Math.round(10 + (item.progress || 0) * 0.7)
  if (item.status === 'preparing') return 5
  return 0
}

export default function GalleryAdminPage({ adminKey, t }) {
  const [photos, setPhotos] = useState([])
  const [adminStatus, setAdminStatus] = useState(null)
  const [budgetInput, setBudgetInput] = useState('')
  const [importPrefix, setImportPrefix] = useState('originals/')
  const [photoFields, setPhotoFields] = useState({ title: '', original_key: '', thumb_key: '', display_key: '' })
  const [uploadQueue, setUploadQueue] = useState([])
  const [uploading, setUploading] = useState(false)
  const [status, setStatus] = useState('')
  const [loading, setLoading] = useState(true)

  const queueStats = useMemo(() => {
    const total = uploadQueue.length
    const done = uploadQueue.filter((item) => item.status === 'done').length
    const failed = uploadQueue.filter((item) => item.status === 'error').length
    const queued = uploadQueue.filter((item) => item.status === 'queued').length
    const active = uploadQueue.some((item) => ['preparing', 'uploading', 'processing'].includes(item.status))
    const progress = total
      ? Math.round(uploadQueue.reduce((sum, item) => sum + itemOverallProgress(item), 0) / total)
      : 0
    return { total, done, failed, queued, active, progress }
  }, [uploadQueue])

  async function reload() {
    const [nextPhotos, nextStatus] = await Promise.all([
      api.listGalleryPhotos(adminKey),
      api.galleryAdminStatus(adminKey),
    ])
    setPhotos(nextPhotos)
    setAdminStatus(nextStatus)
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
  }, [adminKey])

  async function savePhoto(event) {
    event.preventDefault()
    setStatus('')
    try {
      const photo = await api.saveGalleryPhoto(adminKey, photoFields)
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
      const budget = await api.updateGalleryBudget(adminKey, budgetInput)
      setAdminStatus((prev) => ({ ...(prev || {}), budget }))
      setBudgetInput(String(budget.monthly_budget_usd))
      setStatus(t.galleryAdminBudgetSaved)
    } catch (err) {
      console.error('Failed to save gallery budget', err)
      setStatus(t.galleryAdminBudgetError)
    }
  }

  function updateQueueItem(id, fields) {
    setUploadQueue((prev) => prev.map((item) => (item.id === id ? { ...item, ...fields } : item)))
  }

  async function uploadOriginals(event) {
    event.preventDefault()
    if (uploading) return
    const pending = uploadQueue.filter((item) => item.status === 'queued')
    if (pending.length === 0) return

    setUploading(true)
    let completed = 0
    let failed = 0
    for (const item of pending) {
      updateQueueItem(item.id, { status: 'preparing', progress: 0, error: '' })
      try {
        const payload = await api.createGalleryUploadUrl(adminKey, {
          filename: item.file.name,
          title: item.file.name,
          content_type: item.file.type,
          bytes: item.file.size,
        })
        updateQueueItem(item.id, { status: 'uploading', progress: 0 })
        await putFileWithProgress(payload.upload_url, item.file, (progress) => {
          updateQueueItem(item.id, { progress })
        })
        updateQueueItem(item.id, { status: 'processing', progress: 100 })
        const processed = await api.generateGalleryDerivatives(adminKey, payload.photo.id)
        setPhotos((prev) => [processed, ...prev.filter((photo) => photo.id !== processed.id)])
        updateQueueItem(item.id, { status: 'done', progress: 100, photo: processed })
        completed += 1
      } catch (err) {
        console.error('Failed to upload original', err)
        updateQueueItem(item.id, { status: 'error', progress: 100, error: err.message || t.galleryAdminUploadError })
        failed += 1
      }
    }
    setUploading(false)
    setStatus(t.galleryAdminQueueFinished(completed, failed))
  }

  async function importR2Originals(event) {
    event.preventDefault()
    setStatus(t.galleryAdminImporting)
    try {
      const result = await api.importGalleryR2(adminKey, { prefix: importPrefix })
      setPhotos((prev) => [
        ...result.imported,
        ...prev.filter((photo) => !result.imported.some((item) => item.id === photo.id)),
      ])
      setStatus(t.galleryAdminImportDone(result.imported_count, result.skipped_count))
      const nextStatus = await api.galleryAdminStatus(adminKey)
      setAdminStatus(nextStatus)
    } catch (err) {
      console.error('Failed to import R2 originals', err)
      setStatus(t.galleryAdminImportError)
    }
  }

  function addUploadFiles(files) {
    const nextFiles = Array.from(files || [])
    if (nextFiles.length === 0) return
    setUploadQueue((prev) => [...prev, ...nextFiles.map(createQueueItem)])
    setStatus('')
  }

  function clearCompletedUploads() {
    setUploadQueue((prev) => prev.filter((item) => !['done', 'error'].includes(item.status)))
  }

  function retryFailedUploads() {
    setUploadQueue((prev) =>
      prev.map((item) => (item.status === 'error' ? { ...item, status: 'queued', progress: 0, error: '' } : item)),
    )
  }

  async function generateDerivatives(photo) {
    setStatus(t.galleryAdminDerivativeStatus(photo.title))
    try {
      const processed = await api.generateGalleryDerivatives(adminKey, photo.id)
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
  const canConfigureBudget = !!adminKey
  const canUseSensitiveGalleryTools = !!adminKey

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

      {uploadQueue.length > 0 && (
        <section className="upload-queue" aria-label={t.galleryAdminQueueLabel}>
          <div className="upload-aggregate">
            <div>
              <strong>{t.galleryAdminQueueLabel}</strong>
              <span>{t.galleryAdminQueueSummary(queueStats.total, queueStats.done, queueStats.failed, queueStats.progress)}</span>
            </div>
            <div className="admin-actions">
              <button type="button" onClick={retryFailedUploads} disabled={queueStats.failed === 0 || uploading}>
                {t.galleryAdminRetryFailed}
              </button>
              <button type="button" onClick={clearCompletedUploads} disabled={(queueStats.done + queueStats.failed) === 0 || uploading}>
                {t.galleryAdminClearFinished}
              </button>
            </div>
          </div>
          <span className="upload-progress" aria-label={t.galleryAdminUploadProgress(queueStats.progress)}>
            <span style={{ width: `${queueStats.progress}%` }} />
          </span>
          <div className="upload-queue-list">
            {uploadQueue.map((item) => (
              <div className={`upload-queue-row is-${item.status}`} key={item.id}>
                <div>
                  <strong>{item.file.name}</strong>
                  <span>{formatBytes(item.file.size)}{item.file.type ? ` · ${item.file.type}` : ''}</span>
                  {item.error && <span>{item.error}</span>}
                </div>
                <div>
                  <span>{t.galleryAdminQueueStatus(item.status)}</span>
                  <span>{itemOverallProgress(item)}%</span>
                </div>
              </div>
            ))}
          </div>
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
