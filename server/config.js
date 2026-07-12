import crypto from 'node:crypto'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// Where the built frontend is served from, and the port to listen on.
export const DIST_DIR = path.join(__dirname, '..', 'dist')
export const PORT = process.env.PORT || 80

// Role registry: password-only login, the password picks the role.
// couple falls back to the legacy AUTH_PASSWORD for a smooth migration.
export const AUTH_PASSWORD = process.env.AUTH_PASSWORD || ''
export const COUPLE_PASSWORD = process.env.COUPLE_PASSWORD || AUTH_PASSWORD
export const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || ''

// Retired as an auth credential; still read by tokenCrypto.js as legacy
// token-encryption key material so existing guest links keep validating.
export const ADMIN_KEY = process.env.ADMIN_KEY || 'admin'
export const SESSION_SECRET = process.env.SESSION_SECRET || process.env.TOKEN_SECRET || ADMIN_KEY

export const ROLES = ['couple', 'admin']

const publicText = (value, fallback, maxLength = 120) =>
  String(value || '').trim().slice(0, maxLength) || fallback

// Public wedding identity. These values are deliberately exposed through
// /api/config so one runtime image can serve different deployments.
export const WEDDING_COUPLE_NAMES = publicText(process.env.WEDDING_COUPLE_NAMES, 'The Couple')
export const WEDDING_YEAR = /^\d{4}$/.test(process.env.WEDDING_YEAR || '') ? process.env.WEDDING_YEAR : ''
export const DEFAULT_LANGUAGE = ['it', 'en', 'ro'].includes(process.env.DEFAULT_LANGUAGE)
  ? process.env.DEFAULT_LANGUAGE
  : 'it'

export function publicWeddingConfig() {
  return {
    couple_names: WEDDING_COUPLE_NAMES,
    wedding_year: WEDDING_YEAR,
    default_language: DEFAULT_LANGUAGE,
  }
}

// Presigned-URL lifetimes and abuse limits for the R2-backed gallery.
export const DOWNLOAD_URL_EXPIRES_SECONDS = Number(process.env.GALLERY_DOWNLOAD_URL_EXPIRES_SECONDS || 300)
export const DISPLAY_URL_EXPIRES_SECONDS = Number(process.env.GALLERY_DISPLAY_URL_EXPIRES_SECONDS || 3600)
export const DAILY_DOWNLOAD_URL_LIMIT = Number(process.env.GALLERY_TOKEN_DAILY_DOWNLOAD_LIMIT || 200)

// Explicit opt-in to run without real auth secrets (local development only).
export const ALLOW_INSECURE_AUTH = /^(1|true|yes)$/i.test(process.env.ALLOW_INSECURE_AUTH || '')

// The current {role -> password} map, read fresh from the module-load values.
export function roleRegistry() {
  return { couple: COUPLE_PASSWORD, admin: ADMIN_PASSWORD }
}

// Constant-time string compare. Hashing first gives equal-length buffers, so the
// comparison leaks neither the secret's length nor a matching prefix via timing.
function timingSafeEqualStr(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest()
  const hb = crypto.createHash('sha256').update(String(b)).digest()
  return crypto.timingSafeEqual(ha, hb)
}

// Resolve a submitted password to its role. Evaluates the WHOLE registry with no
// early-exit, so timing never reveals which role (if any) matched. Empty
// configured passwords never match.
export function resolveRole(password) {
  const registry = roleRegistry()
  let matched = null
  for (const role of Object.keys(registry)) {
    const configured = registry[role]
    const isMatch = configured !== '' && timingSafeEqualStr(password, configured)
    if (isMatch) matched = role
  }
  return matched
}

// Bind persisted sessions to the password that created them. Changing a role's
// password changes this opaque version and invalidates that role's old sessions.
// SESSION_SECRET (or TOKEN_SECRET) prevents a leaked DB from turning the version
// into a cheap offline password verifier.
export function sessionAuthVersion(role) {
  const password = roleRegistry()[role]
  if (!password) return null
  return crypto
    .createHmac('sha256', String(SESSION_SECRET))
    .update(`nozze-session-v1\0${role}\0${password}`)
    .digest('hex')
}

const GUESSABLE = new Set(['', 'admin', 'password', 'changeme'])

// Fail closed: refuse to start unless both role passwords are set, strong, and
// distinct (a shared password would make login ambiguous). Set
// ALLOW_INSECURE_AUTH=1 to downgrade this to a warning for local dev. Call once
// at startup, before binding the port.
export function assertAuthConfig() {
  const problems = []
  if (!COUPLE_PASSWORD) problems.push('COUPLE_PASSWORD (or AUTH_PASSWORD fallback) is empty')
  else if (GUESSABLE.has(COUPLE_PASSWORD)) problems.push('COUPLE_PASSWORD is a guessable default')
  if (!ADMIN_PASSWORD) problems.push('ADMIN_PASSWORD is empty')
  else if (GUESSABLE.has(ADMIN_PASSWORD)) problems.push('ADMIN_PASSWORD is a guessable default')
  if (COUPLE_PASSWORD && ADMIN_PASSWORD && COUPLE_PASSWORD === ADMIN_PASSWORD) {
    problems.push('COUPLE_PASSWORD and ADMIN_PASSWORD must be distinct')
  }
  if (problems.length === 0) return

  const detail = problems.map((p) => `  - ${p}`).join('\n')
  if (ALLOW_INSECURE_AUTH) {
    console.warn(`[server] WARNING: insecure auth allowed via ALLOW_INSECURE_AUTH:\n${detail}`)
    return
  }
  throw new Error(
    `Refusing to start with an insecure auth configuration:\n${detail}\n` +
      'Set distinct strong COUPLE_PASSWORD and ADMIN_PASSWORD, or set ALLOW_INSECURE_AUTH=1 for local development.',
  )
}

export const DEFAULT_MONTHLY_BUDGET_USD = Number(process.env.GALLERY_MONTHLY_BUDGET_USD || 10)
