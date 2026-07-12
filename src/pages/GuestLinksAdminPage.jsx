import { useEffect, useMemo, useState } from 'react'
import { api } from '../api'
import { AdminDateTimeInput, AdminSelect, AdminTextInput } from '../components/AdminControls'

const LANGUAGE_OPTIONS = [
  { value: 'it', label: 'Italiano' },
  { value: 'en', label: 'English' },
  { value: 'ro', label: 'Română' },
]

function localDateTimeInDays(days) {
  const date = new Date(Date.now() + days * 24 * 60 * 60 * 1000)
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset())
  return date.toISOString().slice(0, 16)
}

export function GuestLinksTable({
  tokens,
  t,
  canManageLinks = false,
  onCopy,
  onRevoke,
  onDelete,
  showEmpty = true,
}) {
  return (
    <div className="admin-table" role="table" aria-label={t.guestLinksTableLabel}>
      {tokens.length === 0 ? (
        showEmpty && <p className="empty">{t.guestLinksEmpty}</p>
      ) : (
        tokens.map((token) => (
          <div className={`admin-row ${token.revoked ? 'is-muted' : ''}`} key={token.token}>
            <div>
              <strong>{token.label}</strong>
              <span>{token.token_preview}</span>
            </div>
            <div>
              <span>
                {token.revoked
                  ? t.guestLinksRevoked
                  : token.expires_at
                    ? t.guestLinksExpires(token.expires_at)
                    : t.guestLinksActive}
              </span>
              <span>
                {t.guestLinksUsage(token.open_count, token.download_url_count)}
              </span>
              <span>{t.guestLinksDefaultLanguage}: {token.default_lang?.toUpperCase?.() || 'IT'}</span>
            </div>
            <div className="admin-actions">
              <button type="button" onClick={() => onCopy(token.token)} disabled={token.revoked}>
                {t.guestLinksCopy}
              </button>
              {canManageLinks && (
                <>
                  <button type="button" onClick={() => onRevoke(token.token)} disabled={token.revoked}>
                    {t.guestLinksRevoke}
                  </button>
                  <button type="button" onClick={() => onDelete(token.token)}>
                    {t.guestLinksDelete}
                  </button>
                </>
              )}
            </div>
          </div>
        ))
      )}
    </div>
  )
}

export default function GuestLinksAdminPage({ isAdmin, t }) {
  const [tokens, setTokens] = useState([])
  const [label, setLabel] = useState('')
  const [expiresAt, setExpiresAt] = useState('')
  const [note, setNote] = useState('')
  const [defaultLang, setDefaultLang] = useState('it')
  const [status, setStatus] = useState('')
  const [loading, setLoading] = useState(true)
  const canManageLinks = isAdmin

  const origin = useMemo(() => window.location.origin, [])
  const expirySummary = useMemo(() => {
    if (!expiresAt) return t.guestLinksNoExpiry
    const date = new Date(expiresAt)
    if (Number.isNaN(date.getTime())) return t.guestLinksInvalidExpiry
    return t.guestLinksExpirySummary(date.toLocaleString())
  }, [expiresAt, t])

  async function reload() {
    setTokens(await api.listGalleryTokens())
  }

  useEffect(() => {
    let alive = true
    reload()
      .catch((err) => {
        console.error('Failed to load guest links', err)
        if (alive) setStatus(t.guestLinksLoadError)
      })
      .finally(() => alive && setLoading(false))
    return () => {
      alive = false
    }
  }, [])

  async function createToken(event) {
    event.preventDefault()
    setStatus('')
    try {
      const token = await api.createGalleryToken({
        label,
        expires_at: expiresAt || null,
        note,
        default_lang: defaultLang,
      })
      setTokens((prev) => [token, ...prev])
      setLabel('')
      setExpiresAt('')
      setNote('')
      setDefaultLang('it')
      await navigator.clipboard?.writeText(`${origin}/g/${token.token}`)
      setStatus(t.guestLinksCreated)
    } catch (err) {
      console.error('Failed to create guest link', err)
      setStatus(t.guestLinksCreateError)
    }
  }

  async function revokeToken(token) {
    if (!window.confirm(t.guestLinksRevokeConfirm)) return
    try {
      const updated = await api.revokeGalleryToken(token)
      setTokens((prev) => prev.map((item) => (item.token === token ? updated : item)))
    } catch (err) {
      console.error('Failed to revoke guest link', err)
      setStatus(t.guestLinksRevokeError)
    }
  }

  async function deleteToken(token) {
    if (!window.confirm(t.guestLinksDeleteConfirm)) return
    try {
      await api.deleteGalleryToken(token)
      setTokens((prev) => prev.filter((item) => item.token !== token))
      setStatus(t.guestLinksDeleted)
    } catch (err) {
      console.error('Failed to delete guest link', err)
      setStatus(t.guestLinksDeleteError)
    }
  }

  function copyLink(token) {
    navigator.clipboard?.writeText(`${origin}/g/${token}`)
    setStatus(t.guestLinksCopied)
  }

  if (loading) return <section className="admin-panel">{t.guestLinksLoading}</section>

  return (
    <section className="admin-panel">
      <header className="admin-head">
        <div>
          <p className="kicker">{t.guestLinksKicker}</p>
          <h2>{t.guestLinksTitle}</h2>
        </div>
        {status && <p className="admin-status">{status}</p>}
      </header>

      {canManageLinks ? (
        <>
          <form className="admin-form guest-link-form" onSubmit={createToken}>
            <AdminTextInput value={label} onChange={(e) => setLabel(e.target.value)} placeholder={t.guestLinksLabelPlaceholder} />
            <AdminTextInput value={note} onChange={(e) => setNote(e.target.value)} placeholder={t.guestLinksNotePlaceholder} />
            <AdminSelect
              className="guest-link-language-select"
              value={defaultLang}
              onChange={setDefaultLang}
              options={LANGUAGE_OPTIONS}
              aria-label={t.guestLinksDefaultLanguage}
              title={t.guestLinksDefaultLanguage}
            />
            <button type="submit">{t.guestLinksCreate}</button>
          </form>

          <div className="expiry-panel">
            <AdminDateTimeInput
              label={t.guestLinksExpiryLabel}
              value={expiresAt}
              onChange={(e) => setExpiresAt(e.target.value)}
            />
            <div className="expiry-presets">
              <button type="button" onClick={() => setExpiresAt('')}>{t.guestLinksExpiryNever}</button>
              <button type="button" onClick={() => setExpiresAt(localDateTimeInDays(30))}>{t.guestLinksExpiry30}</button>
              <button type="button" onClick={() => setExpiresAt(localDateTimeInDays(90))}>{t.guestLinksExpiry90}</button>
              <button type="button" onClick={() => setExpiresAt(localDateTimeInDays(365))}>{t.guestLinksExpiry365}</button>
            </div>
            <p>{expirySummary}</p>
          </div>
        </>
      ) : (
        <p className="admin-readonly-note">{t.guestLinksReadonly}</p>
      )}

      <GuestLinksTable
        tokens={tokens}
        t={t}
        canManageLinks={canManageLinks}
        onCopy={copyLink}
        onRevoke={revokeToken}
        onDelete={deleteToken}
      />
    </section>
  )
}
