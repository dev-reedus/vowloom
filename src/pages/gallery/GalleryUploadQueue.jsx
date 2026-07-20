import { formatBytes } from '../../components/AdminControls'
import { itemOverallProgress } from './uploadQueue'

// Aggregate progress + per-file rows for the active upload queue, with
// retry/clear controls. Presentational: all state lives in useUploadQueue.
export default function GalleryUploadQueue({ t, uploadQueue, queueStats, uploading, onRetryFailed, onClearFinished }) {
  if (uploadQueue.length === 0) return null

  return (
    <section className="upload-queue" aria-label={t.galleryAdminQueueLabel}>
      <div className="upload-aggregate">
        <div>
          <strong>{t.galleryAdminQueueLabel}</strong>
          <span>{t.galleryAdminQueueSummary(queueStats.total, queueStats.done, queueStats.failed, queueStats.progress)}</span>
        </div>
        <div className="admin-actions">
          <button type="button" onClick={onRetryFailed} disabled={queueStats.failed === 0 || uploading}>
            {t.galleryAdminRetryFailed}
          </button>
          <button type="button" onClick={onClearFinished} disabled={(queueStats.done + queueStats.failed) === 0 || uploading}>
            {t.galleryAdminClearFinished}
          </button>
        </div>
      </div>
      <span
        className="upload-progress"
        role="progressbar"
        aria-label={t.galleryAdminUploadProgress(queueStats.progress)}
        aria-valuemin="0"
        aria-valuemax="100"
        aria-valuenow={queueStats.progress}
      >
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
  )
}
