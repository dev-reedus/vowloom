import { createApp } from './app.js'
import { assertAuthConfig, PORT } from './config.js'
import { seedIfEmpty, seedTablesIfEmpty } from './db.js'
import { pruneExpiredSessions } from './db/sessions.js'

// Fail closed on missing/guessable/ambiguous auth secrets before we bind the port.
assertAuthConfig()

const app = createApp()

const gseed = seedIfEmpty()
if (gseed.seeded > 0) console.log(`[server] Seeded ${gseed.seeded} guests from lista.txt.`)
const tseed = seedTablesIfEmpty()
if (tseed.seeded > 0) console.log(`[server] Seeded ${tseed.seeded} example tables.`)

const pruned = pruneExpiredSessions()
if (pruned > 0) console.log(`[server] Pruned ${pruned} expired session(s).`)

app.listen(PORT, () => console.log(`[server] Listening on :${PORT}`))
