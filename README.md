# Nozze · Wedding Guest List 💍

A React and Express application for managing wedding invitations, replies,
party sizes, seating, private guest gallery links, and gallery photos. Data is
stored in SQLite and gallery objects can be stored in Cloudflare R2.

## Authentication and roles

The application uses a password login screen and server-side session cookies.
The password determines the role:

- `couple` can manage guests, tables, uploads, gallery previews, photo deletion,
  derivative generation, and view existing guest links.
- `admin` has the same access plus guest-link management, gallery budget and
  metadata configuration, R2 import, and database backup.

Session identifiers are random, stored only as SHA-256 hashes in SQLite, sent in
`HttpOnly` cookies, and expire after 30 days of inactivity or 180 days
absolutely. Sessions are bound to the current password for their role, so
rotating a role password invalidates that role's existing sessions after the
application restarts with the new configuration.

Production cookies are `Secure`; the production deployment must therefore be
served over HTTPS. `ALLOW_INSECURE_AUTH=1` relaxes that requirement for local
HTTP development and must not be used for a public deployment.

## Architecture

```text
React (Vite) ──build──▶ dist/ ──▶ Express ──▶ SQLite
                                      └─────▶ Cloudflare R2 (optional)
```

The unauthenticated SPA shell and `/healthz` are public. Application APIs require
a session, while `/api/gallery` is protected by a guest capability token.

## Configuration

Copy the example and fill in the secrets:

```bash
cp .env.example .env
chmod 600 .env
```

Important settings:

- `WEDDING_COUPLE_NAMES` is the public display name used throughout the UI.
- `WEDDING_YEAR` optionally adds a four-digit year to the footer.
- `WEDDING_GALLERY_TITLE` sets the album title returned to gallery clients.
- `DEFAULT_LANGUAGE` sets the initial UI language to `it`, `en`, or `ro`.
- `COUPLE_PASSWORD` and `ADMIN_PASSWORD` are required, non-empty, and distinct.
- `AUTH_PASSWORD` is supported only as a legacy fallback for
  `COUPLE_PASSWORD`.
- `TOKEN_SECRET` protects guest tokens at rest and should be a long random value.
- `SESSION_SECRET` optionally provides a separate key for password-bound session
  versions; it falls back to `TOKEN_SECRET`, then legacy `ADMIN_KEY`.
- `R2_*` variables configure Cloudflare R2.
- `HOST_PORT`, `APP_NAME`, and `DATA_VOLUME` configure Docker deployment.
- `SEED_EXAMPLE_TABLES=1` adds six generic demo tables to a new database;
  production deployments should normally leave it disabled.

`.env` is ignored by both Git and Docker. It is read by `deploy.sh` on the host
and its values are passed to the running container; it is not needed while
building the image.

## Develop

Install dependencies and build the frontend:

```bash
npm install
npm run build
```

For local HTTP development, set distinct passwords and explicitly enable the
insecure cookie mode:

```bash
COUPLE_PASSWORD='local-couple-password' \
ADMIN_PASSWORD='local-admin-password' \
TOKEN_SECRET='local-session-and-token-secret' \
WEDDING_COUPLE_NAMES='Alex & Sam' \
ALLOW_INSECURE_AUTH=1 \
npm start
```

The Express server serves `dist/` on port 80 by default. To use Vite hot reload,
run `npm run dev` separately; Vite proxies `/api` to port 80.

Run verification with:

```bash
npm test
npm run build
```

`better-sqlite3` is a native dependency. The Docker image uses Node 20; use a
compatible local Node version when developing outside Docker.

## Optional guest seed file

On first startup only, the server looks for an optional `lista.txt` beside
`package.json`. If it is absent, startup continues with an empty guest list.
Because the file may contain personal data, it is ignored by Git and is not
included in the Docker image.

The format is one guest per line. Optional flags use
`Name | sent | accepted`, where `1`, `x`, `yes`, `si`, `sì`, or `true` are
treated as true. Existing database records are never overwritten by seeding.

## Docker deployment

The deployment script builds the image, creates or reuses a named SQLite volume,
and restarts the container:

```bash
./deploy.sh
```

Inline environment values override non-empty values loaded from `.env`:

```bash
HOST_PORT=80 ./deploy.sh
```

The app is published as plain HTTP by the container. Put it behind an HTTPS
reverse proxy for production so secure session cookies work. `/healthz` remains
public for the container health check.

To build and run manually:

```bash
docker build -t utils-nozze .
docker run -d \
  --name utils-nozze \
  --restart unless-stopped \
  -p 8091:80 \
  -v utils-nozze-data:/app/data \
  -e WEDDING_COUPLE_NAMES='Alex & Sam' \
  -e WEDDING_YEAR='2030' \
  -e COUPLE_PASSWORD='couple-password' \
  -e ADMIN_PASSWORD='admin-password' \
  -e TOKEN_SECRET='long-random-secret' \
  utils-nozze
```

## Backup and restore

Admins can download a consistent SQLite snapshot using the **Save backup** link
or `GET /api/backup` with an authenticated admin session.

Restore a snapshot by replacing the database in the running container and
removing stale WAL files before restarting:

```bash
docker cp nozze-backup-YYYY-MM-DD.db utils-nozze:/app/data/nozze.db
docker exec utils-nozze sh -c 'rm -f /app/data/nozze.db-wal /app/data/nozze.db-shm'
docker restart utils-nozze
```

The Docker volume survives container replacement, but it is not a substitute
for an off-device backup.

## API summary

- `POST /api/login`, `POST /api/logout`, `GET /api/me`
- `GET /api/config` (public, allowlisted display settings only)
- `GET|POST /api/guests`, `PATCH|DELETE /api/guests/:id`
- `GET|POST /api/tables`, `PATCH|DELETE /api/tables/:id`
- `GET /api/backup` (admin only)
- `/api/admin/gallery/*` for authenticated gallery operations
- `/api/gallery*` for guest-token-protected gallery access

## Roadmap / TODO

- Make the seating-room floorplan dynamic and customizable instead of encoding
  one fixed layout in the frontend. A deployment should be able to define the
  room shape, dimensions, walls, doors, labels, and optional background image,
  while table coordinates remain normalized so layouts adapt across screen and
  print sizes.
