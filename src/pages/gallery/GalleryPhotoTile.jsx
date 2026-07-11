import { useEffect, useRef, useState } from 'react'
import { photoDimensions, photoLightboxUrl, photoTileRowsForWidth, photoTileUrl } from './galleryUtils'

// One masonry tile. It measures its rendered width and sets a matching CSS grid
// row span so the grid packs tightly regardless of photo aspect ratio.
export default function GalleryPhotoTile({ photo }) {
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
