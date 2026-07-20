import { useEffect, useMemo, useState } from 'react'
import {
  Ban,
  CalendarClock,
  CircleAlert,
  Copy,
  Link2,
  LoaderCircle,
  Plus,
  ShieldCheck,
  Sparkles,
  Trash2,
} from 'lucide-react'
import { api } from '../api'
import { AdminDateTimeInput, AdminSelect, AdminTextInput } from '../components/AdminControls'
import AppIcon from '../components/AppIcon'

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

function formatGuestLinkDate(value, lang) {
  if (!value) return ''
  const date = new Date(String(value).replace(' ', 'T'))
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat(lang, { dateStyle: 'medium', timeStyle: 'short' }).format(date)
}

export function GuestLinksTable({
  tokens,
  t,
  canManageLinks = false,
  onCopy,
  onRevoke,
  onDelete,
  showEmpty = true,
  variant = 'default',
  lang = 'it',
  pendingAction = '',
}) {
  const studio = variant === 'studio'
  return (
    <div className={`admin-table ${studio ? 'guest-links-studio-list' : ''}`} role="table" aria-label={t.guestLinksTableLabel}>
      {tokens.length === 0 ? (
        showEmpty && <p className="empty">{t.guestLinksEmpty}</p>
      ) : (
        tokens.map((token) => {
          const tokenBusy = pendingAction.endsWith(`:${token.token}`)
          const formattedExpiry = formatGuestLinkDate(token.expires_at, lang)
          return (
          <div
            className={`admin-row ${studio ? 'guest-link-studio-row' : ''} ${token.revoked ? 'is-muted' : ''} ${!token.revoked && token.expires_at ? 'has-expiry' : ''}`}
            role="row"
            key={token.token}
          >
            <div className="guest-link-identity" role="cell">
              <strong>{token.label}</strong>
              <span>{token.token_preview}</span>
              {token.note && <small>{token.note}</small>}
            </div>
            <div className="guest-link-details" role="cell">
              <span className={`guest-link-state ${token.revoked ? 'is-revoked' : token.expires_at ? 'has-expiry' : 'is-active'}`}>
                {token.revoked
                  ? t.guestLinksRevoked
                  : token.expires_at
                    ? t.guestLinksExpires(formattedExpiry)
                    : t.guestLinksActive}
              </span>
              <span>
                {t.guestLinksUsage(token.open_count, token.download_url_count)}
              </span>
              <span>{t.guestLinksDefaultLanguage}: {token.default_lang?.toUpperCase?.() || 'IT'}</span>
            </div>
            <div className="admin-actions guest-link-actions" role="cell">
              <button type="button" onClick={() => onCopy(token.token)} disabled={token.revoked || tokenBusy}>
                {studio && <AppIcon icon={Copy} size={15} />}
                {t.guestLinksCopy}
              </button>
              {canManageLinks && (
                <>
                  <button
                    type="button"
                    className="secondary"
                    onClick={() => onRevoke(token.token)}
                    disabled={token.revoked || tokenBusy}
                  >
                    {studio && <AppIcon icon={pendingAction === `revoke:${token.token}` ? LoaderCircle : Ban} className={pendingAction === `revoke:${token.token}` ? 'gallery-spin' : ''} size={15} />}
                    {t.guestLinksRevoke}
                  </button>
                  <button
                    type="button"
                    className="danger"
                    onClick={() => onDelete(token.token)}
                    disabled={tokenBusy}
                  >
                    {studio && <AppIcon icon={pendingAction === `delete:${token.token}` ? LoaderCircle : Trash2} className={pendingAction === `delete:${token.token}` ? 'gallery-spin' : ''} size={15} />}
                    {t.guestLinksDelete}
                  </button>
                </>
              )}
            </div>
          </div>
          )
        })
      )}
    </div>
  )
}

