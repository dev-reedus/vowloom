import crypto from 'node:crypto'
import { ADMIN_KEY } from '../config.js'

// Key material for token protection: a dedicated TOKEN_SECRET if provided, else
// derived from ADMIN_KEY (which fail-closed config guarantees is set and
// non-default). Rotating either value invalidates all previously stored tokens.
const keyMaterial = process.env.TOKEN_SECRET || ADMIN_KEY
const KEY = crypto.createHash('sha256').update(String(keyMaterial)).digest() // 32 bytes

// Deterministic, keyed fingerprint of a raw token. Stored as the row key and
// used for O(1) lookups; safe to keep at rest because reversing it or forging a
// matching raw token requires the key.
export function tokenLookup(rawToken) {
  return crypto.createHmac('sha256', KEY).update(String(rawToken)).digest('hex')
}

// Reversible encryption (AES-256-GCM) so an admin can still display and re-copy
// an existing guest link. Format: ivHex:tagHex:cipherHex.
export function encryptToken(rawToken) {
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', KEY, iv)
  const enc = Buffer.concat([cipher.update(String(rawToken), 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return `${iv.toString('hex')}:${tag.toString('hex')}:${enc.toString('hex')}`
}

export function decryptToken(stored) {
  const [ivHex, tagHex, dataHex] = String(stored || '').split(':')
  if (!ivHex || !tagHex || !dataHex) return null
  try {
    const decipher = crypto.createDecipheriv('aes-256-gcm', KEY, Buffer.from(ivHex, 'hex'))
    decipher.setAuthTag(Buffer.from(tagHex, 'hex'))
    return Buffer.concat([decipher.update(Buffer.from(dataHex, 'hex')), decipher.final()]).toString('utf8')
  } catch {
    return null // wrong key or tampered ciphertext
  }
}

// Short, non-sensitive label shown in the admin list (first 6 / last 4 chars).
export function tokenPreview(rawToken) {
  const s = String(rawToken)
  return `${s.slice(0, 6)}...${s.slice(-4)}`
}
