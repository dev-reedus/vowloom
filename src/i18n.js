export const translations = {
  it: {
    kicker: 'Con gioia, vi invitiamo',
    title: 'Le Nostre Nozze',
    subtitle: 'Lista Invitati & Conferme',
    guests: 'Invitati',
    sentCount: 'Inviti Spediti',
    acceptedCount: 'Confermati',
    addPlaceholder: 'Aggiungi un invitato o una famiglia…',
    add: 'Aggiungi',
    sent: 'Spedito',
    accepted: 'Confermato',
    remove: (name) => `Rimuovi ${name}`,
    empty: 'Nessun invitato — aggiungi il primo qui sopra.',
    madeWith: 'Fatto con amore',
    langLabel: 'EN',
  },
  en: {
    kicker: 'Together with joy, we invite you',
    title: 'Our Wedding',
    subtitle: 'Guest List & RSVP Tracker',
    guests: 'Guests',
    sentCount: 'Invitations Sent',
    acceptedCount: 'Accepted',
    addPlaceholder: 'Add a guest or family…',
    add: 'Add',
    sent: 'Sent',
    accepted: 'Accepted',
    remove: (name) => `Remove ${name}`,
    empty: 'No guests yet — add your first above.',
    madeWith: 'Made with love',
    langLabel: 'IT',
  },
}

export const LANG_KEY = 'nozze.lang.v1'

export function loadLang() {
  try {
    const saved = localStorage.getItem(LANG_KEY)
    if (saved === 'it' || saved === 'en') return saved
  } catch {
    /* ignore */
  }
  return 'it'
}
