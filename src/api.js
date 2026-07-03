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
}
