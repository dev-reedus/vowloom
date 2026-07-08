import crypto from 'node:crypto'
import path from 'node:path'

const REGION = 'auto'
const SERVICE = 's3'
const ALGORITHM = 'AWS4-HMAC-SHA256'

const env = () => ({
  accountId: process.env.R2_ACCOUNT_ID || '',
  accessKeyId: process.env.R2_ACCESS_KEY_ID || '',
  secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || '',
  bucket: process.env.R2_BUCKET || '',
  publicBaseUrl: process.env.R2_PUBLIC_BASE_URL || '',
})

export function isR2Configured() {
  const cfg = env()
  return !!(cfg.accountId && cfg.accessKeyId && cfg.secretAccessKey && cfg.bucket)
}

function hmac(key, value, encoding) {
  return crypto.createHmac('sha256', key).update(value).digest(encoding)
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function amzDate(date = new Date()) {
  return date.toISOString().replace(/[:-]|\.\d{3}/g, '')
}

function encodePathPart(value) {
  return encodeURIComponent(value).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)
}

function encodeKey(key) {
  return String(key).split('/').map(encodePathPart).join('/')
}

function canonicalQuery(params) {
  return [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${encodePathPart(key)}=${encodePathPart(value)}`)
    .join('&')
}

function signingKey(secretAccessKey, shortDate) {
  const kDate = hmac(`AWS4${secretAccessKey}`, shortDate)
  const kRegion = hmac(kDate, REGION)
  const kService = hmac(kRegion, SERVICE)
  return hmac(kService, 'aws4_request')
}

export function presignR2Url({
  method = 'GET',
  key,
  expiresIn = 300,
  filename,
  disposition = method === 'GET' ? 'attachment' : null,
} = {}) {
  if (!isR2Configured()) throw new Error('R2 is not configured')
  if (!key) throw new Error('R2 object key is required')

  const cfg = env()
  const date = new Date()
  const fullDate = amzDate(date)
  const shortDate = fullDate.slice(0, 8)
  const host = `${cfg.accountId}.r2.cloudflarestorage.com`
  const canonicalUri = `/${encodePathPart(cfg.bucket)}/${encodeKey(key)}`
  const credentialScope = `${shortDate}/${REGION}/${SERVICE}/aws4_request`
  const signedHeaders = 'host'

  const params = new URLSearchParams({
    'X-Amz-Algorithm': ALGORITHM,
    'X-Amz-Credential': `${cfg.accessKeyId}/${credentialScope}`,
    'X-Amz-Date': fullDate,
    'X-Amz-Expires': String(Math.max(1, Math.min(Number(expiresIn) || 300, 604800))),
    'X-Amz-SignedHeaders': signedHeaders,
  })

  if (disposition) {
    const fallbackName = filename || path.basename(key) || 'download'
    params.set('response-content-disposition', `${disposition}; filename="${fallbackName.replace(/"/g, '')}"`)
  }

  const canonicalRequest = [
    method.toUpperCase(),
    canonicalUri,
    canonicalQuery(params),
    `host:${host}\n`,
    signedHeaders,
    'UNSIGNED-PAYLOAD',
  ].join('\n')

  const stringToSign = [ALGORITHM, fullDate, credentialScope, sha256(canonicalRequest)].join('\n')
  const signature = hmac(signingKey(cfg.secretAccessKey, shortDate), stringToSign, 'hex')
  params.set('X-Amz-Signature', signature)

  return `https://${host}${canonicalUri}?${canonicalQuery(params)}`
}

export function publicR2Url(key) {
  const { publicBaseUrl } = env()
  if (!publicBaseUrl || !key) return null
  return `${publicBaseUrl.replace(/\/+$/, '')}/${encodeKey(key)}`
}

export async function getR2ObjectBuffer(key) {
  const url = presignR2Url({ method: 'GET', key, expiresIn: 600, disposition: null })
  const response = await fetch(url)
  if (!response.ok) throw new Error(`R2 GET ${key} failed with ${response.status}`)
  return Buffer.from(await response.arrayBuffer())
}

export async function putR2ObjectBuffer(key, body, { contentType = 'application/octet-stream' } = {}) {
  const url = presignR2Url({ method: 'PUT', key, expiresIn: 600, disposition: null })
  const response = await fetch(url, {
    method: 'PUT',
    headers: { 'Content-Type': contentType },
    body,
  })
  if (!response.ok) throw new Error(`R2 PUT ${key} failed with ${response.status}`)
}
