# Nozze · Wedding Guest List 💍

A small, elegant React app to track wedding invitations. For each guest you get:

- their **name**,
- an **Invitation Sent** checkbox,
- a **reply status** - *pending · accepted · maybe · declined*,
- and a form to **add new guests**.

The guest list shows a **stats dashboard** (counts per status plus a confirmed
headcount), and the seating plan flags **over-capacity tables** and guests who
still need a seat (both *accepted* and *maybe* guests count toward capacity).

Styled for a wedding (blush + gold, script headings) with soft animations
via [framer-motion](https://www.framer.com/motion/).

**Storage:** a small Node/Express backend keeps the guests in a **SQLite**
database (`data/nozze.db`). In Docker the `data/` directory is a volume, so the
list survives container `stop` / `rm` / redeploys.

**Seeding:** on first start (empty DB only) the list is pre-populated from
[`lista.txt`](./lista.txt) - one guest per line, `•` bullets and the
`Nome / Invito / Conferma` header are ignored. You can also add optional status
flags: `Name | sent | accepted` (flag truthy for `1`/`x`/`yes`/`si`/`true`).
Once seeded it is never overwritten, so edits made in the app are safe.

**Localization:** Italian and English, toggled with the button in the top-right
corner (defaults to Italian; the choice is remembered).

**Password:** HTTP Basic Auth handled by the server. Real server-side
protection - the API and app are gated until the browser authenticates.

## Architecture

```
React (Vite) ──build──▶ dist/  ─┐
                                ├─▶ Express server ──▶ SQLite (data/nozze.db)
lista.txt ──seed on 1st run ────┘        │
                                    Basic Auth + /api + static
```

## Develop

```bash
npm install
npm start           # API + static on http://localhost:80  (serves dist/)
npm run dev         # Vite dev server on http://localhost:5173 (proxies /api → :80)
```

Run both: `npm start` in one terminal, `npm run dev` in another.

> **Note:** `better-sqlite3` compiles a native addon and currently supports
> Node ≤ 22. On a newer local Node, either use `nvm use 20` or just run
> everything in Docker (below) - the image pins Node 20.

## Build

```bash
npm run build      # outputs static site to dist/
```

## Run with Docker

Multi-stage build → Node server serving the app + SQLite API:

```bash
docker build -t utils-nozze .

# with a password (recommended) and a named volume for the DB:
docker run -d -p 8091:80 --name utils-nozze \
  -v utils-nozze-data:/app/data \
  -e AUTH_USER=sposi -e AUTH_PASSWORD='our-secret' \
  utils-nozze

# open http://localhost:8091  → browser asks for user / password
```

- `-v utils-nozze-data:/app/data` persists the SQLite DB across `stop`/`rm`.
- `AUTH_PASSWORD` toggles Basic Auth: set it to protect the site, leave it empty
  to run open (only fine for local testing). `AUTH_USER` defaults to `sposi`.
- `/healthz` stays open for the container healthcheck.

### API

`GET /api/guests` · `POST /api/guests {name}` ·
`PATCH /api/guests/:id {sent?, reply_status?}` · `DELETE /api/guests/:id` ·
`GET /api/backup` (downloads a `.db` snapshot)

## Backup & restore

The Docker volume keeps the database across container `stop`/`rm`/redeploys, but
**not** across a dead SD card. Keep an off-device copy:

- **Backup:** click **Save backup** in the app footer (or open `/api/backup`).
  You get a timestamped `nozze-backup-YYYY-MM-DD.db` - the full database (guests
  *and* tables). Save it somewhere off the Pi (phone, laptop, cloud drive).
- **Restore:** drop that file back in as the database and restart:

  ```bash
  docker cp nozze-backup-2026-07-05.db utils-nozze:/app/data/nozze.db
  # clear any stale write-ahead files so the restored DB is used as-is
  docker exec utils-nozze sh -c 'rm -f /app/data/nozze.db-wal /app/data/nozze.db-shm'
  docker restart utils-nozze
  ```

  (Seeding only runs on an empty DB, so restoring never gets overwritten.)

## Deploy (Raspberry Pi or any machine)

Copy the project onto the target machine (e.g. `git clone`, `scp -r`, or a USB
stick) and run the script **there**. It just needs Docker; it builds the image
natively for that machine's architecture and (re)starts the container with a
persistent data volume.

The tidiest way is an **`.env` file** (so you don't retype the password each
time):

```bash
cp .env.example .env      # then edit .env and set AUTH_PASSWORD
./deploy.sh
```

Or pass values inline - these override `.env`:

```bash
HOST_PORT=80 AUTH_USER=george AUTH_PASSWORD='our-secret' ./deploy.sh
```

Configurable vars (in `.env` or inline): `APP_NAME`, `HOST_PORT`, `AUTH_USER`,
`AUTH_PASSWORD`, `ADMIN_KEY`, `DATA_VOLUME`, `R2_*`, and `GALLERY_*` settings.
Defaults include `utils-nozze`, `8091`, `sposi`, an empty password, and
`<APP_NAME>-data`. `.env` is git-ignored so your password stays out of git. The
script warns and asks for confirmation if you deploy without a password, and
prints the LAN URL when it's up. The DB volume survives `stop`/`rm`/redeploys,
so `lista.txt` seeds only the very first time.

`ADMIN_KEY` is required for sensitive gallery controls such as creating,
revoking, or deleting guest links and changing monthly budget configuration. Set
the same value in browser `localStorage` as `adminKey` when you need those
controls.

> First run on a Pi has no Docker? Install it with
> `curl -sSL https://get.docker.com | sh`, then
> `sudo usermod -aG docker "$USER"` and log out/in.
