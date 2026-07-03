const JSON_HEADERS = { 'Content-Type': 'application/json' }

async function req(url, options) {
  const res = await fetch(url, options)
  if (!res.ok) throw new Error(`${options?.method || 'GET'} ${url} → ${res.status}`)
  return res.status === 204 ? null : res.json()
}

export const api = {
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
}
