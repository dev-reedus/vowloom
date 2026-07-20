import it from './i18n/it.js'
import en from './i18n/en.js'
import ro from './i18n/ro.js'

export const translations = { it, en, ro }

export const LANG_KEY = 'vowloom.lang.v1'
const LEGACY_LANG_KEY = 'nozze.lang.v1'
// Guest gallery keeps its own language, independent from the main/admin app so a
// guest link honours its token default_lang and remembers the guest's own choice.
export const GALLERY_LANG_KEY = 'vowloom.gallery.lang.v1'
const LEGACY_GALLERY_LANG_KEY = 'nozze.gallery.lang.v1'
export const SUPPORTED_LANGS = ['it', 'en', 'ro']

export function normalizeLang(lang) {
  return SUPPORTED_LANGS.includes(lang) ? lang : 'it'
}

export function nextLang(lang) {
  const index = SUPPORTED_LANGS.indexOf(normalizeLang(lang))
  return SUPPORTED_LANGS[(index + 1) % SUPPORTED_LANGS.length]
}

export function getStoredLang() {
  try {
    const saved = localStorage.getItem(LANG_KEY) || localStorage.getItem(LEGACY_LANG_KEY)
    if (SUPPORTED_LANGS.includes(saved) && !localStorage.getItem(LANG_KEY)) {
      localStorage.setItem(LANG_KEY, saved)
    }
    return SUPPORTED_LANGS.includes(saved) ? saved : null
  } catch {
    return null
  }
}

export function loadLang(fallback = 'it') {
  return getStoredLang() || normalizeLang(fallback)
}

export function getStoredGalleryLang() {
  try {
    const saved = localStorage.getItem(GALLERY_LANG_KEY) || localStorage.getItem(LEGACY_GALLERY_LANG_KEY)
    if (SUPPORTED_LANGS.includes(saved) && !localStorage.getItem(GALLERY_LANG_KEY)) {
      localStorage.setItem(GALLERY_LANG_KEY, saved)
    }
    return SUPPORTED_LANGS.includes(saved) ? saved : null
  } catch {
    return null
  }
}

export function setStoredGalleryLang(lang) {
  try {
    localStorage.setItem(GALLERY_LANG_KEY, normalizeLang(lang))
  } catch {
    /* ignore */
  }
}