export default function GuestLinksAdminPage({ isAdmin, t, lang = 'it' }) {
  const [tokens, setTokens] = useState([])
  const [label, setLabel] = useState('')
  const [expiresAt, setExpiresAt] = useState('')
  const [note, setNote] = useState('')
  const [defaultLang, setDefaultLang] = useState('it')
  const [status, setStatus] = useState('')
  const [loadError, setLoadError] = useState('')
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [pendingAction, setPendingAction] = useState('')
  const canManageLinks = isAdmin

  const origin = useMemo(() => window.location.origin, [])
  const expirySummary = useMemo(() => {
    if (!expiresAt) return t.guestLinksNoExpiry
    const formatted = formatGuestLinkDate(expiresAt, lang)
    return formatted ? t.guestLinksExpirySummary(formatted) : t.guestLinksInvalidExpiry
  }, [expiresAt, lang, t])

  async function reload() {
    setTokens(await api.listGalleryTokens())
  }

  useEffect(() => {
    let alive = true
    setLoadError('')
    reload()
      .catch((err) => {
        console.error('Failed to load guest links', err)
        if (alive) setLoadError(t.guestLinksLoadError)
      })
      .finally(() => alive && setLoading(false))
    return () => {
      alive = false
    }
  }, [])

  async function retryLoad() {
    setLoading(true)
    setLoadError('')
    try {
      await reload()
    } catch (err) {
      console.error('Failed to reload guest links', err)
      setLoadError(t.guestLinksLoadError)
    } finally {
      setLoading(false)
    }
  }

  async function writeLinkToClipboard(token) {
    if (!navigator.clipboard?.writeText) throw new Error('Clipboard API unavailable')
    await navigator.clipboard.writeText(`${origin}/g/${token}`)
  }

  async function createToken(event) {
    event.preventDefault()
    if (creating) return
    setCreating(true)
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
      try {
        await writeLinkToClipboard(token.token)
        setStatus(t.guestLinksCreated)
      } catch (clipboardError) {
        console.error('Failed to copy newly created guest link', clipboardError)
        setStatus(t.guestLinksCreatedNotCopied)
      }
    } catch (err) {
      console.error('Failed to create guest link', err)
      setStatus(t.guestLinksCreateError)
    } finally {
      setCreating(false)
    }
  }

  async function revokeToken(token) {
    if (!window.confirm(t.guestLinksRevokeConfirm)) return
    setPendingAction(`revoke:${token}`)
    try {
      const updated = await api.revokeGalleryToken(token)
      setTokens((prev) => prev.map((item) => (item.token === token ? updated : item)))
      setStatus(t.guestLinksRevokedSuccess)
    } catch (err) {
      console.error('Failed to revoke guest link', err)
      setStatus(t.guestLinksRevokeError)
    } finally {
      setPendingAction('')
    }
  }

  async function deleteToken(token) {
    if (!window.confirm(t.guestLinksDeleteConfirm)) return
    setPendingAction(`delete:${token}`)
    try {
      await api.deleteGalleryToken(token)
      setTokens((prev) => prev.filter((item) => item.token !== token))
      setStatus(t.guestLinksDeleted)
    } catch (err) {
      console.error('Failed to delete guest link', err)
      setStatus(t.guestLinksDeleteError)
    } finally {
      setPendingAction('')
    }
  }

  async function copyLink(token) {
    try {
      await writeLinkToClipboard(token)
      setStatus(t.guestLinksCopied)
    } catch (err) {
      console.error('Failed to copy guest link', err)
      setStatus(t.guestLinksCopyError)
    }
  }

  if (loading) {
    return (
      <section className="admin-panel guest-links-page guest-links-page-loading" aria-live="polite">
        <div className="guest-links-loading-head"><span /><span /></div>
        <div className="guest-links-loading-create" />
        <div className="guest-links-loading-cards"><span /><span /></div>
        <p><AppIcon icon={LoaderCircle} className="gallery-spin" /> {t.guestLinksLoading}</p>
      </section>
    )
  }

  return (
    <section className="admin-panel guest-links-page">
      <header className="admin-head guest-links-hero">
        <div>
          <p className="kicker">{t.guestLinksKicker}</p>
          <h2>{t.guestLinksTitle}</h2>
          <p>{t.guestLinksSubtitle}</p>
        </div>
        <span className="gallery-admin-photo-pill">
          <AppIcon icon={Link2} size={16} />
          {tokens.length}
        </span>
      </header>

      {status && (
        <p className="admin-status gallery-admin-notice" role="status" aria-live="polite">
          {status}
        </p>
      )}

      {loadError ? (
        <section className="gallery-admin-error" role="alert">
          <span><AppIcon icon={CircleAlert} size={28} strokeWidth={1.6} /></span>
          <h3>{t.guestLinksUnavailableTitle}</h3>
          <p>{loadError}</p>
          <button type="button" onClick={retryLoad}>{t.galleryAdminRetry}</button>
        </section>
      ) : (
        <>
          {canManageLinks ? (
            <section className="guest-link-create-card">
              <header className="gallery-section-head">
                <span className="gallery-section-icon"><AppIcon icon={Plus} size={21} /></span>
                <div>
                  <h3>{t.guestLinksCreateTitle}</h3>
                  <p>{t.guestLinksCreateBody}</p>
                </div>
              </header>

              <form className="guest-link-creator" onSubmit={createToken} aria-busy={creating}>
                <div className="guest-link-creator-fields">
                  <label className="admin-field">
                    <span className="admin-field-label">{t.guestLinksLabelLabel}</span>
                    <AdminTextInput
                      name="guest-link-label"
                      autoComplete="off"
                      required
                      value={label}
                      onChange={(event) => setLabel(event.target.value)}
                    />
                  </label>
                  <label className="admin-field">
                    <span className="admin-field-label">{t.guestLinksNoteLabel}</span>
                    <AdminTextInput
                      name="guest-link-note"
                      autoComplete="off"
                      value={note}
                      onChange={(event) => setNote(event.target.value)}
                    />
                  </label>
                  <div className="admin-field">
                    <span className="admin-field-label">{t.guestLinksDefaultLanguage}</span>
                    <AdminSelect
                      className="guest-link-language-select"
                      value={defaultLang}
                      onChange={setDefaultLang}
                      options={LANGUAGE_OPTIONS}
                      aria-label={t.guestLinksDefaultLanguage}
                      title={t.guestLinksDefaultLanguage}
                    />
                  </div>
                </div>

                <section className="guest-link-expiry-settings">
                  <header>
                    <span><AppIcon icon={CalendarClock} size={19} /></span>
                    <div>
                      <strong>{t.guestLinksExpiryLabel}</strong>
                      <small>{t.guestLinksExpiryHelp}</small>
                    </div>
                  </header>
                  <AdminDateTimeInput
                    label={t.guestLinksExpiryDateLabel}
                    name="guest-link-expiry"
                    autoComplete="off"
                    value={expiresAt}
                    onChange={(event) => setExpiresAt(event.target.value)}
                  />
                  <div className="expiry-presets">
                    <button type="button" onClick={() => setExpiresAt('')}>{t.guestLinksExpiryNever}</button>
                    <button type="button" onClick={() => setExpiresAt(localDateTimeInDays(30))}>{t.guestLinksExpiry30}</button>
                    <button type="button" onClick={() => setExpiresAt(localDateTimeInDays(90))}>{t.guestLinksExpiry90}</button>
                    <button type="button" onClick={() => setExpiresAt(localDateTimeInDays(365))}>{t.guestLinksExpiry365}</button>
                  </div>
                  <p className="guest-link-expiry-summary">{expirySummary}</p>
                </section>

                <button className="guest-link-create-submit" type="submit" disabled={creating}>
                  <AppIcon icon={creating ? LoaderCircle : Link2} className={creating ? 'gallery-spin' : ''} />
                  {creating ? t.guestLinksCreating : t.guestLinksCreate}
                </button>
              </form>
            </section>
          ) : (
            <p className="admin-readonly-note">{t.guestLinksReadonly}</p>
          )}

          <section className="guest-links-library">
            <header className="gallery-section-head">
              <span className="gallery-section-icon"><AppIcon icon={ShieldCheck} size={21} /></span>
              <div>
                <h3>{t.guestLinksListTitle}</h3>
                <p>{t.guestLinksListBody}</p>
              </div>
              <span className="gallery-admin-library-count">{tokens.length}</span>
            </header>

            {tokens.length === 0 ? (
              <div className="guest-links-empty">
                <span>
                  <AppIcon icon={Link2} size={31} strokeWidth={1.5} />
                  <AppIcon icon={Sparkles} className="guest-links-empty-sparkle" size={18} />
                </span>
                <h4>{t.guestLinksEmptyTitle}</h4>
                <p>{t.guestLinksEmptyBody}</p>
              </div>
            ) : (
              <GuestLinksTable
                tokens={tokens}
                t={t}
                lang={lang}
                canManageLinks={canManageLinks}
                onCopy={copyLink}
                onRevoke={revokeToken}
                onDelete={deleteToken}
                showEmpty={false}
                variant="studio"
                pendingAction={pendingAction}
              />
            )}
          </section>
        </>
      )}
    </section>
  )
}
