-- Floorcast — badges for the check-out station.
--
-- SAFE ON A LIVE DATABASE: this only adds one new table. Every box and return
-- is kept. Running it twice is fine.
--
-- Paste this whole file into Supabase → SQL Editor → New query → Run.

begin;

-- One row per person with a lanyard badge. The badge QR holds
-- "VW-BADGE:<badge>". Printing a new badge changes <badge>, so a lost one
-- stops working. Check-outs still save the person's name on the box, exactly
-- like signing your name by hand.
create table if not exists public.employees (
  id         bigint generated always as identity primary key,
  name       text not null check (char_length(btrim(name)) between 1 and 80),
  badge      text not null unique check (badge ~ '^[A-Z0-9]{8,24}$'),
  created_at timestamptz not null default now()
);

alter table public.employees enable row level security;
grant select, insert, update, delete on public.employees to anon, authenticated;

drop policy if exists employees_anon_all on public.employees;
create policy employees_anon_all on public.employees
  for all to anon, authenticated using (true) with check (true);

commit;

-- Check: expect 1.
select count(*) as employees_table
from information_schema.tables
where table_schema = 'public' and table_name = 'employees';
