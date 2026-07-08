import path from 'node:path'
import sharp from 'sharp'
import { getR2ObjectBuffer, putR2ObjectBuffer } from './r2.js'

const THUMB_SIZE = 480
const DISPLAY_SIZE = Number(process.env.GALLERY_DISPLAY_IMAGE_SIZE || 2048)
const JPEG_QUALITY_THUMB = 82
const JPEG_QUALITY_DISPLAY = 88

function safeBaseName(key) {
  const parsed = path.parse(String(key || 'photo'))
  return (parsed.name || 'photo').replace(/[^\w.-]+/g, '-').replace(/^-+|-+$/g, '') || 'photo'
}

export async function generateGalleryDerivatives(photo) {
  if (!photo?.id || !photo.original_key) throw new Error('photo original key is required')

  const original = await getR2ObjectBuffer(photo.original_key)
  const base = safeBaseName(photo.original_key)
  const thumbKey = `derivatives/${photo.id}/${base}-thumb.jpg`
  const displayKey = `derivatives/${photo.id}/${base}-${DISPLAY_SIZE}.jpg`

  const image = sharp(original, { failOn: 'none' }).rotate()
  const metadata = await image.metadata()

  const thumb = await sharp(original, { failOn: 'none' })
    .rotate()
    .resize(THUMB_SIZE, THUMB_SIZE, { fit: 'cover', position: 'attention' })
    .jpeg({ quality: JPEG_QUALITY_THUMB, mozjpeg: true })
    .toBuffer()

  const display = await sharp(original, { failOn: 'none' })
    .rotate()
    .resize(DISPLAY_SIZE, DISPLAY_SIZE, { fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: JPEG_QUALITY_DISPLAY, mozjpeg: true })
    .toBuffer()

  await putR2ObjectBuffer(thumbKey, thumb, { contentType: 'image/jpeg' })
  await putR2ObjectBuffer(displayKey, display, { contentType: 'image/jpeg' })

  return {
    thumb_key: thumbKey,
    display_key: displayKey,
    width: metadata.width || null,
    height: metadata.height || null,
  }
}
