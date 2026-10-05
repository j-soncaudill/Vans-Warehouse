-- Van's Warehouse — full schema reset.
--
-- Paste this whole file into Supabase → SQL Editor → New query → Run.
--
-- WARNING: drops public.packages and public.settings and every row in them.
-- Run it once to wipe the test data. Running it again wipes again.
-- Files already in the storage buckets are not deleted by this script; the
-- app removes a box's files when you tap Remove. To clear old files, empty
-- the buckets in Storage before running this.

begin;

-- ---------------------------------------------------------------- tables

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
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index packages_status_received_idx on public.packages (status, received_at desc);

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

-- ---------------------------------------------------------------- access
-- No Supabase Auth. The browser uses the anon key behind the shop PIN.

alter table public.packages enable row level security;
alter table public.settings enable row level security;

grant select, insert, update, delete on public.packages to anon, authenticated;
grant select on public.settings to anon, authenticated;

create policy packages_anon_all on public.packages
  for all to anon, authenticated
  using (true) with check (true);

create policy settings_anon_read on public.settings
  for select to anon, authenticated
  using (true);

-- ---------------------------------------------------------------- realtime

alter table public.packages replica identity full;

do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'packages'
  ) then
    alter publication supabase_realtime add table public.packages;
  end if;
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
