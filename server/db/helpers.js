// Small SQL value helpers shared across the data-access modules. Pure, no DB handle,
// so they can be imported anywhere without pulling in the connection.

// SQLite-friendly "now" as `YYYY-MM-DD HH:MM:SS` (UTC).
export const nowSql = () => new Date().toISOString().replace('T', ' ').slice(0, 19)

// Coerce an incoming date-ish string to the same SQLite format, or null.
export function normalizeSqlDate(value) {
  const clean = String(value || '').trim()
  if (!clean) return null
  return clean.replace('T', ' ').slice(0, 19)
}
