# Van's Warehouse

Phone tool for the shop floor: receive deliveries, label them, find them,
check them out to a job. Every phone sees the same live list.

- **On floor**: everything received and not yet taken. Search, filter by
  color tag, tap a thumbnail for the full photo.
- **Scan**: full-screen camera, or type / wedge-scan a code. Known code →
  opens the entry. Unknown code → Receive with that code filled in.
- **Receive**: mint a new `VW-` code or use the code already on the box.
  Job is required; everything else is optional. Box photo from the in-app
  camera. Ends on the sticker with Save and Print.
- **Checked out**: what left the floor, who took it, when.
- **Entry**: check out (asks who took it), return to floor, edit, retake
  photo (until checkout), save/print sticker, remove (row + sticker + photos).
- **Menu (☰)**: export backup, restore backup, database/storage check, lock
  this phone.

Stack: Vite, React, TanStack Router, Tailwind CSS v4, Supabase JS. The build
is a static single-page app for Cloudflare Pages: no Worker, no server.

## Environment variables

Copy `.env.example` to `.env` and fill it in. `.env` is git-ignored. All
three are read at **build** time and baked into `dist/`.

| Variable | What it is |
|---|---|
| `VITE_SUPABASE_URL` | Supabase → Project Settings → API → Project URL (`https://<ref>.supabase.co`). A bare project ref also works. |
| `VITE_SUPABASE_ANON_KEY` | Supabase → Project Settings → API → `anon` `public` key. **Never** the `service_role` / secret key. |
| `VITE_SHOP_PIN` | The shop PIN for the unlock screen. Only its SHA-256 hash goes into the bundle. Changing it and re-uploading re-locks every phone. |

`npm run build:pages` refuses to produce `dist.zip` if the bundle contains a
non-anon Supabase key or the plain PIN.

Optional: to change the PIN without rebuilding, add a hash to `settings`
(both the build PIN and this one will then work):

```sql
insert into public.settings (key, value)
values ('shop_pin_hash', encode(extensions.digest('NEW-PIN', 'sha256'), 'hex'))
on conflict (key) do update set value = excluded.value;
```

## Database: the SQL to run

One file: [`supabase/schema.sql`](supabase/schema.sql).

Supabase → **SQL Editor** → **New query** → paste the whole file → **Run**.

It:

1. Drops and recreates `public.packages` and `public.settings` (all test
   rows are deleted).
2. Adds `photo_path` (≈1280px JPEG) and `thumb_path` (320px square crop).
3. Turns on row-level security with anon read/write on `packages` and anon
   read on `settings`.
4. Adds `packages` to the `supabase_realtime` publication.
5. Creates the public storage buckets `barcodes` and `package-photos` with
   anon read / insert / update / delete policies.

The last query prints `buckets_ready = 2` and `photo_columns = 2` when it
worked. In the app, ☰ → **Check database & storage** shows the same.

There is no Supabase Auth and no user accounts. The anon key is in the page
and the PIN gate is a shop-floor lock, not real security: anyone with the
site URL and some skill can read the list. Do not store personal data.

Storage layout:

```
barcodes/<code>.png                       sticker
package-photos/<code>/<stamp>.jpg         full photo
package-photos/<code>/<stamp>-t.jpg       thumbnail
```

## Run it locally

Node 22+.

```sh
npm install
cp .env.example .env      # then fill in the three values
npm run dev               # http://localhost:8080
```

Camera access needs HTTPS or `localhost`. To try the camera on a phone,
use the deployed Pages site.

Checks:

```sh
npm run typecheck
npm test                  # unit tests
npm run build && npm run smoke   # end-to-end on the built app vs a fake Supabase
```

## Build the Cloudflare Pages zip

```sh
npm run build:pages
```

Produces `dist/` and `dist.zip`, each with exactly:

```
index.html
app.js
app.css
_redirects        /*    /index.html    200
```

Fonts and the logo are inlined, so nothing else is needed.

## Deploy to the existing Pages project

1. Run `npm run build:pages` with the real `.env`.
2. Cloudflare dashboard → **Workers & Pages** → the existing Pages project
   (currently `skidmark.pages.dev`).
3. **Deployments** → **Create deployment** (or **Upload assets**).
4. Pick **Production**, drop `dist.zip` (or the four files in `dist/`), and
   **Save and deploy**.
5. Open the site, unlock with the PIN, ☰ → **Check database & storage**.

If the project was set up with **Connect to Git** instead of direct upload,
Cloudflare will not offer an upload button. Either point its build settings
at this repo (build command `npm run build`, output directory `dist`, the
three variables above under **Settings → Variables**, `NODE_VERSION=22`), or
create a new direct-upload project and move the custom domain to it.

Renaming the project changes the `*.pages.dev` address; to serve under a
new name, add a custom domain in the project's **Custom domains** tab or
create a new Pages project and upload the same zip.

## Backups

☰ → **Export backup** downloads `vans-warehouse-backup-YYYYMMDD-HHMM.zip`:

```
packages.json      every record (restore reads this)
packages.csv       the same, for a spreadsheet
stickers/<code>.png
photos/<code>.jpg
```

☰ → **Restore** merges a backup into the live list by code: same code is
overwritten, nothing else is deleted. Thumbnails are rebuilt from the photos.
