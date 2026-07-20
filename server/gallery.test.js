import test from 'node:test'
import assert from 'node:assert/strict'
import { galleryDownloadFilename } from './lib/gallery.js'

test('gallery downloads use the photo title and preserve the original extension', () => {
  assert.equal(
    galleryDownloadFilename({ title: 'Our First Dance', original_key: 'originals/172345-photo123.jpg' }),
    'Our First Dance.jpg',
  )
})

test('gallery download filenames avoid duplicate extensions and unsafe characters', () => {
  assert.equal(
    galleryDownloadFilename({ title: 'Dinner: friends?.JPG', original_key: 'originals/camera-file.JPG' }),
    'Dinner- friends-.JPG',
  )
})
