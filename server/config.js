import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// Where the built frontend is served from, and the port to listen on.
export const DIST_DIR = path.join(__dirname, '..', 'dist')
export const PORT = process.env.PORT || 80

// HTTP Basic Auth for the admin site (skipped entirely when AUTH_PASSWORD is empty)
// plus the local admin key that gates write endpoints.
export const AUTH_USER = process.env.AUTH_USER || 'sposi'
export const AUTH_PASSWORD = process.env.AUTH_PASSWORD || ''
export const ADMIN_KEY = process.env.ADMIN_KEY || 'admin'

// Presigned-URL lifetimes and abuse limits for the R2-backed gallery.
export const DOWNLOAD_URL_EXPIRES_SECONDS = Number(process.env.GALLERY_DOWNLOAD_URL_EXPIRES_SECONDS || 300)
export const DISPLAY_URL_EXPIRES_SECONDS = Number(process.env.GALLERY_DISPLAY_URL_EXPIRES_SECONDS || 3600)
export const DAILY_DOWNLOAD_URL_LIMIT = Number(process.env.GALLERY_TOKEN_DAILY_DOWNLOAD_LIMIT || 200)
export const DEFAULT_MONTHLY_BUDGET_USD = Number(process.env.GALLERY_MONTHLY_BUDGET_USD || 10)
