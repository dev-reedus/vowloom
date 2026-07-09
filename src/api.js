const JSON_HEADERS = { 'Content-Type': 'application/json' }

async function req(url, options) {
  const res = await fetch(url, options)
  if (!res.ok) throw new Error(`${options?.method || 'GET'} ${url} → ${res.status}`)
  return res.status === 204 ? null : res.json()
}

export const api = {
  // guests
  list: () => req('/api/guests'),
  add: (name) =>
    req('/api/guests', {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify({ name }),
    }),
  update: (id, fields) =>
    req(`/api/guests/${id}`, {
      method: 'PATCH',
      headers: JSON_HEADERS,
      body: JSON.stringify(fields),
    }),
  remove: (id) => req(`/api/guests/${id}`, { method: 'DELETE' }),

  // tables
  listTables: () => req('/api/tables'),
  addTable: (fields) =>
    req('/api/tables', {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify(fields || {}),
    }),
  updateTable: (id, fields) =>
    req(`/api/tables/${id}`, {
      method: 'PATCH',
      headers: JSON_HEADERS,
      body: JSON.stringify(fields),
    }),
  removeTable: (id) => req(`/api/tables/${id}`, { method: 'DELETE' }),

  // public gallery
  gallery: (token, params) => req(`/api/gallery?${galleryQuery({ ...(params || {}), token })}`),
  originalDownloadUrl: (photoId, token) =>
    req(`/api/gallery/photos/${photoId}/download-url`, {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify({ token }),
    }),

  // gallery admin
  listGalleryTokens: (adminKey) => req('/api/admin/gallery/tokens', { headers: adminHeaders(adminKey) }),
  createGalleryToken: (adminKey, fields) =>
    req('/api/admin/gallery/tokens', {
      method: 'POST',
      headers: adminHeaders(adminKey),
      body: JSON.stringify(fields || {}),
    }),
  revokeGalleryToken: (adminKey, token) =>
    req(`/api/admin/gallery/tokens/${encodeURIComponent(token)}/revoke`, {
      method: 'POST',
      headers: adminHeaders(adminKey),
    }),
  deleteGalleryToken: (adminKey, token) =>
    req(`/api/admin/gallery/tokens/${encodeURIComponent(token)}`, {
      method: 'DELETE',
      headers: adminHeaders(adminKey),
    }),
  listGalleryPhotos: (adminKey) => req('/api/admin/gallery/photos', { headers: adminHeaders(adminKey) }),
  deleteGalleryPhoto: (adminKey, photoId) =>
    req(`/api/admin/gallery/photos/${photoId}`, {
      method: 'DELETE',
      headers: adminHeaders(adminKey),
    }),
  galleryPreview: (adminKey, params) =>
    req(`/api/admin/gallery/preview?${galleryQuery(params || {})}`, { headers: adminHeaders(adminKey) }),
  adminOriginalDownloadUrl: (adminKey, photoId) =>
    req(`/api/admin/gallery/photos/${photoId}/download-url`, {
      method: 'POST',
      headers: adminHeaders(adminKey),
    }),
  galleryAdminStatus: (adminKey) => req('/api/admin/gallery/status', { headers: adminHeaders(adminKey) }),
  updateGalleryBudget: (adminKey, monthlyBudgetUsd) =>
    req('/api/admin/gallery/settings/budget', {
      method: 'POST',
      headers: adminHeaders(adminKey),
      body: JSON.stringify({ monthly_budget_usd: monthlyBudgetUsd }),
    }),
  saveGalleryPhoto: (adminKey, fields) =>
    req('/api/admin/gallery/photos', {
      method: 'POST',
      headers: adminHeaders(adminKey),
      body: JSON.stringify(fields || {}),
    }),
  generateGalleryDerivatives: (adminKey, photoId) =>
    req(`/api/admin/gallery/photos/${photoId}/generate-derivatives`, {
      method: 'POST',
      headers: adminHeaders(adminKey),
    }),
  createGalleryUploadUrl: (adminKey, fields) =>
    req('/api/admin/gallery/upload-url', {
      method: 'POST',
      headers: adminHeaders(adminKey),
      body: JSON.stringify(fields || {}),
    }),
  importGalleryR2: (adminKey, fields) =>
    req('/api/admin/gallery/import-r2', {
      method: 'POST',
      headers: adminHeaders(adminKey),
      body: JSON.stringify(fields || {}),
    }),
}

function adminHeaders(adminKey) {
  return { ...JSON_HEADERS, 'X-Admin-Key': adminKey || '' }
}

function galleryQuery(params = {}) {
  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') query.set(key, value)
  }
  return query.toString()
}
