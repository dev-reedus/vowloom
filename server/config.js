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

// Explicit opt-in to run without real auth secrets (local development only).
export const ALLOW_INSECURE_AUTH = /^(1|true|yes)$/i.test(process.env.ALLOW_INSECURE_AUTH || '')

const DEFAULT_ADMIN_KEY = 'admin'

// Fail closed: refuse to start with missing or guessable auth secrets, so a
// deploy that forgets its env vars never comes up unprotected. Set
// ALLOW_INSECURE_AUTH=1 to downgrade this to a warning for local dev. Call once
// at startup, before binding the port.
export function assertAuthConfig() {
  const problems = []
  if (!AUTH_PASSWORD) problems.push('AUTH_PASSWORD is empty — HTTP Basic Auth would be disabled')
  const rawAdminKey = String(process.env.ADMIN_KEY || '').trim()
  if (!rawAdminKey || rawAdminKey === DEFAULT_ADMIN_KEY) {
    problems.push(`ADMIN_KEY is unset or the default '${DEFAULT_ADMIN_KEY}' — guessable`)
  }
  if (problems.length === 0) return

  const detail = problems.map((p) => `  - ${p}`).join('\n')
  if (ALLOW_INSECURE_AUTH) {
    console.warn(`[server] WARNING: insecure auth allowed via ALLOW_INSECURE_AUTH:\n${detail}`)
    return
  }
  throw new Error(
    `Refusing to start with an insecure auth configuration:\n${detail}\n` +
      'Set AUTH_PASSWORD and a strong ADMIN_KEY, or set ALLOW_INSECURE_AUTH=1 for local development.',
  )
}
export const DEFAULT_MONTHLY_BUDGET_USD = Number(process.env.GALLERY_MONTHLY_BUDGET_USD || 10)
