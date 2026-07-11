import { useEffect } from 'react'
import PhotoSwipeLightbox from 'photoswipe/lightbox'
import { updateCaption, updateDownloadButton } from './galleryUtils'

// Wires up the PhotoSwipe lightbox for the photo grid, including the custom download-original button,
// an admin-only delete button (preview mode), and the caption.
// Reads live photos / translations from refs so the registered UI elements
// stay current without re-initialising the lightbox on every change.
export default function useGalleryLightbox({
  photosLength,
  preview,
  photosRef,
  tRef,
  onDownloadOriginal,
  onDeletePhoto,
}) {
  useEffect(() => {
    if (photosLength === 0) return undefined

    let downloadButton = null
    let deleteButton = null
    let caption = null
    let activeTile = null
    const lightbox = new PhotoSwipeLightbox({
      gallery: '.photo-grid',
      children: 'a.photo-tile',
      pswpModule: () => import('photoswipe'),
      bgOpacity: 1,
      showHideAnimationType: 'zoom',
      showAnimationDuration: 260,
      hideAnimationDuration: 220,
      thumbSelector: 'img',
      padding: { top: 52, right: 16, bottom: 72, left: 16 },
    })

    lightbox.addFilter('clickedIndex', (clickedIndex, event) => {
      activeTile = event.target?.closest?.('.photo-tile') || null
      return clickedIndex
    })

    lightbox.on('uiRegister', () => {
      lightbox.pswp.ui.registerElement({
        name: 'download-original',
        className: 'pswp__button--download-original',
        isButton: true,
        order: 9,
        html: tRef.current.galleryDownloadOriginal,
        title: tRef.current.galleryDownloadOriginal,
        ariaLabel: tRef.current.galleryDownloadOriginal,
        onInit: (element, pswp) => {
          downloadButton = element
          updateDownloadButton(element, pswp, photosRef.current, tRef.current)
        },
        onClick: async (_event, element, pswp) => {
          const photo = photosRef.current[pswp.currIndex]
          if (!photo?.has_original || element.disabled) return
          await onDownloadOriginal(photo, element)
        },
      })

      if (preview) {
        lightbox.pswp.ui.registerElement({
          name: 'delete-photo',
          className: 'pswp__button--delete-photo',
          isButton: true,
          order: 10,
          html: tRef.current.galleryAdminDelete,
          title: tRef.current.galleryAdminDelete,
          ariaLabel: tRef.current.galleryAdminDelete,
          onInit: (element) => {
            deleteButton = element
          },
          onClick: async (_event, element, pswp) => {
            const photo = photosRef.current[pswp.currIndex]
            if (!photo || element.disabled) return
            await onDeletePhoto(photo, element, pswp)
          },
        })
      }

      lightbox.pswp.ui.registerElement({
        name: 'caption',
        className: 'pswp__caption',
        appendTo: 'root',
        onInit: (element, pswp) => {
          caption = element
          updateCaption(element, pswp, photosRef.current)
        },
      })
    })

    lightbox.on('change', () => {
      if (downloadButton && lightbox.pswp) {
        updateDownloadButton(downloadButton, lightbox.pswp, photosRef.current, tRef.current)
      }
      if (deleteButton) {
        deleteButton.textContent = tRef.current.galleryAdminDelete
        deleteButton.title = tRef.current.galleryAdminDelete
        deleteButton.setAttribute('aria-label', tRef.current.galleryAdminDelete)
      }
      if (caption && lightbox.pswp) {
        updateCaption(caption, lightbox.pswp, photosRef.current)
      }
    })

    lightbox.on('openingAnimationStart', () => {
      activeTile?.classList.add('is-pswp-source')
    })

    lightbox.on('destroy', () => {
      activeTile?.classList.remove('is-pswp-source')
      activeTile = null
    })

    lightbox.init()

    return () => {
      lightbox.destroy()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [photosLength, preview])
}
