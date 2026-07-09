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
    .map(([key, value]) => [encodePathPart(key), encodePathPart(value)])
    .sort(([aKey, aValue], [bKey, bValue]) => {
      if (aKey === bKey) return aValue < bValue ? -1 : aValue > bValue ? 1 : 0
      return aKey < bKey ? -1 : 1
    })
    .map(([key, value]) => `${key}=${value}`)
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

function decodeXml(value) {
  return String(value || '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
}

function signedBucketUrl({ params, expiresIn = 300 } = {}) {
  if (!isR2Configured()) throw new Error('R2 is not configured')

  const cfg = env()
  const date = new Date()
  const fullDate = amzDate(date)
  const shortDate = fullDate.slice(0, 8)
  const host = `${cfg.accountId}.r2.cloudflarestorage.com`
  const canonicalUri = `/${encodePathPart(cfg.bucket)}`
  const credentialScope = `${shortDate}/${REGION}/${SERVICE}/aws4_request`
  const signedHeaders = 'host'
  const query = new URLSearchParams(params || {})

  query.set('X-Amz-Algorithm', ALGORITHM)
  query.set('X-Amz-Credential', `${cfg.accessKeyId}/${credentialScope}`)
  query.set('X-Amz-Date', fullDate)
  query.set('X-Amz-Expires', String(Math.max(1, Math.min(Number(expiresIn) || 300, 604800))))
  query.set('X-Amz-SignedHeaders', signedHeaders)

  const canonicalRequest = [
    'GET',
    canonicalUri,
    canonicalQuery(query),
    `host:${host}\n`,
    signedHeaders,
    'UNSIGNED-PAYLOAD',
  ].join('\n')

  const stringToSign = [ALGORITHM, fullDate, credentialScope, sha256(canonicalRequest)].join('\n')
  const signature = hmac(signingKey(cfg.secretAccessKey, shortDate), stringToSign, 'hex')
  query.set('X-Amz-Signature', signature)

  return `https://${host}${canonicalUri}?${canonicalQuery(query)}`
}

function parseListObjectsXml(xml) {
  const objects = []
  for (const match of String(xml).matchAll(/<Contents>([\s\S]*?)<\/Contents>/g)) {
    const block = match[1]
    const key = decodeXml(block.match(/<Key>([\s\S]*?)<\/Key>/)?.[1])
    if (!key) continue
    objects.push({
      key,
      size: Number(block.match(/<Size>([\s\S]*?)<\/Size>/)?.[1]) || 0,
      last_modified: decodeXml(block.match(/<LastModified>([\s\S]*?)<\/LastModified>/)?.[1]) || null,
    })
  }
  return {
    objects,
    is_truncated: /<IsTruncated>true<\/IsTruncated>/.test(xml),
    next_continuation_token: decodeXml(
      String(xml).match(/<NextContinuationToken>([\s\S]*?)<\/NextContinuationToken>/)?.[1],
    ) || null,
  }
}

export const __test = { canonicalQuery, parseListObjectsXml }

export async function listR2Objects({ prefix = '', maxKeys = 1000 } = {}) {
  const objects = []
  let continuationToken = null

  do {
    const params = {
      'list-type': '2',
      'max-keys': String(Math.max(1, Math.min(Number(maxKeys) || 1000, 1000))),
    }
    if (prefix) params.prefix = prefix
    if (continuationToken) params['continuation-token'] = continuationToken

    const response = await fetch(signedBucketUrl({ params, expiresIn: 300 }))
    if (!response.ok) throw new Error(`R2 LIST failed with ${response.status}`)
    const page = parseListObjectsXml(await response.text())
    objects.push(...page.objects)
    continuationToken = page.is_truncated ? page.next_continuation_token : null
  } while (continuationToken)

  return objects
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

export async function deleteR2Object(key) {
  if (!key) return
  const url = presignR2Url({ method: 'DELETE', key, expiresIn: 600, disposition: null })
  const response = await fetch(url, { method: 'DELETE' })
  if (!response.ok) throw new Error(`R2 DELETE ${key} failed with ${response.status}`)
}
