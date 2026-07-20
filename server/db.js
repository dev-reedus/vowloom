// Public data-access surface for the app. The implementation is split by domain
// under server/db/; this barrel keeps the single `./db.js` import path stable.
//
// Importing this module opens the SQLite database and runs migrations as a side
// effect (see ./db/connection.js), so tests that need a throwaway DB must set
// DB_PATH / SEED_FILE before importing it.

export { db, defaultPartySize, REPLY_STATUSES, backupDatabase } from './db/connection.js'
export { parseGuestList, seedIfEmpty, seedTablesIfEmpty } from './db/seed.js'
export { listGuests, addGuest, updateGuest, deleteGuest } from './db/guests.js'
export { listTables, addTable, updateTable, deleteTable } from './db/tables.js'
export {
  DEFAULT_FLOORPLAN,
  getFloorplan,
  updateFloorplan,
  getFloorplanBackground,
  saveFloorplanBackground,
  deleteFloorplanBackground,
} from './db/floorplan.js'
export {
  listAccessTokens,
  createAccessToken,
  revokeAccessToken,
  softDeleteAccessToken,
  validateGalleryToken,
} from './db/tokens.js'
export {
  listGalleryPhotos,
  listGalleryPhotosPage,
  getGalleryPhoto,
  deleteGalleryPhoto,
  upsertGalleryPhoto,
  updateGalleryPhotoDerivatives,
} from './db/photos.js'
export {
  recordOriginalDownloadUrl,
  countRecentOriginalDownloadUrls,
  setGalleryMonthlyBudget,
  getGalleryBudgetStatus,
} from './db/usage.js'
export {
  createSession,
  getValidSession,
  deleteSession,
  pruneExpiredSessions,
  SESSION_SLIDING_MS,
  SESSION_ABSOLUTE_MS,
  SESSION_TOUCH_INTERVAL_MS,
} from './db/sessions.js'
