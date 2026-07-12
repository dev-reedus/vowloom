import { useState } from 'react'
import { motion } from 'framer-motion'
import { api } from '../api'
import { nextLang } from '../i18n'

export default function LoginView({ t, onLogin, lang, setLang }) {
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e) {
    e.preventDefault()
    if (busy) return
    setBusy(true)
    setError('')
    try {
      const { role } = await api.login(password)
      onLogin(role)
    } catch (err) {
      // req() throws "POST /api/login → <status>"; map 429 to the rate-limit copy.
      setError(/→ 429$/.test(err.message) ? t.loginRateLimited : t.loginError)
      setBusy(false)
    }
  }

  return (
    <div className="login-page">
      {setLang && (
        <motion.button
          className="lang-toggle"
          onClick={() => setLang((p) => nextLang(p))}
          whileHover={{ scale: 1.06 }}
          whileTap={{ scale: 0.94 }}
          aria-label="Change language"
          title="Change language"
        >
          {t.langLabel}
        </motion.button>
      )}

      <motion.div
        className="login-card"
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, ease: 'easeOut' }}
      >
        <p className="kicker">{t.kicker}</p>
        <h1 className="script login-names">{t.title}</h1>
        <div className="divider">
          <span className="rule" />
          <svg className="heart" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 21s-6.716-4.35-9.428-8.06C.86 10.63 1.06 7.7 3.05 6.03a5.02 5.02 0 0 1 6.9.48L12 8.5l2.05-1.99a5.02 5.02 0 0 1 6.9-.48c1.99 1.67 2.19 4.6.48 6.91C18.716 16.65 12 21 12 21z" />
          </svg>
          <span className="rule" />
        </div>
        <p className="login-prompt">{t.loginTitle}</p>

        <form className="login-form" onSubmit={submit}>
          <input
            className="login-input"
            type="password"
            autoFocus
            autoComplete="current-password"
            placeholder={t.loginPassword}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          {error && (
            <motion.p className="login-error" initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}>
              {error}
            </motion.p>
          )}
          <button className="login-submit" type="submit" disabled={busy || !password}>
            {t.loginSubmit}
          </button>
        </form>
      </motion.div>
    </div>
  )
}
