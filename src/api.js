const JSON_HEADERS = { 'Content-Type': 'application/json' }

async function req(url, options) {
  const res = await fetch(url, options)
  if (!res.ok) throw new Error(`${options?.method || 'GET'} ${url} → ${res.status}`)
  return res.status === 204 ? null : res.json()
}

export const api = {
  // auth / session
  me: async () => {
    const res = await fetch('/api/me')
    if (res.status === 401) return null
    if (!res.ok) throw new Error(`GET /api/me → ${res.status}`)
    return res.json()
  },
  login: (password) =>
    req('/api/login', {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify({ password }),
    }),
  logout: () => req('/api/logout', { method: 'POST' }),

  // guests
  list: () => req('/api/guests'),
  add: (name) =>
    req('/api/guests', { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify({ name }) }),
  update: (id, fields) =>
    req(`/api/guests/${id}`, { method: 'PATCH', headers: JSON_HEADERS, body: JSON.stringify(fields) }),
  remove: (id) => req(`/api/guests/${id}`, { method: 'DELETE' }),

  // tables
  listTables: () => req('/api/tables'),
  addTable: (fields) =>
    req('/api/tables', { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify(fields || {}) }),
  updateTable: (id, fields) =>
    req(`/api/tables/${id}`, { method: 'PATCH', headers: JSON_HEADERS, body: JSON.stringify(fields) }),
  removeTable: (id) => req(`/api/tables/${id}`, { method: 'DELETE' }),

  // public gallery
  gallery: (token, params) => req(`/api/gallery?${galleryQuery({ ...(params || {}), token })}`),
  originalDownloadUrl: (photoId, token) =>
    req(`/api/gallery/photos/${photoId}/download-url`, {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify({ token }),
    }),

  // gallery admin (session cookie carries auth; server enforces role)
  listGalleryTokens: () => req('/api/admin/gallery/tokens'),
  createGalleryToken: (fields) =>
    req('/api/admin/gallery/tokens', {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify(fields || {}),
    }),
  revokeGalleryToken: (token) =>
    req(`/api/admin/gallery/tokens/${encodeURIComponent(token)}/revoke`, { method: 'POST' }),
  deleteGalleryToken: (token) =>
    req(`/api/admin/gallery/tokens/${encodeURIComponent(token)}`, { method: 'DELETE' }),
  listGalleryPhotos: () => req('/api/admin/gallery/photos'),
  deleteGalleryPhoto: (photoId) => req(`/api/admin/gallery/photos/${photoId}`, { method: 'DELETE' }),
  galleryPreview: (params) => req(`/api/admin/gallery/preview?${galleryQuery(params || {})}`),
  adminOriginalDownloadUrl: (photoId) =>
    req(`/api/admin/gallery/photos/${photoId}/download-url`, { method: 'POST' }),
  galleryAdminStatus: () => req('/api/admin/gallery/status'),
  updateGalleryBudget: (monthlyBudgetUsd) =>
    req('/api/admin/gallery/settings/budget', {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify({ monthly_budget_usd: monthlyBudgetUsd }),
    }),
  saveGalleryPhoto: (fields) =>
    req('/api/admin/gallery/photos', {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify(fields || {}),
    }),
  generateGalleryDerivatives: (photoId) =>
    req(`/api/admin/gallery/photos/${photoId}/generate-derivatives`, { method: 'POST' }),
  createGalleryUploadUrl: (fields) =>
    req('/api/admin/gallery/upload-url', {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify(fields || {}),
    }),
  importGalleryR2: (fields) =>
    req('/api/admin/gallery/import-r2', {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify(fields || {}),
    }),
}

function galleryQuery(params = {}) {
  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') query.set(key, value)
  }
  return query.toString()
}
