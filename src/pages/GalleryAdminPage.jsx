import { useEffect, useState } from 'react'
import { api } from '../api'

export default function GalleryAdminPage({ adminKey, t }) {
  const [photos, setPhotos] = useState([])
  const [photoFields, setPhotoFields] = useState({ title: '', original_key: '', thumb_key: '', display_key: '' })
  const [file, setFile] = useState(null)
  const [status, setStatus] = useState('')
  const [loading, setLoading] = useState(true)

  async function reload() {
    const nextPhotos = await api.listGalleryPhotos(adminKey)
    setPhotos(nextPhotos)
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

  async function uploadOriginal(event) {
    event.preventDefault()
    if (!file) return
    setStatus(t.galleryAdminPreparingUpload)
    try {
      const payload = await api.createGalleryUploadUrl(adminKey, {
        filename: file.name,
        title: file.name,
        content_type: file.type,
        bytes: file.size,
      })
      setStatus(t.galleryAdminUploading)
      const upload = await fetch(payload.upload_url, {
        method: 'PUT',
        headers: file.type ? { 'Content-Type': file.type } : {},
        body: file,
      })
      if (!upload.ok) throw new Error(`PUT R2 -> ${upload.status}`)
      setStatus(t.galleryAdminGenerating)
      const processed = await api.generateGalleryDerivatives(adminKey, payload.photo.id)
      setFile(null)
      setPhotos((prev) => [processed, ...prev.filter((item) => item.id !== processed.id)])
      setStatus(t.galleryAdminUploaded)
    } catch (err) {
      console.error('Failed to upload original', err)
      setStatus(t.galleryAdminUploadError)
    }
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

  return (
    <section className="admin-panel">
      <header className="admin-head">
        <div>
          <p className="kicker">{t.galleryAdminKicker}</p>
          <h2>{t.galleryAdminTitle}</h2>
        </div>
        {status && <p className="admin-status">{status}</p>}
      </header>

      <form className="admin-form" onSubmit={uploadOriginal}>
        <input type="file" accept="image/*,.heic,.heif,.tif,.tiff" onChange={(e) => setFile(e.target.files?.[0] || null)} />
        <button type="submit" disabled={!file}>{t.galleryAdminUploadOriginal}</button>
      </form>

      <form className="admin-form admin-form--stack" onSubmit={savePhoto}>
        <input
          value={photoFields.title}
          onChange={(e) => setPhotoFields((p) => ({ ...p, title: e.target.value }))}
          placeholder={t.galleryAdminTitlePlaceholder}
        />
        <input
          value={photoFields.original_key}
          onChange={(e) => setPhotoFields((p) => ({ ...p, original_key: e.target.value }))}
          placeholder={t.galleryAdminOriginalKeyPlaceholder}
        />
        <input
          value={photoFields.thumb_key}
          onChange={(e) => setPhotoFields((p) => ({ ...p, thumb_key: e.target.value }))}
          placeholder={t.galleryAdminThumbKeyPlaceholder}
        />
        <input
          value={photoFields.display_key}
          onChange={(e) => setPhotoFields((p) => ({ ...p, display_key: e.target.value }))}
          placeholder={t.galleryAdminDisplayKeyPlaceholder}
        />
        <button type="submit">{t.galleryAdminSaveMetadata}</button>
      </form>

      <div className="photo-admin-list">
        {photos.map((photo) => (
          <div className="photo-admin-item" key={photo.id}>
            <div>
              <strong>{photo.title}</strong>
              <span>{photo.original_key}</span>
            </div>
            <div>
              <span>{photo.thumb_key || t.galleryAdminNoThumb}</span>
              <span>{photo.display_key || t.galleryAdminNoDisplay}</span>
            </div>
            <div className="admin-actions">
              <button type="button" onClick={() => generateDerivatives(photo)}>
                {t.galleryAdminGenerate}
              </button>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
