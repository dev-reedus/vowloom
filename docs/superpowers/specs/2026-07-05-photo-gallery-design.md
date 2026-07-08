# Design — Photo gallery with shareable per-guest links

Date: 2026-07-05
Status: **future / not scheduled** — captured for when we pick it up. No code yet.

## Goal

Let wedding guests browse the photos on a dedicated gallery page and get the
originals when they want them, via a personal link we share (no site password).
The gallery must look full-quality, and true originals must be available without
any quality loss.

## Guiding principle

Keep the **download path dumb and the browsing path smart**. Originals are
served as untouched bytes; everything clever (thumbnails, grid, lightbox,
adaptive sizes) happens on *derivatives*. "Same quality" that matters is
**visually lossless at the viewer's screen resolution**, not byte-identical to
the original in the render path.

Two reasons never to render true originals directly in `<img>`:

1. **Format** — originals are often HEIC / RAW / TIFF, which browsers can't
   reliably display. A web-friendly derivative (JPEG/WebP/AVIF) is required to
   show them at all.
2. **Bandwidth** — a 24MP original is ~10–15 MB; a phone shows ~1200px. Shipping
   the full file to render it wastes the Pi's upload and the guest's data for no
   visible gain.

## Derivatives (per photo)

- **Thumbnail** — small, compressed, lazy-loaded; used in the grid. Pair with a
  blur-up placeholder (LQIP) for perceived speed.
- **Large display sizes** — a few widths (e.g. 1280 / 2048 / 2560) at quality
  ~85–90, delivered via `<picture>` as **AVIF → WebP → JPEG**, selected with
  `srcset`. Visually indistinguishable from the original on screen.
- **Original** — the untouched file, archived. Exposed only as an explicit
  **"Download original"** action (`Content-Disposition: attachment`), never
  transcoded on the way out. This is where genuine no-quality-loss lives.

## Storage — not on the SD card

A gallery is many GB; the SD card is small and failure-prone (see the DB backup
concern). Options, in order of preference:

1. **Object storage (recommended)** — Cloudflare R2 (zero egress) or Backblaze
   B2. Originals + derivatives live there. The Pi stores only tokens + metadata
   in SQLite and hands out **presigned URLs**, so heavy bytes go browser↔cloud
   and never touch the Pi's bandwidth. Durability is decoupled from the SD.
2. **External USB SSD** — mounted as a Docker volume (`/app/photos`), never the
   SD. Express streams files. Simpler, but home upload speed is the bottleneck
   and backups are on us.

## Producing the sizes

- **Pre-generate** on upload with `sharp` (thumb + 2–3 large sizes + keep the
  original), or
- **On-the-fly + CDN cache** — keep only originals; a resizer (Cloudflare
  Images, or imgproxy / Thumbor) generates and caches sizes on first request.
  Less storage bookkeeping; fits the R2/Cloudflare path.

**Do not resize on the Pi at request time** — it is CPU-bound and will crawl.
Pre-generate or offload to a CDN/worker.

## Access — capability tokens

Personal shareable link, no Basic Auth prompt for guests.

- New SQLite table:
  `access_tokens(token PRIMARY KEY, label, scope, created_at, expires_at, revoked)`.
- Generate tokens with `crypto.randomBytes(24).toString('base64url')` — long,
  unguessable.
- A `/g/:token` gallery route (frontend) + `/api/gallery?token=…` (data) are
  **exempted from the Basic Auth middleware** — same mechanism `/healthz` already
  uses — and validate the token instead.
- The admin/upload side stays behind the existing Basic Auth (or the
  `mode="admin"` gate).
- Token grants read-only gallery access; optional per-guest `label` (see who
  opened it), `expires_at` (auto-close after the event), `revoked` (kill a leaked
  link).

**Capability-URL caveats** (all low-risk for a wedding, worth knowing): URLs
leak via history, referrer, and screenshots. Mitigate with long tokens,
`Referrer-Policy: no-referrer` on the gallery page, an expiry date, and
revocation. Avoid one shared token for everyone if revocation granularity
matters.

## Frontend

The current app is a view-toggle SPA (`view = 'list' | 'seating'`) with no
router. The gallery needs real routing:

- Add lightweight routing (react-router, or parse `location.pathname` for
  `/g/:token`). The gallery is a distinct concern — keeping it a separate
  page/route (even a separate bundle) keeps the RSVP app lean.
- Gallery UI: lazy-loaded thumbnail grid → lightbox (use **PhotoSwipe**, the
  standard, rather than hand-rolling) → **Download original** button pointing at
  the presigned URL or an Express `res.download` stream (supports HTTP range /
  resume via `sendFile`).
- **"Download all" is a trap** — zipping GBs on a Pi is brutal. Offer per-photo
  (and maybe per-album) downloads; if one-click-all is really wanted,
  pre-build the zip once, not on demand.

## Rough build sequence (when scheduled)

1. Storage decision (R2 vs SSD) + credentials/mounting.
2. Upload/ingest path (admin-only): store original, generate derivatives.
3. `access_tokens` table + generation/revocation (admin) + Basic Auth exemption
   for `/g/*` and gallery API.
4. Gallery route + grid + PhotoSwipe lightbox + adaptive `<picture>`/`srcset`.
5. Download-original action (presigned URL or streamed).
6. Polish: LQIP placeholders, expiry UI, optional per-guest labels.

## Recommendation

Gallery = adaptive, visually-lossless derivatives via `<picture>`/`srcset` from
a CDN, with archived originals available as an on-demand download, gated by a
capability-token `/g/:token` route exempt from Basic Auth. Same result as a plain
download feature, better experience, and true lossless kept where it counts.
Keeps the Pi doing almost nothing heavy and survives an SD failure.

## Open questions (decide when scheduled)

- R2/B2 vs self-hosted SSD?
- Pre-generate derivatives vs on-the-fly CDN resizing?
- One album or multiple (per event/day)?
- One shared token vs per-guest tokens (revocation granularity)?
- Do we need upload from the app, or are photos pushed to storage out-of-band?

## Out of scope

- Face recognition / auto-tagging.
- Guest uploads (guests contributing photos).
- Comments / favorites / print ordering.
