export const GALLERY_PAGE_SIZE = 48

export function photoDimensions(photo) {
  const width = Number(photo?.width) > 0 ? Number(photo.width) : 1600
  const height = Number(photo?.height) > 0 ? Number(photo.height) : Math.round(width * 0.667)
  return { width, height }
}

export function photoLightboxUrl(photo) {
  return photo?.display_url || photo?.thumb_url || ''
}

export function photoTileUrl(photo) {
  return photo?.display_url || photo?.thumb_url || ''
}

export function photoTileRowsForWidth(dimensions, tileWidth = 280, rowHeight = 8, rowGap = 0) {
  const { width, height } = dimensions
  const ratio = height / width
  const targetHeight = Math.max(1, tileWidth * ratio)
  const span = Math.ceil((targetHeight + rowGap) / (rowHeight + rowGap))
  return Math.max(4, Math.min(80, span))
}

export function updateDownloadButton(button, pswp, photos, t) {
  const photo = photos[pswp.currIndex]
  button.textContent = t.galleryDownloadOriginal
  button.setAttribute('aria-label', t.galleryDownloadOriginal)
  button.title = t.galleryDownloadOriginal
  button.disabled = !photo?.has_original
}

export function updateCaption(caption, pswp, photos) {
  const title = photos[pswp.currIndex]?.title || ''
  caption.textContent = title
  caption.hidden = !title
}
