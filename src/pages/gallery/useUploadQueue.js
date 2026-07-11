import { useMemo, useState } from 'react'
import { api } from '../../api'
import { createQueueItem, itemOverallProgress, putFileWithProgress } from './uploadQueue'

// Owns the multi-file upload queue: adding files, running each through the
// presign → PUT → generate-derivatives pipeline, and the retry/clear controls.
// Processed photos are reported via onPhotoProcessed; progress text via onStatus.
export default function useUploadQueue({ adminKey, t, onPhotoProcessed, onStatus }) {
  const [uploadQueue, setUploadQueue] = useState([])
  const [uploading, setUploading] = useState(false)

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

  function updateQueueItem(id, fields) {
    setUploadQueue((prev) => prev.map((item) => (item.id === id ? { ...item, ...fields } : item)))
  }

  function addUploadFiles(files) {
    const nextFiles = Array.from(files || [])
    if (nextFiles.length === 0) return
    setUploadQueue((prev) => [...prev, ...nextFiles.map(createQueueItem)])
    onStatus('')
  }

  function clearCompletedUploads() {
    setUploadQueue((prev) => prev.filter((item) => !['done', 'error'].includes(item.status)))
  }

  function retryFailedUploads() {
    setUploadQueue((prev) =>
      prev.map((item) => (item.status === 'error' ? { ...item, status: 'queued', progress: 0, error: '' } : item)),
    )
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
        onPhotoProcessed(processed)
        updateQueueItem(item.id, { status: 'done', progress: 100, photo: processed })
        completed += 1
      } catch (err) {
        console.error('Failed to upload original', err)
        updateQueueItem(item.id, { status: 'error', progress: 100, error: err.message || t.galleryAdminUploadError })
        failed += 1
      }
    }
    setUploading(false)
    onStatus(t.galleryAdminQueueFinished(completed, failed))
  }

  return {
    uploadQueue,
    queueStats,
    uploading,
    addUploadFiles,
    uploadOriginals,
    clearCompletedUploads,
    retryFailedUploads,
  }
}
