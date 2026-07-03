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
    searchPlaceholder: 'Cerca un invitato…',
    noResults: 'Nessun risultato.',
    langLabel: 'EN',

    // navigation
    navList: 'Lista',
    navSeating: 'Tavoli',

    // seating page
    seatingTitle: 'Disposizione dei Tavoli',
    seatingSubtitle: 'Trascina gli invitati sui tavoli',
    unassigned: 'Da assegnare',
    allSeated: 'Tutti assegnati ✓',
    seatedOf: (a, b) => `${a} / ${b} persone sedute`,
    persons: 'persone',
    person: 'persona',
    modeAssign: 'Assegna invitati',
    modeLayout: 'Sposta tavoli',
    addTable: '+ Tavolo',
    tableSeats: (n) => `${n} posti`,
    emptyTables: 'Nessun tavolo. Passa a “Sposta tavoli” e aggiungine uno.',
    dropHint: 'Trascina qui gli invitati',
    unassign: 'Togli dal tavolo',
    deleteTable: 'Elimina tavolo',
    partyLabel: 'persone in questo invito',
    seatWord: 'Posto',
    noSeat: 'senza posto',
    seatHint: 'Seleziona un invitato, poi tocca una sedia',
    atTable: 'A questo tavolo',
    tableNamePlaceholder: 'Nome tavolo',
    seatsWord: 'posti',
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
    searchPlaceholder: 'Search a guest…',
    noResults: 'No results.',
    langLabel: 'IT',

    // navigation
    navList: 'Guest List',
    navSeating: 'Tables',

    // seating page
    seatingTitle: 'Seating Plan',
    seatingSubtitle: 'Drag guests onto the tables',
    unassigned: 'Unassigned',
    allSeated: 'Everyone seated ✓',
    seatedOf: (a, b) => `${a} / ${b} people seated`,
    persons: 'people',
    person: 'person',
    modeAssign: 'Assign guests',
    modeLayout: 'Move tables',
    addTable: '+ Table',
    tableSeats: (n) => `${n} seats`,
    emptyTables: 'No tables yet. Switch to “Move tables” and add one.',
    dropHint: 'Drag guests here',
    unassign: 'Remove from table',
    deleteTable: 'Delete table',
    partyLabel: 'people in this party',
    seatWord: 'Seat',
    noSeat: 'no seat',
    seatHint: 'Select a guest, then tap a chair',
    atTable: 'At this table',
    tableNamePlaceholder: 'Table name',
    seatsWord: 'seats',
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
