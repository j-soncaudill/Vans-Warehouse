# Floorcast

The VANS shop's warehouse app.

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
- **Locations**: every box has a last known location (Warehouse, Metal shop,
  Conex 1–4, or anything typed under Other). Receive sets it; **Move** on the
  entry changes it and asks who moved it. The entry shows the full history.
  Lists filter and search by place.
- **Returns**: a returns-only flow. At the warehouse, tap returns → **Start a
  return**, scan the returns station QR posted there, pick a type, and write
  the code it gives on the item. Codes: `VVR-####` return to vendor,
  `VRS-####` return to stock, `VWR-####` warranty, `VRR-####` not sure.
  Photo, name, vendor, job and note are optional. The office changes the
  type (the code stays the same) and closes returns out. Scanning or typing
  a return code anywhere opens it.
- **Entry**: check out (asks who took it), return to floor, edit, retake
  photo (until checkout), save/print sticker, remove (row + sticker + photos).
- **Backup & setup**: export backup, restore backup, database/storage check,
  the "Open the app" poster, the returns station poster, lock this phone.
- **Open the app poster**: a QR of the site's own address. Post it anywhere;
  scanning it with a phone camera opens Floorcast. The app ships a web
  manifest and icons, so **Add to Home Screen** gives it a Floorcast icon and
  opens it full screen like an installed app.

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

**Already running with real data?** Run only
[`supabase/migrations/002_locations_returns.sql`](supabase/migrations/002_locations_returns.sql).
It adds `last_location`/`location_at` to `packages`, the `package_moves` and
`returns` tables, the returns station token in `settings`, and realtime for
the new tables. It never drops anything, and it is safe to run twice. The
last query prints `2, 2, 1` when it worked. Until it is run, the app shows a
"One database update" screen with the SQL to copy.

**Fresh install** (wipes everything): [`supabase/schema.sql`](supabase/schema.sql),
which already includes the update.

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
worked. In the app, Backup & setup → **Check database & storage** shows the same.

There is no Supabase Auth and no user accounts. The anon key is in the page
and the PIN gate is a shop-floor lock, not real security: anyone with the
site URL and some skill can read the list. Do not store personal data.

Returns station poster: Backup & setup → **Returns station** → **Save poster
to print**. Starting a return requires scanning it, so the person has to be at
the warehouse. To retire a printed poster (say a photo of it got passed
around), give the station a new token and print a fresh one:

```sql
update public.settings set value = encode(extensions.gen_random_bytes(9), 'hex')
where key = 'return_station_token';
```

Storage layout:

```
barcodes/<code>.png                       sticker
package-photos/<code>/<stamp>.jpg         full photo
package-photos/<code>/<stamp>-t.jpg       thumbnail
package-photos/returns/<code>/<stamp>.jpg return photo (+ -t.jpg thumbnail)
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

## Deploy to Cloudflare Pages (floorcast.pages.dev)

1. Run `npm run build:pages` with the real `.env`.
2. Cloudflare dashboard → **Workers & Pages** → **Create** → **Pages** →
   **Upload assets**. Project name: `floorcast` (the address becomes
   `floorcast.pages.dev`; if the name is taken Cloudflare suggests another).
   For later updates, open the same project → **Create deployment**.
3. Drop `dist.zip` (or every file in `dist/`) and **Deploy**.
4. Open the site, unlock with the PIN, Backup & setup → **Check database &
   storage**. The PIN unlock is remembered per address, so each phone enters
   it once on the new address.
5. Print the **Open the app** and **Returns station** posters from Backup &
   setup *on the new address* (the app poster encodes the address it's made
   from).

The old `skidmark.pages.dev` project can keep running or be deleted; both
talk to the same Supabase project. No Supabase change is needed for a new
address.

If a project was set up with **Connect to Git** instead of direct upload,
Cloudflare will not offer an upload button. Either point its build settings
at this repo (build command `npm run build`, output directory `dist`, the
three variables above under **Settings → Variables**, `NODE_VERSION=22`), or
use a direct-upload project as above.

Icons: `public/icon-*.png`, `apple-touch-icon.png` and `favicon.png` are made
by `node scripts/make-icons.mjs`; `public/manifest.webmanifest` names the app.

## Backups

Backup & setup → **Export backup** downloads `floorcast-backup-YYYYMMDD-HHMM.zip`:

```
packages.json      every record (restore reads this)
packages.csv       the same, for a spreadsheet
stickers/<code>.png
photos/<code>.jpg
moves.json         location history
returns.json       every return (returns.csv for a spreadsheet)
return-photos/<code>.jpg
```

Backup & setup → **Restore** merges a backup into the live list by code: same code is
overwritten, nothing else is deleted. Thumbnails are rebuilt from the photos.
Each restored box gets exactly the location history in the zip. Returns merge
by code the same way. Older backups without returns or history still restore.
