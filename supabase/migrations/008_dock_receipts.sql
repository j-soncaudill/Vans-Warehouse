-- Floorcast — dock receipts.
--
-- SAFE ON A LIVE DATABASE: this only adds one new table. Every box and return
-- is kept. Running it twice is fine.
--
-- Paste this whole file into Supabase → SQL Editor → New query → Run.

begin;

-- A delivery someone logged while no admin was around to receive it: who
-- logged it (from their badge), a photo of the box, a photo of the packing
-- slip and an optional note. An admin later receives it properly (it becomes
-- a box on the floor) or closes it. Photos live in package-photos/dock/<key>/.
create table if not exists public.dock_receipts (
  id              bigint generated always as identity primary key,
  logged_by       text not null check (char_length(btrim(logged_by)) between 1 and 80),
  note            text check (note is null or char_length(note) <= 500),
  photo_path      text not null,
  thumb_path      text not null,
  slip_photo_path text not null,
  slip_thumb_path text not null,
  status          text not null default 'waiting' check (status in ('waiting', 'received', 'closed')),
  package_code    text,                       -- the box it became, when received
  closed_at       timestamptz,
  created_at      timestamptz not null default now()
);

create index if not exists dock_receipts_status_idx on public.dock_receipts (status, created_at desc);

alter table public.dock_receipts enable row level security;
grant select, insert, update, delete on public.dock_receipts to anon, authenticated;

drop policy if exists dock_receipts_anon_all on public.dock_receipts;
create policy dock_receipts_anon_all on public.dock_receipts
  for all to anon, authenticated using (true) with check (true);

commit;

-- Check: expect 1.
select count(*) as dock_receipts_table
from information_schema.tables
where table_schema = 'public' and table_name = 'dock_receipts';
