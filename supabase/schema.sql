-- Floorcast — full schema reset.
--
-- Paste this whole file into Supabase → SQL Editor → New query → Run.
--
-- WARNING: drops public.packages, public.package_moves, public.returns and
-- public.settings and every row in them. To add locations and returns to a
-- database that already has real data, run the files in migrations/ instead
-- (002_locations_returns.sql, then 003_legacy.sql); they keep everything.
-- Run it once to wipe the test data. Running it again wipes again.
-- Files already in the storage buckets are not deleted by this script; the
-- app removes a box's files when you tap Remove. To clear old files, empty
-- the buckets in Storage before running this.

begin;

-- ---------------------------------------------------------------- tables

drop table if exists public.package_moves cascade;
drop table if exists public.returns cascade;
drop table if exists public.packages cascade;
drop table if exists public.settings cascade;

create table public.packages (
  id                    bigint generated always as identity primary key,
  code                  text not null unique check (code = upper(code) and length(code) between 3 and 64),
  job_name              text not null check (length(btrim(job_name)) > 0),
  po_number             text,
  vendor                text,
  delivered_by          text,
  received_by           text,
  pm                    text,
  packing_slip_received boolean,            -- null = not answered
  quantities            text,
  damaged               boolean,            -- null = not answered
  color_tag             text check (color_tag in ('Red','Orange','Yellow','Green','Blue','White','Pink','Black')),
  notes                 text,
  status                text not null default 'on_floor' check (status in ('on_floor','checked_out')),
  received_at           timestamptz not null default now(),
  checked_out_to        text,
  checked_out_at        timestamptz,
  barcode_path          text,               -- barcodes/<code>.png
  photo_path            text,               -- package-photos/<code>/<stamp>.jpg   (~1280px)
  thumb_path            text,               -- package-photos/<code>/<stamp>-t.jpg (320px square)
  last_location         text,               -- Warehouse, Metal shop, Conex 1-4, or typed
  location_at           timestamptz,
  legacy                boolean not null default false, -- here before Floorcast; received_at is approximate
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index packages_status_received_idx on public.packages (status, received_at desc);

create table public.package_moves (
  id            bigint generated always as identity primary key,
  package_code  text not null references public.packages (code) on update cascade on delete cascade,
  from_location text,
  to_location   text not null check (length(btrim(to_location)) > 0),
  moved_by      text,
  moved_at      timestamptz not null default now()
);
create index package_moves_code_idx on public.package_moves (package_code, moved_at desc);

create table public.returns (
  id          bigint generated always as identity primary key,
  code        text not null unique check (code ~ '^V(VR|RS|WR|RR)-[0-9]{4}$'),
  type        text not null check (type in ('vendor','stock','warranty','general')),
  status      text not null default 'open' check (status in ('open','closed')),
  returned_by text,
  vendor      text,
  job_name    text,
  notes       text,
  photo_path  text,               -- package-photos/returns/<code>/<stamp>.jpg
  thumb_path  text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  closed_at   timestamptz,
  closed_by   text,
  close_note  text
);
create index returns_status_created_idx on public.returns (status, created_at desc);

create table public.settings (
  key   text primary key,
  value text not null
);
-- Optional PIN override without a rebuild:
--   insert into public.settings (key, value)
--   values ('shop_pin_hash', encode(extensions.digest('NEW-PIN', 'sha256'), 'hex'))
--   on conflict (key) do update set value = excluded.value;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger packages_set_updated_at
before update on public.packages
for each row execute function public.set_updated_at();

create trigger returns_set_updated_at
before update on public.returns
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------- access
-- No Supabase Auth. The browser uses the anon key behind the shop PIN.

alter table public.packages enable row level security;
alter table public.settings enable row level security;
alter table public.package_moves enable row level security;
alter table public.returns enable row level security;

grant select, insert, update, delete on public.packages to anon, authenticated;
grant select, insert, update, delete on public.package_moves to anon, authenticated;
grant select, insert, update, delete on public.returns to anon, authenticated;
grant select on public.settings to anon, authenticated;

create policy packages_anon_all on public.packages
  for all to anon, authenticated
  using (true) with check (true);

create policy package_moves_anon_all on public.package_moves
  for all to anon, authenticated using (true) with check (true);

create policy returns_anon_all on public.returns
  for all to anon, authenticated using (true) with check (true);

create policy settings_anon_read on public.settings
  for select to anon, authenticated
  using (true);

-- The returns station QR posted in the warehouse carries this token.
-- To retire a printed poster, change it and print a new one:
--   update public.settings set value = encode(extensions.gen_random_bytes(9), 'hex') where key = 'return_station_token';
insert into public.settings (key, value)
values ('return_station_token', encode(extensions.gen_random_bytes(9), 'hex'));

-- ---------------------------------------------------------------- realtime

alter table public.packages replica identity full;
alter table public.package_moves replica identity full;
alter table public.returns replica identity full;

do $$
declare t text;
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
  foreach t in array array['packages', 'package_moves', 'returns'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end
$$;

-- ---------------------------------------------------------------- storage

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('barcodes',       'barcodes',       true, 2097152, array['image/png']),
  ('package-photos', 'package-photos', true, 5242880, array['image/jpeg'])
on conflict (id) do update
  set public = true,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Old policy names from the test build.
drop policy if exists "barcodes_public_read"  on storage.objects;
drop policy if exists "barcodes_anon_insert"  on storage.objects;
drop policy if exists "barcodes_anon_update"  on storage.objects;
drop policy if exists "barcodes_anon_delete"  on storage.objects;
drop policy if exists "photos_public_read"    on storage.objects;
drop policy if exists "photos_anon_insert"    on storage.objects;
drop policy if exists "photos_anon_update"    on storage.objects;
drop policy if exists "photos_anon_delete"    on storage.objects;

drop policy if exists "vw_files_read"   on storage.objects;
drop policy if exists "vw_files_insert" on storage.objects;
drop policy if exists "vw_files_update" on storage.objects;
drop policy if exists "vw_files_delete" on storage.objects;

create policy "vw_files_read" on storage.objects
  for select to anon, authenticated
  using (bucket_id in ('barcodes', 'package-photos'));

create policy "vw_files_insert" on storage.objects
  for insert to anon, authenticated
  with check (bucket_id in ('barcodes', 'package-photos'));

create policy "vw_files_update" on storage.objects
  for update to anon, authenticated
  using (bucket_id in ('barcodes', 'package-photos'))
  with check (bucket_id in ('barcodes', 'package-photos'));

create policy "vw_files_delete" on storage.objects
  for delete to anon, authenticated
  using (bucket_id in ('barcodes', 'package-photos'));

commit;

-- Check: both buckets and the photo columns exist.
select
  (select count(*) from storage.buckets where id in ('barcodes', 'package-photos')) as buckets_ready,  -- expect 2
  (select count(*) from information_schema.columns
     where table_schema = 'public' and table_name = 'packages'
       and column_name in ('photo_path', 'thumb_path'))                                   as photo_columns; -- expect 2
